import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  FileSearch, Upload, Loader2, AlertCircle, Check, X, RefreshCw, FileText,
  ArrowDownToLine, ArrowUpFromLine, ChevronRight, Landmark, Calendar,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import * as clientesService from '../services/clientesService';
import * as mapService from '../services/mapeamentoService';
import * as qualityApi from '../services/qualityApiService';
import * as contasBancariasService from '../services/clienteContasBancariasService';
import { formatCurrency } from '../utils/format';

function formatDataBR(s) {
  if (!s) return '—';
  const [y, m, d] = String(s).split('-');
  return y && m && d ? `${d}/${m}/${y}` : s;
}

// OFX usa formato "YYYYMMDDHHMMSS[tz]" em DTPOSTED. Extrai apenas a data.
function parseDtOfx(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// Lê um campo SGML "<TAG>valor" (tolera newline ou outro tag logo depois).
function extractTag(block, tag) {
  const re = new RegExp(`<${tag}>\\s*([^<\\r\\n]+)`, 'i');
  const m = block.match(re);
  return m ? m[1].trim() : null;
}

function parseOfx(text) {
  const bankId = extractTag(text, 'BANKID');
  const branchId = extractTag(text, 'BRANCHID');
  const acctId = extractTag(text, 'ACCTID');
  const acctType = extractTag(text, 'ACCTTYPE');
  const org = extractTag(text, 'ORG');
  const dtStart = parseDtOfx(extractTag(text, 'DTSTART'));
  const dtEnd = parseDtOfx(extractTag(text, 'DTEND'));
  const ledgerBal = extractTag(text, 'BALAMT');

  const transacoes = [];
  const regex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const block = m[1];
    const trntype = (extractTag(block, 'TRNTYPE') || '').toUpperCase();
    const valorNum = Number(extractTag(block, 'TRNAMT'));
    transacoes.push({
      tipo: trntype === 'DEBIT' ? 'debito' : 'credito',
      trntype,
      data: parseDtOfx(extractTag(block, 'DTPOSTED')),
      valor: isFinite(valorNum) ? Math.abs(valorNum) : 0,
      valorRaw: valorNum,
      fitid: extractTag(block, 'FITID'),
      checknum: extractTag(block, 'CHECKNUM'),
      refnum: extractTag(block, 'REFNUM'),
      memo: extractTag(block, 'MEMO') || '',
      name: extractTag(block, 'NAME') || '',
    });
  }

  return { bankId, branchId, acctId, acctType, org, dtStart, dtEnd, ledgerBal, transacoes };
}

function formatBanco(bankId, org) {
  const BANCOS = {
    '756': 'Sicoob',
    '001': 'Banco do Brasil',
    '033': 'Santander',
    '104': 'Caixa',
    '237': 'Bradesco',
    '341': 'Itau',
    '260': 'Nubank',
    '077': 'Inter',
  };
  if (BANCOS[bankId]) return `${BANCOS[bankId]} (${bankId})`;
  if (org) return `${org}${bankId ? ` (${bankId})` : ''}`;
  return bankId || '—';
}

// Matching OFX x sistema: por tipo + valor absoluto + data (janela de tolerancia).
// Cada movimento do sistema so pode ser consumido por 1 transacao do OFX.
function compararOfxComSistema(ofx, movsSistema, toleranciaDias = 1) {
  const restantes = new Set(movsSistema.map((_, i) => i));
  const resultado = ofx.transacoes.map((trn) => {
    const candidatos = [];
    for (const i of restantes) {
      const mv = movsSistema[i];
      if (mv.tipo !== trn.tipo) continue;
      if (Math.abs(mv.valor - trn.valor) > 0.01) continue;
      // Diferenca de dias
      const d1 = new Date(trn.data + 'T00:00:00');
      const d2 = new Date(mv.data + 'T00:00:00');
      const diffDias = Math.abs((d1 - d2) / (1000 * 60 * 60 * 24));
      if (diffDias > toleranciaDias) continue;
      candidatos.push({ idx: i, diffDias });
    }
    if (candidatos.length === 0) return { ...trn, status: 'faltando', match: null };
    // Prefere match com diferenca 0 (mesma data); empate: primeiro que aparecer
    candidatos.sort((a, b) => a.diffDias - b.diffDias);
    const escolhido = candidatos[0];
    restantes.delete(escolhido.idx);
    return {
      ...trn,
      status: escolhido.diffDias === 0 ? 'casada' : 'casada-data',
      match: movsSistema[escolhido.idx],
    };
  });
  const extrasSistema = Array.from(restantes).map(i => movsSistema[i]);
  return { transacoes: resultado, extrasSistema };
}

export default function BpoValidacaoOfx() {
  const [clientes, setClientes] = useState([]);
  const [chavesApi, setChavesApi] = useState([]);
  const [redeId, setRedeId] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [contasClassificadas, setContasClassificadas] = useState([]);
  const [contasQuality, setContasQuality] = useState([]);
  const [contaCodigo, setContaCodigo] = useState('');
  const [arquivo, setArquivo] = useState(null);
  const [ofx, setOfx] = useState(null);
  const [movsSistema, setMovsSistema] = useState([]);
  const [comparacao, setComparacao] = useState(null);
  const [loadingInicial, setLoadingInicial] = useState(true);
  const [loadingContas, setLoadingContas] = useState(false);
  const [loadingDados, setLoadingDados] = useState(false);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [lista, chs] = await Promise.all([
          clientesService.listarClientes(),
          mapService.listarChavesApi(),
        ]);
        const webposto = (lista || []).filter(c => c.usa_webposto && c.chave_api_id && c.empresa_codigo);
        setClientes(webposto);
        const ids = new Set(webposto.map(c => c.chave_api_id));
        setChavesApi((chs || []).filter(ch => ch.ativo !== false && ids.has(ch.id)));
      } catch (err) { setErro(err.message); }
      finally { setLoadingInicial(false); }
    })();
  }, []);

  const empresasDaRede = useMemo(() => {
    if (!redeId) return [];
    return clientes
      .filter(c => c.chave_api_id === redeId && c.status !== 'inativo')
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  }, [redeId, clientes]);

  const cliente = useMemo(() => clientes.find(c => c.id === clienteId) || null, [clientes, clienteId]);

  // Quando selecionar rede, carrega contas classificadas + contas Quality para popular o dropdown
  useEffect(() => {
    if (!redeId) { setContasClassificadas([]); setContasQuality([]); return; }
    (async () => {
      setLoadingContas(true);
      try {
        const chave = chavesApi.find(ch => ch.id === redeId);
        if (!chave) return;
        const [classif, cts] = await Promise.all([
          contasBancariasService.listarPorRede(redeId).catch(() => []),
          qualityApi.buscarContas(chave.chave).catch(() => []),
        ]);
        setContasClassificadas(classif || []);
        setContasQuality(cts || []);
      } finally { setLoadingContas(false); }
    })();
  }, [redeId, chavesApi]);

  useEffect(() => {
    setClienteId('');
    setContaCodigo('');
  }, [redeId]);

  useEffect(() => {
    setContaCodigo('');
    setMovsSistema([]);
    setComparacao(null);
  }, [clienteId]);

  // Contas bancarias elegiveis da empresa selecionada (classif=bancaria ou aplicacao, ativas)
  const contasElegiveis = useMemo(() => {
    if (!cliente?.empresa_codigo) return [];
    const mapaClassif = new Map();
    contasClassificadas.forEach(c => mapaClassif.set(Number(c.conta_codigo), c));
    const resultado = [];
    const vistos = new Set();
    contasQuality.forEach(c => {
      if (Number(c.empresaCodigo) !== Number(cliente.empresa_codigo)) return;
      const codigo = Number(c.contaCodigo ?? c.codigo);
      if (!Number.isFinite(codigo) || vistos.has(codigo)) return;
      const classif = mapaClassif.get(codigo);
      // se tem classificacao, exige que seja bancaria/aplicacao ativa; sem classif = default bancaria (passa)
      if (classif) {
        if (classif.ativo === false) return;
        if (!contasBancariasService.TIPOS_PARA_CONCILIACAO.includes(classif.tipo)) return;
      }
      vistos.add(codigo);
      resultado.push({
        codigo,
        descricao: c.descricao || c.nome || c.contaDescricao || `Conta #${codigo}`,
        tipo: classif?.tipo || 'bancaria',
      });
    });
    return resultado.sort((a, b) => (a.descricao || '').localeCompare(b.descricao || ''));
  }, [cliente, contasClassificadas, contasQuality]);

  const handleFile = async (file) => {
    setErro(null);
    setArquivo(file);
    setOfx(null);
    setComparacao(null);
    setMovsSistema([]);
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseOfx(text);
      if (parsed.transacoes.length === 0) {
        setErro('Arquivo OFX invalido ou sem transacoes (STMTTRN).');
        return;
      }
      setOfx(parsed);
    } catch (err) {
      setErro('Erro ao ler arquivo: ' + err.message);
    }
  };

  const comparar = useCallback(async () => {
    if (!cliente || !contaCodigo || !ofx) return;
    setLoadingDados(true);
    setErro(null);
    try {
      const chave = chavesApi.find(ch => ch.id === cliente.chave_api_id);
      if (!chave) throw new Error('Chave API nao encontrada para a rede');
      const filtros = {
        dataInicial: ofx.dtStart,
        dataFinal: ofx.dtEnd,
        empresaCodigo: cliente.empresa_codigo,
      };
      const movs = await qualityApi.buscarMovimentoConta(chave.chave, filtros);
      const cod = Number(contaCodigo);
      const doSistema = (movs || [])
        .filter(m => Number(m.contaCodigo) === cod)
        .map(m => {
          const isCredito = m.tipo === 'Crédito' || m.tipo === 'Credito' || m.tipo === 'C';
          return {
            id: m.codigo || m.movimentoContaCodigo,
            data: m.dataMovimento,
            tipo: isCredito ? 'credito' : 'debito',
            valor: Math.abs(Number(m.valor || 0)),
            descricao: (m.descricao || '').trim() || '—',
            documento: m.documento || m.numeroDocumento || '',
          };
        });
      setMovsSistema(doSistema);
      setComparacao(compararOfxComSistema(ofx, doSistema));
    } catch (err) {
      setErro('Erro ao buscar movimentos do sistema: ' + err.message);
    } finally {
      setLoadingDados(false);
    }
  }, [cliente, contaCodigo, ofx, chavesApi]);

  const resumo = useMemo(() => {
    if (!comparacao) return null;
    const casadas = comparacao.transacoes.filter(t => t.status === 'casada' || t.status === 'casada-data').length;
    const faltando = comparacao.transacoes.filter(t => t.status === 'faltando').length;
    const extras = comparacao.extrasSistema.length;
    return { total: comparacao.transacoes.length, casadas, faltando, extras };
  }, [comparacao]);

  // Totais agregados: OFX x Sistema (entradas, saidas, liquido)
  const totaisComparativos = useMemo(() => {
    if (!ofx || !comparacao) return null;
    const somar = (arr) => arr.reduce((acc, t) => {
      if (t.tipo === 'credito') acc.entradas += t.valor;
      else acc.saidas += t.valor;
      return acc;
    }, { entradas: 0, saidas: 0 });
    const ofxTot = somar(ofx.transacoes);
    const sisTot = somar(movsSistema);
    return {
      ofx: { ...ofxTot, liquido: ofxTot.entradas - ofxTot.saidas, qtd: ofx.transacoes.length },
      sistema: { ...sisTot, liquido: sisTot.entradas - sisTot.saidas, qtd: movsSistema.length },
      diff: {
        entradas: ofxTot.entradas - sisTot.entradas,
        saidas: ofxTot.saidas - sisTot.saidas,
        liquido: (ofxTot.entradas - ofxTot.saidas) - (sisTot.entradas - sisTot.saidas),
      },
    };
  }, [ofx, comparacao, movsSistema]);

  if (loadingInicial) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>;
  }

  return (
    <div>
      <PageHeader title="Validacao OFX" description="Compare um arquivo OFX bancario com os lancamentos ja registrados no sistema para identificar o que falta lancar" />

      {/* Seletor rede + empresa + conta + upload */}
      <div className="bg-white rounded-xl border border-gray-200/60 p-4 mb-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">1. Rede</label>
            <select value={redeId} onChange={(e) => setRedeId(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
              <option value="">Selecione...</option>
              {chavesApi.map(ch => (
                <option key={ch.id} value={ch.id}>{ch.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">2. Empresa</label>
            <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} disabled={!redeId}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50 disabled:text-gray-400">
              <option value="">{redeId ? 'Selecione...' : 'Escolha a rede primeiro'}</option>
              {empresasDaRede.map(c => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
              3. Conta bancaria {loadingContas && <Loader2 className="inline h-3 w-3 animate-spin ml-1" />}
            </label>
            <select value={contaCodigo} onChange={(e) => setContaCodigo(e.target.value)} disabled={!cliente || loadingContas}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50 disabled:text-gray-400">
              <option value="">{cliente ? (contasElegiveis.length === 0 ? 'Nenhuma conta bancaria' : 'Selecione...') : 'Escolha a empresa primeiro'}</option>
              {contasElegiveis.map(c => (
                <option key={c.codigo} value={c.codigo}>{c.descricao} · {c.tipo}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-gray-100">
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="inline-flex items-center gap-2 h-10 rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              <Upload className="h-4 w-4" /> {arquivo ? 'Trocar arquivo OFX' : 'Selecionar arquivo OFX'}
            </span>
            <input type="file" accept=".ofx,.txt" className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] || null)} />
          </label>
          {arquivo && (
            <p className="text-xs text-gray-500">
              <FileText className="inline h-3.5 w-3.5 mr-1 text-gray-400" />
              {arquivo.name} · {(arquivo.size / 1024).toFixed(1)} KB
            </p>
          )}
          <button onClick={comparar} disabled={!ofx || !contaCodigo || loadingDados}
            className="ml-auto flex items-center gap-2 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 px-5 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {loadingDados ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Comparar com sistema
          </button>
        </div>
      </div>

      {erro && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">{erro}</p>
        </div>
      )}

      {/* Card de resumo do OFX */}
      {ofx && (
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mb-4">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <FileSearch className="h-4 w-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-gray-800">Arquivo OFX</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 p-5 text-sm">
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Banco</p>
              <p className="font-medium text-gray-900">{formatBanco(ofx.bankId, ofx.org)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Agencia</p>
              <p className="font-mono text-gray-900">{ofx.branchId || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Conta</p>
              <p className="font-mono text-gray-900">{ofx.acctId || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Periodo</p>
              <p className="font-mono text-gray-900 text-[12px]">{formatDataBR(ofx.dtStart)} a {formatDataBR(ofx.dtEnd)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Transacoes</p>
              <p className="font-semibold text-gray-900">{ofx.transacoes.length}</p>
            </div>
          </div>
        </div>
      )}

      {/* Resumo da comparacao (KPIs) */}
      {resumo && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-5">
          <Kpi label="OFX" valor={resumo.total} icon={FileText} color="blue" raw hint="transacoes no arquivo" />
          <Kpi label="Lancadas" valor={resumo.casadas} icon={Check} color="emerald" raw
            hint={`${resumo.total > 0 ? ((resumo.casadas / resumo.total) * 100).toFixed(0) : 0}% do OFX`} />
          <Kpi label="Faltando lancar" valor={resumo.faltando} icon={AlertCircle} color="red" raw
            hint="no OFX mas nao no sistema" />
          <Kpi label="Extras no sistema" valor={resumo.extras} icon={ChevronRight} color="amber" raw
            hint="no sistema mas nao no OFX" />
        </div>
      )}

      {/* Comparativo de totais OFX x Sistema */}
      {totaisComparativos && (
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mb-5">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <FileSearch className="h-4 w-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-gray-800">Totais: OFX x Sistema</h3>
            <span className="text-[11px] text-gray-400">
              · diferenca positiva = OFX maior · diferenca negativa = Sistema maior
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 border-b border-gray-100">
                <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-2.5"></th>
                  <th className="px-4 py-2.5 text-right">OFX</th>
                  <th className="px-4 py-2.5 text-right">Sistema</th>
                  <th className="px-4 py-2.5 text-right">Diferenca (OFX - Sistema)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr className="hover:bg-gray-50/60">
                  <td className="px-4 py-2.5 text-[12.5px]">
                    <span className="inline-flex items-center gap-1.5 font-medium text-gray-800">
                      <ArrowDownToLine className="h-3.5 w-3.5 text-emerald-600" /> Entradas
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[13px] text-emerald-700 font-semibold">
                    +{formatCurrency(totaisComparativos.ofx.entradas)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[13px] text-emerald-700 font-semibold">
                    +{formatCurrency(totaisComparativos.sistema.entradas)}
                  </td>
                  <td className={`px-4 py-2.5 text-right font-mono tabular-nums text-[13px] font-semibold ${
                    Math.abs(totaisComparativos.diff.entradas) < 0.01
                      ? 'text-gray-400' : totaisComparativos.diff.entradas > 0 ? 'text-blue-700' : 'text-amber-700'
                  }`}>
                    {Math.abs(totaisComparativos.diff.entradas) < 0.01
                      ? '✓ bate'
                      : `${totaisComparativos.diff.entradas > 0 ? '+' : ''}${formatCurrency(totaisComparativos.diff.entradas)}`}
                  </td>
                </tr>
                <tr className="hover:bg-gray-50/60">
                  <td className="px-4 py-2.5 text-[12.5px]">
                    <span className="inline-flex items-center gap-1.5 font-medium text-gray-800">
                      <ArrowUpFromLine className="h-3.5 w-3.5 text-red-600" /> Saidas
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[13px] text-red-700 font-semibold">
                    -{formatCurrency(totaisComparativos.ofx.saidas)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[13px] text-red-700 font-semibold">
                    -{formatCurrency(totaisComparativos.sistema.saidas)}
                  </td>
                  <td className={`px-4 py-2.5 text-right font-mono tabular-nums text-[13px] font-semibold ${
                    Math.abs(totaisComparativos.diff.saidas) < 0.01
                      ? 'text-gray-400' : totaisComparativos.diff.saidas > 0 ? 'text-blue-700' : 'text-amber-700'
                  }`}>
                    {Math.abs(totaisComparativos.diff.saidas) < 0.01
                      ? '✓ bate'
                      : `${totaisComparativos.diff.saidas > 0 ? '+' : ''}${formatCurrency(totaisComparativos.diff.saidas)}`}
                  </td>
                </tr>
                <tr className="bg-gray-50/40 font-semibold">
                  <td className="px-4 py-2.5 text-[12.5px] text-gray-800">Liquido (Entradas - Saidas)</td>
                  <td className={`px-4 py-2.5 text-right font-mono tabular-nums text-[13px] ${totaisComparativos.ofx.liquido >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {totaisComparativos.ofx.liquido >= 0 ? '+' : ''}{formatCurrency(totaisComparativos.ofx.liquido)}
                  </td>
                  <td className={`px-4 py-2.5 text-right font-mono tabular-nums text-[13px] ${totaisComparativos.sistema.liquido >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {totaisComparativos.sistema.liquido >= 0 ? '+' : ''}{formatCurrency(totaisComparativos.sistema.liquido)}
                  </td>
                  <td className={`px-4 py-2.5 text-right font-mono tabular-nums text-[13px] ${
                    Math.abs(totaisComparativos.diff.liquido) < 0.01
                      ? 'text-gray-400' : totaisComparativos.diff.liquido > 0 ? 'text-blue-700' : 'text-amber-700'
                  }`}>
                    {Math.abs(totaisComparativos.diff.liquido) < 0.01
                      ? '✓ bate'
                      : `${totaisComparativos.diff.liquido > 0 ? '+' : ''}${formatCurrency(totaisComparativos.diff.liquido)}`}
                  </td>
                </tr>
                <tr className="text-[11px] text-gray-500">
                  <td className="px-4 py-1.5">Qtd. de transacoes</td>
                  <td className="px-4 py-1.5 text-right font-mono tabular-nums">{totaisComparativos.ofx.qtd}</td>
                  <td className="px-4 py-1.5 text-right font-mono tabular-nums">{totaisComparativos.sistema.qtd}</td>
                  <td className="px-4 py-1.5 text-right font-mono tabular-nums">
                    {totaisComparativos.ofx.qtd - totaisComparativos.sistema.qtd > 0 ? '+' : ''}
                    {totaisComparativos.ofx.qtd - totaisComparativos.sistema.qtd}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tabela principal: transacoes OFX x status */}
      {comparacao && (
        <>
          <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mb-5">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
              <FileSearch className="h-4 w-4 text-blue-500" />
              <h3 className="text-sm font-semibold text-gray-800">Transacoes do OFX</h3>
              <span className="text-[11px] text-gray-400">· {comparacao.transacoes.length} registros</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/80 border-b border-gray-100">
                  <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Data</th>
                    <th className="px-4 py-2.5">Descricao (OFX)</th>
                    <th className="px-4 py-2.5">Doc.</th>
                    <th className="px-4 py-2.5 text-right">Valor</th>
                    <th className="px-4 py-2.5">Correspondente no sistema</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {comparacao.transacoes.map((t, i) => (
                    <tr key={t.fitid || i} className={`${t.status === 'faltando' ? 'bg-red-50/40' : ''} hover:bg-blue-50/30 transition-colors`}>
                      <td className="px-4 py-2">
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="px-4 py-2 text-[12px] text-gray-700 font-mono tabular-nums">{formatDataBR(t.data)}</td>
                      <td className="px-4 py-2 text-[12px] text-gray-800 max-w-[320px]">
                        <p className="truncate">{t.memo || '—'}</p>
                        {t.name && <p className="text-[10.5px] text-gray-400 truncate">{t.name}</p>}
                      </td>
                      <td className="px-4 py-2 text-[11px] text-gray-500 font-mono">{t.checknum && t.checknum !== '0' ? t.checknum : (t.refnum || '—')}</td>
                      <td className="px-4 py-2 text-right font-mono text-[12.5px] tabular-nums">
                        <span className={t.tipo === 'credito' ? 'text-emerald-600 font-semibold' : 'text-red-600 font-semibold'}>
                          {t.tipo === 'credito' ? '+' : '-'}{formatCurrency(t.valor)}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-[11.5px] text-gray-700 max-w-[320px]">
                        {t.match ? (
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] text-gray-400 tabular-nums flex-shrink-0">{formatDataBR(t.match.data)}</span>
                            <span className="truncate">{t.match.descricao}</span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-red-700">— nao encontrado —</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Extras: movimentos do sistema que nao bateram com o OFX */}
          {comparacao.extrasSistema.length > 0 && (
            <div className="bg-white rounded-2xl border border-amber-200/60 shadow-sm overflow-hidden mb-5">
              <div className="px-5 py-3 border-b border-amber-100 bg-amber-50/40 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <h3 className="text-sm font-semibold text-amber-800">Movimentos no sistema sem correspondencia no OFX</h3>
                <span className="text-[11px] text-amber-600">· {comparacao.extrasSistema.length} registros</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50/80 border-b border-gray-100">
                    <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                      <th className="px-4 py-2.5">Data</th>
                      <th className="px-4 py-2.5">Descricao (sistema)</th>
                      <th className="px-4 py-2.5">Doc.</th>
                      <th className="px-4 py-2.5 text-right">
                        <span className="inline-flex items-center gap-1 text-emerald-700"><ArrowDownToLine className="h-3 w-3" /> Entrada</span>
                      </th>
                      <th className="px-4 py-2.5 text-right">
                        <span className="inline-flex items-center gap-1 text-red-700"><ArrowUpFromLine className="h-3 w-3" /> Saida</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {comparacao.extrasSistema.map((m) => (
                      <tr key={m.id} className="hover:bg-amber-50/40 transition-colors">
                        <td className="px-4 py-2 text-[12px] text-gray-700 font-mono tabular-nums">{formatDataBR(m.data)}</td>
                        <td className="px-4 py-2 text-[12px] text-gray-800 max-w-[420px] truncate">{m.descricao}</td>
                        <td className="px-4 py-2 text-[11px] text-gray-500 font-mono">{m.documento || '—'}</td>
                        <td className="px-4 py-2 text-right font-mono text-[12px] tabular-nums">
                          {m.tipo === 'credito' ? <span className="text-emerald-600 font-semibold">{formatCurrency(m.valor)}</span> : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-[12px] tabular-nums">
                          {m.tipo === 'debito' ? <span className="text-red-600 font-semibold">{formatCurrency(m.valor)}</span> : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {!ofx && !erro && (
        <div className="bg-white rounded-2xl border border-gray-200/60 px-6 py-16 text-center shadow-sm">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/20">
            <FileSearch className="h-7 w-7 text-white" />
          </div>
          <p className="text-sm font-semibold text-gray-900 mb-1">Envie um arquivo OFX para validar</p>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            Selecione a rede, a empresa e a conta bancaria; em seguida envie o OFX do banco.
            A pagina vai cruzar as transacoes do arquivo com os movimentos ja registrados no periodo.
          </p>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  if (status === 'casada') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <Check className="h-2.5 w-2.5" /> Lancada
      </span>
    );
  }
  if (status === 'casada-data') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"
        title="Lancada mas com data diferente do OFX">
        <Check className="h-2.5 w-2.5" /> Lancada*
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200">
      <X className="h-2.5 w-2.5" /> Faltando
    </span>
  );
}

function Kpi({ label, valor, icon: Icon, color, raw, hint }) {
  const colors = {
    blue:    'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    red:     'bg-red-50 text-red-600',
    amber:   'bg-amber-50 text-amber-600',
  };
  return (
    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl border border-gray-200/60 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">{label}</p>
        <div className={`h-7 w-7 rounded-md flex items-center justify-center ${colors[color]}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <p className={`font-bold text-gray-900 tabular-nums ${raw ? 'text-xl' : 'text-lg'}`}>{valor}</p>
      {hint && <p className="text-[10px] text-gray-400 mt-0.5">{hint}</p>}
    </motion.div>
  );
}
