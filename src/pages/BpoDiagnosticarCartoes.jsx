import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Stethoscope, Loader2, AlertCircle, Building2, UploadCloud, FileText,
  CheckCircle2, XCircle, RefreshCw, X, ChevronRight, User,
} from 'lucide-react';
import * as clientesService from '../services/clientesService';
import * as mapService from '../services/mapeamentoService';
import * as autosystemService from '../services/autosystemService';
import SeletorRedeBPO from '../components/ui/SeletorRedeBPO';
import { formatCurrency } from '../utils/format';

// ─── Helpers de datas ─────────────────────────────────────────
function ymd(d) { return d.toISOString().split('T')[0]; }
function hojeStr() { return ymd(new Date()); }
function inicioMesStr() { const d = new Date(); return ymd(new Date(d.getFullYear(), d.getMonth(), 1)); }

// ─── Parser de CSV (robusto a `;`/`,`/tab, aspas e BOM) ────────
function detectarDelimitador(primeiraLinha) {
  const cands = [';', ',', '\t', '|'];
  let melhor = ';', max = -1;
  cands.forEach(d => { const n = primeiraLinha.split(d).length; if (n > max) { max = n; melhor = d; } });
  return melhor;
}

function parseCSV(texto) {
  let t = String(texto || ''); if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1); // remove BOM
  t = t.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const primeiraLinha = (t.split('\n').find(l => l.trim().length > 0)) || '';
  const delim = detectarDelimitador(primeiraLinha);

  const linhas = [];
  let campo = '', linha = [], dentroAspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (dentroAspas) {
      if (c === '"') { if (t[i + 1] === '"') { campo += '"'; i++; } else dentroAspas = false; }
      else campo += c;
    } else if (c === '"') dentroAspas = true;
    else if (c === delim) { linha.push(campo); campo = ''; }
    else if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
    else campo += c;
  }
  if (campo.length > 0 || linha.length > 0) { linha.push(campo); linhas.push(linha); }

  const limpas = linhas.filter(l => l.some(v => String(v).trim().length > 0));
  if (limpas.length === 0) return { headers: [], rows: [] };
  const headers = limpas[0].map(h => String(h).trim());
  const rows = limpas.slice(1).map(l => headers.map((_, idx) => String(l[idx] ?? '').trim()));
  return { headers, rows };
}

// "1.234,56" | "1234.56" | "R$ 1.234,56" → number
function parseValorBR(s) {
  if (s == null) return null;
  let v = String(s).replace(/[^\d.,-]/g, '').trim();
  if (!v) return null;
  const temVirgula = v.includes(','), temPonto = v.includes('.');
  if (temVirgula && temPonto) v = v.replace(/\./g, '').replace(',', '.');
  else if (temVirgula) v = v.replace(',', '.');
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const semAcento = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Normaliza bandeira (VISA, MASTERCARD, ELO...): maiúsculas, sem acento/espaços extras.
function normBandeira(s) { return semAcento(s).replace(/\s+/g, ' ').trim().toUpperCase(); }

// Normaliza modalidade por TIPO-BASE. No sistema não há separação fina: uma
// conta é "crédito" ou "débito". A Equals detalha (Crédito à Vista, Pré-Pago
// Crédito, Débito à Vista, Cartão de benefícios). Pré-pago = crédito e
// PARCELADO (loja/emissor) = crédito. Assim o que o sistema marca como crédito
// casa com "crédito à vista", "pré-pago crédito" e "parcelado".
function normModalidade(s) {
  const v = semAcento(s);
  if (/deb/.test(v)) return 'DEBITO';
  if (/cred|pre.?pago|parcel/.test(v)) return 'CREDITO';
  if (/benefic|vale|aliment|refei/.test(v)) return 'BENEFICIO';
  return normBandeira(s); // fallback: texto normalizado
}

// A modalidade da Equals indica venda parcelada? (Parcelado Loja/Emissor…)
function textoIndicaParcelado(s) { return /parcel/.test(semAcento(s)); }

// Autorização/NSU: só dígitos e letras, sem zeros à esquerda ("000123" == "123").
function normAutorizacao(s) {
  const v = String(s || '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
  return v.replace(/^0+(?=\d)/, '');
}

// O sistema fatia o cartão parcelado em N lançamentos e adiciona "/1", "/2"… ao
// documento (autorização). Extrai a autorização-base e o nº da parcela.
// Ex.: "327811/3" → { base: "327811", parcela: 3 }.
function parseDocParcela(doc) {
  const s = String(doc || '').trim();
  const m = s.match(/^(.*)\/(\d{1,3})$/);
  if (m && m[1]) return { base: m[1], parcela: Number(m[2]) };
  return { base: s, parcela: null };
}

function adivinharColuna(headers, chaves) {
  for (const chave of chaves) {
    const idx = headers.findIndex(h => semAcento(h).includes(chave));
    if (idx >= 0) return String(idx);
  }
  return '';
}

export default function BpoDiagnosticarCartoes() {
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [chavesApi, setChavesApi] = useState([]);
  const [redesAutosystem, setRedesAutosystem] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [redeSel, setRedeSel] = useState(null);
  const [empresaId, setEmpresaId] = useState('');
  const [dataDe, setDataDe] = useState(inicioMesStr());
  const [dataAte, setDataAte] = useState(hojeStr());

  const [csv, setCsv] = useState(null); // { nome, headers, rows }
  // Mapeamento de colunas. Chave: adquirente · bandeira · modalidade · autorização · valor (bruto).
  const COLS_VAZIO = { adquirente: '', bandeira: '', modalidade: '', autorizacao: '', valor: '', parcelas: '' };
  const [cols, setCols] = useState(COLS_VAZIO);
  const fileRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setLoadingMeta(true);
        const [chvs, todosClientes, redesAS] = await Promise.all([
          mapService.listarChavesApi(),
          clientesService.listarClientes(),
          autosystemService.listarRedes().catch(() => []),
        ]);
        setChavesApi(chvs || []);
        setClientes(todosClientes || []);
        setRedesAutosystem(redesAS || []);
      } catch (err) { setError(err.message); }
      finally { setLoadingMeta(false); }
    })();
  }, []);

  const empresasDaRede = useMemo(() => {
    if (!redeSel || redeSel.tipo !== 'autosystem') return [];
    return (clientes || [])
      .filter(c => c.as_rede_id === redeSel.id && c.empresa_codigo != null && c.status === 'ativo')
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  }, [clientes, redeSel]);

  const empresaSel = useMemo(
    () => empresasDaRede.find(e => e.id === empresaId) || null,
    [empresasDaRede, empresaId],
  );

  const setCol = (campo, idx) => { setCols(p => ({ ...p, [campo]: idx })); setResultado(null); };

  const onArquivo = useCallback((file) => {
    if (!file) return;
    setResultado(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        // Decodifica UTF-8; se vier lixo (�), tenta windows-1252 (padrão de export BR).
        const buf = e.target.result;
        let texto = new TextDecoder('utf-8').decode(buf);
        if (texto.includes('�')) {
          try { texto = new TextDecoder('windows-1252').decode(buf); } catch { /* mantém utf-8 */ }
        }
        const { headers, rows } = parseCSV(texto);
        if (headers.length === 0) { setError('CSV vazio ou ilegível.'); return; }
        setCsv({ nome: file.name, headers, rows });
        setCols({
          adquirente:  adivinharColuna(headers, ['adquirente', 'credenciadora', 'rede']),
          bandeira:    adivinharColuna(headers, ['bandeira', 'produto']),
          modalidade:  adivinharColuna(headers, ['modalidade', 'tipo', 'debito', 'credito']),
          autorizacao: adivinharColuna(headers, ['autorizacao', 'autorizac', 'codigo autorizacao']),
          valor:       adivinharColuna(headers, ['valor bruto', 'bruto', 'valor da venda', 'valor']),
          parcelas:    adivinharColuna(headers, ['qtd parcela', 'qtde parcela', 'total parcela', 'num parcela', 'parcela']),
        });
        setError(null);
      } catch (err) { setError('Falha ao ler o CSV: ' + err.message); }
    };
    reader.onerror = () => setError('Não foi possível ler o arquivo.');
    reader.readAsArrayBuffer(file);
  }, []);

  // Transações da Equals (lista normalizada + chave de conferência)
  const equalsTx = useMemo(() => {
    const { adquirente, bandeira, modalidade, autorizacao, valor, parcelas } = cols;
    if (!csv || valor === '' || autorizacao === '') return null;
    const qi = adquirente === '' ? -1 : Number(adquirente);
    const bi = bandeira === '' ? -1 : Number(bandeira);
    const mi = modalidade === '' ? -1 : Number(modalidade);
    const ai = Number(autorizacao), vi = Number(valor);
    const pi = parcelas === '' ? -1 : Number(parcelas);
    const mapeouMeta = qi >= 0 || bi >= 0 || mi >= 0;
    const ehVazio = s => !/[a-z0-9]/i.test(String(s || '')); // '', '-', '—' → vazio
    const lista = [];
    let ignoradas = 0;
    csv.rows.forEach((r) => {
      const v = parseValorBR(r[vi]);
      const aut = normAutorizacao(r[ai]);
      if (v == null || !aut) { ignoradas++; return; }
      // Linha TOTALIZADORA do relatório: tem valor mas nenhum dado de cartão.
      if (mapeouMeta && ehVazio(r[qi]) && ehVazio(r[bi]) && ehVazio(r[mi])) { ignoradas++; return; }
      const adq = qi >= 0 ? normBandeira(r[qi]) : '';
      const band = bi >= 0 ? normBandeira(r[bi]) : '';
      const modal = mi >= 0 ? normModalidade(r[mi]) : '';
      // Parcelado? Pela coluna de parcelas (>1) ou pelo texto da modalidade ("Parcelado…").
      const nParc = pi >= 0 ? (parseInt(String(r[pi]).replace(/[^\d]/g, ''), 10) || 0) : 0;
      const parceladoEquals = nParc > 1 || (mi >= 0 && textoIndicaParcelado(r[mi]));
      lista.push({ adquirente: adq, bandeira: band, modalidade: modal, autorizacao: aut, valor: v, parceladoEquals, parcelasEquals: nParc || null, key: `${adq}|${band}|${modal}|${aut}|${v.toFixed(2)}` });
    });
    const total = lista.reduce((s, t) => s + t.valor, 0);
    return { lista, total, ignoradas };
  }, [csv, cols]);

  const podeDiagnosticar = redeSel?.tipo === 'autosystem' && empresaId && dataDe && dataAte && equalsTx;

  const diagnosticar = useCallback(async () => {
    if (!podeDiagnosticar) return;
    setLoading(true); setError(null); setResultado(null);
    try {
      // 1) Contas de cartão configuradas (Editar rede → Empresas → Contas de cartão).
      const contasCartao = await autosystemService.listarContasCartaoRede(redeSel.id);
      const cfgPorConta = new Map();
      contasCartao.forEach(c => cfgPorConta.set(String(c.codigo).trim(), c));
      const codigosCartao = [...cfgPorConta.keys()];
      if (codigosCartao.length === 0) {
        setResultado({ semConfig: true, totalEquals: equalsTx.lista.length });
        return;
      }

      // 2) Lançamentos do movto nessas contas (o edge traz `documento` = autorização).
      const lancs = await autosystemService.buscarLancamentosAutosystem(
        redeSel.id, [empresaSel.empresa_codigo],
        { data_de: dataDe, data_ate: dataAte, contas_codigos: codigosCartao },
      );

      // 3) Cada lançamento vira uma transação do sistema (adquirente/bandeira/modalidade
      //    da conta marcada; autorização = documento; valor = valor). O documento
      //    do parcelado vem como "327811/1", "327811/2"… — guardamos a base e a parcela.
      const sistemaRaw = [];
      let semDocumento = 0;
      (lancs || []).forEach(l => {
        const deb = String(l.debito_codigo ?? '').trim();
        // Só considera o lançamento quando a conta de cartão está no DÉBITO.
        const cfg = cfgPorConta.get(deb);
        if (!cfg) return;
        // ...e a contrapartida (crédito) precisa ser conta de ativo (começa com "1").
        const cred = String(l.credito_codigo ?? '').trim();
        if (!cred.startsWith('1')) return;
        const { base, parcela } = parseDocParcela(l.documento);
        const aut = normAutorizacao(base);
        const valor = Number(l.valor) || 0;
        if (!aut) { semDocumento++; return; }
        const adq = normBandeira(cfg.adquirente || '');
        const band = normBandeira(cfg.bandeira || '');
        const modal = normModalidade(cfg.modalidade || '');
        sistemaRaw.push({
          adquirente: adq, bandeira: band, modalidade: modal, autorizacao: aut, parcela, valor,
          conta: cfg.codigo, contaNome: cfg.nome, data: l.data, turno: l.turno,
          documento: l.documento || '', obs: (l.obs || '').trim(), pessoa: l.pessoa_nome || '',
          funcionario: (l.usuario_nome || '').trim(), usuario: (l.usuario || '').trim(),
          responsavel: (l.responsavel_nome || '').trim(),
        });
      });

      // 3b) Consolida as parcelas: lançamentos com a MESMA base de autorização
      //     (mesmo adquirente/bandeira/modalidade) viram UMA transação com o valor
      //     somado. Assim "327811/1..3" (3×100) casa com a Equals "327811" (300).
      const gruposSis = new Map();
      sistemaRaw.forEach(t => {
        const gk = `${t.adquirente}|${t.bandeira}|${t.modalidade}|${t.autorizacao}`;
        const g = gruposSis.get(gk) || [];
        g.push(t); gruposSis.set(gk, g);
      });
      const sistemaTx = [];
      gruposSis.forEach(membros => {
        const parcelado = membros.length > 1;
        const valorTotal = membros.reduce((s, m) => s + m.valor, 0);
        const f = membros[0];
        // Funcionário(s) que lançaram e responsável(is) pelo PDV/turno (fallback
        // quando não há funcionário — ex.: frentista não é o responsável).
        const funcs = [...new Set(membros.map(m => m.funcionario).filter(Boolean))];
        const resps = [...new Set(membros.map(m => m.responsavel).filter(Boolean))];
        sistemaTx.push({
          adquirente: f.adquirente, bandeira: f.bandeira, modalidade: f.modalidade,
          autorizacao: f.autorizacao, valor: valorTotal,
          parcelas: membros.length, parceladoSistema: parcelado,
          conta: f.conta, contaNome: f.contaNome, data: f.data, turno: f.turno,
          documento: parcelado ? `${f.autorizacao} (${membros.length}x)` : (f.documento || ''),
          obs: f.obs, pessoa: f.pessoa, membros,
          funcionario: funcs.join(', '), responsavel: resps.join(', '), usuario: f.usuario,
          key: `${f.adquirente}|${f.bandeira}|${f.modalidade}|${f.autorizacao}|${valorTotal.toFixed(2)}`,
        });
      });

      // 4) Conciliação por chave.
      const idxSis = new Map();
      sistemaTx.forEach(t => { const arr = idxSis.get(t.key) || []; arr.push(t); idxSis.set(t.key, arr); });
      const conciliadas = [], soEquals = [];
      equalsTx.lista.forEach(e => {
        const arr = idxSis.get(e.key);
        if (arr && arr.length) conciliadas.push({ equals: e, sistema: arr.shift() });
        else soEquals.push(e);
      });
      const soSistema = [];
      idxSis.forEach(arr => arr.forEach(t => soSistema.push(t)));

      // 5) PROVÁVEIS conciliações: dos restantes, casa quando SÓ um (ou um par
      //    específico) dos campos diverge, mantendo o resto igual. Cada padrão
      //    define a "chave em comum" (campos que devem bater) e o `difere`
      //    (o que precisa estar diferente). Processa do mais confiável (1 campo)
      //    para o menos (bandeira + tipo). O adquirente sempre precisa bater.
      const v2 = t => t.valor.toFixed(2);
      const PADROES_PROVAVEL = [
        { motivo: 'valor',       label: 'Valor diferente',
          chave: t => `${t.adquirente}|${t.bandeira}|${t.modalidade}|${t.autorizacao}`,
          difere: (e, s) => v2(e) !== v2(s) },
        { motivo: 'autorizacao', label: 'Autorização diferente',
          chave: t => `${t.adquirente}|${t.bandeira}|${t.modalidade}|${v2(t)}`,
          difere: (e, s) => e.autorizacao !== s.autorizacao },
        { motivo: 'bandeira',    label: 'Bandeira diferente',
          chave: t => `${t.adquirente}|${t.modalidade}|${t.autorizacao}|${v2(t)}`,
          difere: (e, s) => e.bandeira !== s.bandeira },
        { motivo: 'modalidade',  label: 'Tipo diferente',
          chave: t => `${t.adquirente}|${t.bandeira}|${t.autorizacao}|${v2(t)}`,
          difere: (e, s) => e.modalidade !== s.modalidade },
        { motivo: 'bandeira_modalidade', label: 'Bandeira e tipo diferentes',
          chave: t => `${t.adquirente}|${t.autorizacao}|${v2(t)}`,
          difere: (e, s) => e.bandeira !== s.bandeira && e.modalidade !== s.modalidade },
      ];

      let restEquals = soEquals.slice();
      let restSistema = soSistema.slice();
      const provaveis = [];
      PADROES_PROVAVEL.forEach(padrao => {
        const idx = new Map();
        restSistema.forEach((s, i) => {
          const k = padrao.chave(s);
          const arr = idx.get(k) || []; arr.push(i); idx.set(k, arr);
        });
        const sisUsado = new Set(), eqUsado = new Set();
        restEquals.forEach((e, ei) => {
          const arr = idx.get(padrao.chave(e));
          if (!arr) return;
          for (const si of arr) {
            if (sisUsado.has(si)) continue;
            if (padrao.difere(e, restSistema[si])) {
              provaveis.push({ equals: e, sistema: restSistema[si], motivo: padrao.motivo, motivoLabel: padrao.label });
              sisUsado.add(si); eqUsado.add(ei);
              break;
            }
          }
        });
        restEquals = restEquals.filter((_, i) => !eqUsado.has(i));
        restSistema = restSistema.filter((_, i) => !sisUsado.has(i));
      });
      const soEqualsFinal = restEquals;
      const soSistemaFinal = restSistema;

      // 6) ALERTAS de parcelamento: onde o sistema fatiou (parceladoSistema) mas a
      //    Equals NÃO indica parcelamento → o sistema parcelou um cartão que não é
      //    parcelado. (E o inverso: Equals parcelada mas o sistema não fatiou.)
      const alertasParcelamento = [];
      [...conciliadas, ...provaveis].forEach(par => {
        const { sistema: s, equals: e } = par;
        if (s.parceladoSistema && !e.parceladoEquals) {
          alertasParcelamento.push({ tipo: 'sistema-parcelou', equals: e, sistema: s });
        } else if (!s.parceladoSistema && e.parceladoEquals) {
          alertasParcelamento.push({ tipo: 'equals-parcelou', equals: e, sistema: s });
        }
      });

      setResultado({
        totalEquals: equalsTx.lista.length,
        totalSistema: sistemaTx.length,
        conciliadas, provaveis, soEquals: soEqualsFinal, soSistema: soSistemaFinal, semDocumento,
        alertasParcelamento,
        valorEquals: equalsTx.total,
        valorSistema: sistemaTx.reduce((s, t) => s + t.valor, 0),
      });
    } catch (err) { setError(err.message || 'Falha ao diagnosticar.'); }
    finally { setLoading(false); }
  }, [podeDiagnosticar, equalsTx, redeSel, empresaSel, dataDe, dataAte]);

  if (loadingMeta) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>;

  const MAP_FIELDS = [
    { campo: 'adquirente', label: 'Adquirente', cor: 'bg-sky-50 text-sky-700' },
    { campo: 'bandeira', label: 'Bandeira', cor: 'bg-purple-50 text-purple-700' },
    { campo: 'modalidade', label: 'Modalidade (déb/créd)', cor: 'bg-amber-50 text-amber-700' },
    { campo: 'autorizacao', label: 'Autorização *', cor: 'bg-blue-50 text-blue-700' },
    { campo: 'valor', label: 'Valor bruto *', cor: 'bg-emerald-50 text-emerald-700' },
    { campo: 'parcelas', label: 'Parcelas', cor: 'bg-indigo-50 text-indigo-700' },
  ];
  const corColuna = (i) => {
    const f = MAP_FIELDS.find(x => String(cols[x.campo]) === String(i));
    return f ? f.cor : '';
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Stethoscope className="h-4 w-4 text-blue-600" />
          <h3 className="text-sm font-semibold text-gray-800">Diagnóstico de cartões — Sistema (Autosystem) × Equals</h3>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Rede</label>
          <SeletorRedeBPO chavesApi={chavesApi} redesAutosystem={redesAutosystem}
            value={redeSel} onChange={(r) => { setRedeSel(r); setEmpresaId(''); setResultado(null); }}
            placeholder="Selecione uma rede Autosystem..." />
          {redeSel?.tipo === 'webposto' && (
            <p className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
              Nesta primeira versão o diagnóstico é só para redes Autosystem.
            </p>
          )}
        </div>
        {empresasDaRede.length > 0 && (
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Empresa</label>
            <div className="flex flex-wrap gap-2">
              {empresasDaRede.map(e => (
                <button key={e.id} onClick={() => { setEmpresaId(e.id); setResultado(null); }}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                    empresaId === e.id ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}>
                  <Building2 className="h-3 w-3" /> {e.nome}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="w-44">
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">De</label>
            <input type="date" value={dataDe} onChange={(e) => setDataDe(e.target.value)}
              className="w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </div>
          <div className="w-44">
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Até</label>
            <input type="date" value={dataAte} onChange={(e) => setDataAte(e.target.value)}
              className="w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </div>
        </div>
      </div>

      {/* Upload do CSV da Equals */}
      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-800">Extrato da Equals (CSV)</h3>
          {csv && (
            <button onClick={() => { setCsv(null); setCols(COLS_VAZIO); setResultado(null); if (fileRef.current) fileRef.current.value = ''; }}
              className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-800">
              <X className="h-3.5 w-3.5" /> Remover
            </button>
          )}
        </div>

        {!csv ? (
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl px-6 py-8 cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors">
            <UploadCloud className="h-7 w-7 text-gray-400" />
            <span className="text-sm text-gray-600">Arraste ou clique para enviar o CSV baixado do portal da Equals</span>
            <span className="text-[11px] text-gray-400">Detecta o separador automaticamente (; , tab)</span>
            <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden"
              onChange={(e) => onArquivo(e.target.files?.[0])} />
          </label>
        ) : (
          <>
            <div className="flex items-center gap-2 text-[12px] text-gray-600">
              <FileText className="h-4 w-4 text-blue-600" />
              <span className="font-medium">{csv.nome}</span>
              <span className="text-gray-400">· {csv.rows.length} linhas · {csv.headers.length} colunas</span>
            </div>

            <div className="flex flex-wrap gap-3">
              {MAP_FIELDS.map(f => (
                <div key={f.campo}>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{f.label}</label>
                  <select value={cols[f.campo]} onChange={(e) => setCol(f.campo, e.target.value)}
                    className="h-9 rounded-lg border border-gray-200 px-2 text-[12px] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
                    <option value="">— selecione —</option>
                    {csv.headers.map((h, i) => <option key={i} value={i}>{h || `(coluna ${i + 1})`}</option>)}
                  </select>
                </div>
              ))}
              {equalsTx && (
                <div className="self-end text-[11px] text-gray-500">
                  Equals: <strong className="text-gray-800">{equalsTx.lista.length} transações</strong> · {formatCurrency(equalsTx.total)}
                  {equalsTx.ignoradas > 0 && <span className="text-amber-600"> · {equalsTx.ignoradas} sem autorização/valor</span>}
                </div>
              )}
            </div>
            <p className="text-[10px] text-gray-400">* obrigatórios. A conferência casa por <strong>bandeira · modalidade · autorização · valor bruto</strong>.</p>

            <div className="overflow-x-auto border border-gray-100 rounded-lg">
              <table className="w-full text-[11px]">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>{csv.headers.map((h, i) => (
                    <th key={i} className={`text-left px-2 py-1.5 font-semibold whitespace-nowrap ${corColuna(i)}`}>{h || `col ${i + 1}`}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {csv.rows.slice(0, 8).map((r, ri) => (
                    <tr key={ri} className="border-t border-gray-50">
                      {csv.headers.map((_, ci) => <td key={ci} className="px-2 py-1 text-gray-600 whitespace-nowrap">{r[ci]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {csv.rows.length > 8 && <p className="text-[10px] text-gray-400">Mostrando 8 de {csv.rows.length} linhas.</p>}
          </>
        )}
      </div>

      {/* Ação */}
      <div className="flex items-center gap-3">
        <button onClick={diagnosticar} disabled={!podeDiagnosticar || loading}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Diagnosticar
        </button>
        {!podeDiagnosticar && <span className="text-[11px] text-gray-400">Selecione rede Autosystem + empresa + período e mapeie ao menos Autorização e Valor no CSV.</span>}
      </div>

      {/* Resultado */}
      {resultado?.semConfig && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">
            Nenhuma <strong>conta de cartão</strong> configurada para esta rede. Marque as contas em
            <strong> Cadastros → Clientes → Editar rede → Empresas → Contas de cartão</strong> e tente de novo.
          </p>
        </div>
      )}

      {resultado && !resultado.semConfig && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card titulo="Conciliadas" valor={resultado.conciliadas.length} cor="emerald" icon={<CheckCircle2 className="h-6 w-6" />} />
            <Card titulo="Prováveis" valor={(resultado.provaveis || []).length} cor="sky" icon={<AlertCircle className="h-6 w-6" />} />
            <Card titulo="Só na Equals" valor={resultado.soEquals.length} cor="rose" icon={<XCircle className="h-6 w-6" />} />
            <Card titulo="Só no sistema" valor={resultado.soSistema.length} cor="amber" icon={<XCircle className="h-6 w-6" />} />
          </div>
          <div className="flex flex-wrap gap-4 text-[12px] text-gray-600 px-1">
            <span>Equals: <strong>{resultado.totalEquals}</strong> · {formatCurrency(resultado.valorEquals)}</span>
            <span>Sistema: <strong>{resultado.totalSistema}</strong> · {formatCurrency(resultado.valorSistema)}</span>
            {resultado.semDocumento > 0 && <span className="text-amber-600">{resultado.semDocumento} lançamento(s) do sistema sem documento (autorização)</span>}
          </div>

          <AjustesSugeridos resultado={resultado} />
          <AlertasParcelamento itens={resultado.alertasParcelamento || []} />
          <ListaProvaveis itens={resultado.provaveis || []} />
          <ListaDivergencia titulo="Só na Equals (não achou no sistema)" itens={resultado.soEquals} cor="rose" />
          <ListaDivergencia titulo="Só no sistema (não achou na Equals)" itens={resultado.soSistema} cor="amber" />
        </div>
      )}
    </div>
  );
}

function fmtDataBR(d) { const s = String(d || '').slice(0, 10); const [y, m, dd] = s.split('-'); return dd ? `${dd}/${m}/${y}` : s; }

function AjustesSugeridos({ resultado }) {
  const prov = resultado.provaveis || [];
  const soEq = resultado.soEquals || [];
  const soSis = resultado.soSistema || [];
  const total = prov.length + soEq.length + soSis.length;
  if (total === 0) {
    return <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 font-medium">✓ Tudo conciliado — nenhum ajuste necessário.</div>;
  }

  // Normaliza todos os ajustes num item único e agrupa por funcionário (caixa).
  // tipo: 'semEquals' (lançamento do sistema sem match na Equals),
  //       'semSistema' (transação da Equals sem match no sistema),
  //       'provavel'   (provável conciliação — autorização diferente).
  // Quem responde pelo lançamento: funcionário (quem lançou) ou, na falta dele,
  // o responsável pelo PDV/turno (ex.: frentista não é o responsável).
  const quem = (s) => (s?.funcionario || s?.responsavel || '');
  const ehResp = (s) => !!s && !s.funcionario && !!s.responsavel;
  const itens = [
    ...soSis.map(s => ({ tipo: 'semEquals', func: quem(s), ehResp: ehResp(s), valor: s.valor || 0, s })),
    ...soEq.map(e => ({ tipo: 'semSistema', func: '', ehResp: false, valor: e.valor || 0, e })),
    ...prov.map(p => ({ tipo: 'provavel', func: quem(p.sistema), ehResp: ehResp(p.sistema), valor: p.equals.valor || 0, p })),
  ];
  const mapa = new Map();
  itens.forEach(it => {
    const k = it.func || '__sem__';
    const g = mapa.get(k) || { func: it.func, itens: [], total: 0, ehResp: true };
    g.itens.push(it); g.total += it.valor; g.ehResp = g.ehResp && it.ehResp;
    mapa.set(k, g);
  });
  const grupos = [...mapa.values()].sort((a, b) => {
    if (!a.func && b.func) return 1;          // "Sem funcionário" por último
    if (a.func && !b.func) return -1;
    return b.itens.length - a.itens.length;   // mais ajustes primeiro
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200/60 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-gray-800">Ajustes sugeridos no sistema <span className="text-gray-400">({total})</span></h3>
        <span className="text-[11px] text-gray-400">{grupos.length} funcionário(s)</span>
      </div>
      <div className="divide-y divide-gray-100">
        {grupos.map((g, gi) => <GrupoFuncionarioAjustes key={gi} grupo={g} defaultOpen={grupos.length <= 3} />)}
      </div>
    </div>
  );
}

// Subgrupos dentro de cada funcionário, na ordem pedida:
//  1) lançamentos do sistema sem correspondência na Equals
//  2) transações da Equals sem correspondência no sistema
//  3) prováveis conciliações
const SUBGRUPOS_AJUSTE = [
  { tipo: 'semEquals',  titulo: 'Sem correspondência na Equals' },
  { tipo: 'semSistema', titulo: 'Sem correspondência no sistema' },
  { tipo: 'provavel',   titulo: 'Prováveis conciliações' },
];

// Turno de um item de ajuste (lado sistema). Transação só na Equals não tem turno.
function turnoDoItem(it) {
  if (it.tipo === 'semEquals') return it.s?.turno;
  if (it.tipo === 'provavel') return it.p?.sistema?.turno;
  return null;
}

function GrupoFuncionarioAjustes({ grupo, defaultOpen }) {
  const [aberto, setAberto] = useState(defaultOpen);
  const nome = grupo.func || 'Sem funcionário / responsável';
  // Nível intermediário: TURNO. Agrupa os itens do funcionário por turno.
  const mapaT = new Map();
  grupo.itens.forEach(it => {
    const tv = turnoDoItem(it);
    const k = (tv == null || tv === '') ? '__sem__' : String(tv);
    const g = mapaT.get(k) || { key: k, turno: tv, itens: [] };
    g.itens.push(it); mapaT.set(k, g);
  });
  const turnos = [...mapaT.values()].sort((a, b) => {
    if (a.key === '__sem__') return 1;
    if (b.key === '__sem__') return -1;
    return Number(a.turno) - Number(b.turno);
  });
  return (
    <div>
      <button onClick={() => setAberto(v => !v)} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 text-left gap-3">
        <span className="flex items-center gap-2 min-w-0">
          <ChevronRight className={`h-4 w-4 text-gray-400 transition-transform flex-shrink-0 ${aberto ? 'rotate-90' : ''}`} />
          <User className="h-3.5 w-3.5 text-indigo-500 flex-shrink-0" />
          <span className="text-[12.5px] font-semibold text-gray-800 truncate">{nome}</span>
          {grupo.func && grupo.ehResp && (
            <span className="text-[9.5px] font-semibold uppercase tracking-wide rounded bg-indigo-50 text-indigo-600 px-1.5 py-0.5 flex-shrink-0">responsável</span>
          )}
          <span className="text-[11px] text-gray-400 flex-shrink-0">({grupo.itens.length})</span>
        </span>
        <span className="text-[11.5px] tabular-nums text-gray-500 flex-shrink-0">{formatCurrency(grupo.total)}</span>
      </button>
      {aberto && (
        <div className="bg-gray-50/30 border-t border-gray-50">
          {turnos.map(t => <TurnoNode key={t.key} turno={t} />)}
        </div>
      )}
    </div>
  );
}

function TurnoNode({ turno }) {
  const [aberto, setAberto] = useState(true);
  const label = turno.key === '__sem__' ? 'Sem turno' : `Turno ${turno.turno}`;
  const subgrupos = SUBGRUPOS_AJUSTE
    .map(sg => ({ ...sg, itens: turno.itens.filter(it => it.tipo === sg.tipo) }))
    .filter(sg => sg.itens.length > 0);
  return (
    <div>
      <button onClick={() => setAberto(v => !v)}
        className="w-full pl-9 pr-4 py-1.5 flex items-center gap-2 bg-indigo-50/40 border-b border-indigo-100/60 hover:bg-indigo-50 text-left">
        <ChevronRight className={`h-3.5 w-3.5 text-gray-400 flex-shrink-0 transition-transform ${aberto ? 'rotate-90' : ''}`} />
        <span className="text-[11.5px] font-semibold text-indigo-700">{label}</span>
        <span className="text-[10px] text-gray-400">({turno.itens.length})</span>
      </button>
      {aberto && subgrupos.map(sg => <SubgrupoAjuste key={sg.tipo} subgrupo={sg} />)}
    </div>
  );
}

function SubgrupoAjuste({ subgrupo }) {
  const [aberto, setAberto] = useState(true);
  return (
    <div>
      <button onClick={() => setAberto(v => !v)}
        className="w-full pl-14 pr-4 py-1.5 flex items-center gap-2 bg-gray-100/60 border-b border-gray-100 hover:bg-gray-100 text-left">
        <ChevronRight className={`h-3 w-3 text-gray-400 flex-shrink-0 transition-transform ${aberto ? 'rotate-90' : ''}`} />
        <span className="text-[11px] font-semibold text-gray-600">{subgrupo.titulo}</span>
        <span className="text-[10px] text-gray-400">({subgrupo.itens.length})</span>
      </button>
      {aberto && (
        <div className="divide-y divide-gray-50">
          {subgrupo.itens.map((it, i) => <LinhaAjuste key={i} item={it} />)}
        </div>
      )}
    </div>
  );
}

// "1.3.01.8 — MASTERCARD DÉBITO" (código + nome), ou só o código se não tiver nome.
function rotuloConta(codigo, nome) {
  const c = String(codigo ?? '').trim();
  const n = String(nome ?? '').trim();
  return n ? `${c} — ${n}` : c;
}

// Descreve, para uma provável conciliação, QUAL campo diverge (sistema ≠ Equals).
function DiferencaProvavel({ p }) {
  const s = p.sistema, e = p.equals;
  const sis = (v) => <span className="font-mono text-rose-700">{v}</span>;
  const eq = (v) => <span className="font-mono text-emerald-700">{v}</span>;
  switch (p.motivo) {
    case 'valor':
      return <>valor no sistema {sis(formatCurrency(s.valor))} ≠ Equals {eq(formatCurrency(e.valor))}</>;
    case 'bandeira':
      return <>bandeira no sistema {sis(s.bandeira || '—')} ≠ Equals {eq(e.bandeira || '—')}</>;
    case 'modalidade':
      return <>tipo no sistema {sis(s.modalidade || '—')} ≠ Equals {eq(e.modalidade || '—')}</>;
    case 'bandeira_modalidade':
      return <>bandeira {sis(s.bandeira || '—')} ≠ {eq(e.bandeira || '—')} e tipo {sis(s.modalidade || '—')} ≠ {eq(e.modalidade || '—')}</>;
    default: // autorizacao
      return <>autorização no sistema {sis(s.autorizacao)} ≠ Equals {eq(e.autorizacao)}</>;
  }
}

function LinhaAjuste({ item }) {
  if (item.tipo === 'provavel') {
    const p = item.p;
    return (
      <div className="pl-16 pr-4 py-2 flex items-start gap-3">
        <span className="mt-0.5 inline-flex items-center rounded-full bg-sky-100 text-sky-700 text-[10px] font-semibold px-2 py-0.5 flex-shrink-0">{p.motivoLabel || 'Corrigir'}</span>
        <p className="text-[12.5px] text-gray-700 leading-relaxed">
          Conta <strong>{rotuloConta(p.sistema.conta, p.sistema.contaNome)}</strong> em <strong>{fmtDataBR(p.sistema.data)}</strong> (adquirente {p.equals.adquirente || '—'},
          {p.motivo === 'autorizacao'
            ? <> {formatCurrency(p.equals.valor)}</>
            : <> autorização <span className="font-mono">{p.equals.autorizacao}</span></>}):
          {' '}<DiferencaProvavel p={p} />. → Conferir e corrigir no sistema.
        </p>
      </div>
    );
  }
  if (item.tipo === 'semEquals') {
    const s = item.s;
    return (
      <div className="pl-16 pr-4 py-2 flex items-start gap-3">
        <span className="mt-0.5 inline-flex items-center rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold px-2 py-0.5 flex-shrink-0">Revisar no sistema</span>
        <p className="text-[12.5px] text-gray-700 leading-relaxed">
          Lançamento no sistema (conta <strong>{rotuloConta(s.conta, s.contaNome)}</strong>, {fmtDataBR(s.data)}) sem correspondência na Equals: autorização <span className="font-mono">{s.autorizacao}</span> · {formatCurrency(s.valor)}. → Revisar (valor/autorização errada, duplicidade ou lançamento indevido).
        </p>
      </div>
    );
  }
  // semSistema (transação só na Equals)
  const e = item.e;
  return (
    <div className="pl-16 pr-4 py-2 flex items-start gap-3">
      <span className="mt-0.5 inline-flex items-center rounded-full bg-rose-100 text-rose-700 text-[10px] font-semibold px-2 py-0.5 flex-shrink-0">Falta no sistema</span>
      <p className="text-[12.5px] text-gray-700 leading-relaxed">
        Transação na Equals sem correspondência: <strong>{e.adquirente}/{e.bandeira}/{e.modalidade}</strong> · autorização <span className="font-mono">{e.autorizacao}</span> · {formatCurrency(e.valor)}. → Lançar no sistema.
      </p>
    </div>
  );
}

function AlertasParcelamento({ itens }) {
  const [aberto, setAberto] = useState(true);
  if (!itens || itens.length === 0) return null;
  return (
    <div className="bg-white rounded-xl border border-orange-200 overflow-hidden">
      <button onClick={() => setAberto(v => !v)} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-orange-50/50 text-left">
        <span className="text-[12.5px] font-semibold text-orange-700">Divergências de parcelamento <span className="text-gray-400">({itens.length})</span></span>
        <ChevronRight className={`h-4 w-4 text-gray-400 transition-transform ${aberto ? 'rotate-90' : ''}`} />
      </button>
      {aberto && (
        <div className="divide-y divide-gray-50 border-t border-orange-100">
          {itens.map((a, i) => (
            <div key={i} className="px-4 py-2.5 flex items-start gap-3">
              {a.tipo === 'sistema-parcelou' ? (
                <>
                  <span className="mt-0.5 inline-flex items-center rounded-full bg-orange-100 text-orange-700 text-[10px] font-semibold px-2 py-0.5 flex-shrink-0">Sistema parcelou</span>
                  <p className="text-[12.5px] text-gray-700 leading-relaxed">
                    Conta <strong>{a.sistema.conta}</strong> ({a.equals.adquirente}/{a.equals.bandeira}/{a.equals.modalidade}) · autorização <span className="font-mono">{a.sistema.autorizacao}</span> · {formatCurrency(a.sistema.valor)}:
                    o sistema fatiou em <strong>{a.sistema.parcelas}x</strong> ({a.sistema.membros.map(m => m.documento).join(', ')}), mas na Equals <strong>não é parcelado</strong>. → Verificar: lançamento à vista foi parcelado indevidamente.
                    {a.sistema.funcionario && <span className="text-indigo-600 font-medium"> · caixa de {a.sistema.funcionario}</span>}
                  </p>
                </>
              ) : (
                <>
                  <span className="mt-0.5 inline-flex items-center rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold px-2 py-0.5 flex-shrink-0">Equals parcelada</span>
                  <p className="text-[12.5px] text-gray-700 leading-relaxed">
                    Conta <strong>{a.sistema.conta}</strong> ({a.equals.adquirente}/{a.equals.bandeira}/{a.equals.modalidade}) · autorização <span className="font-mono">{a.sistema.autorizacao}</span> · {formatCurrency(a.equals.valor)}:
                    na Equals é <strong>parcelada{a.equals.parcelasEquals ? ` (${a.equals.parcelasEquals}x)` : ''}</strong>, mas o sistema lançou em parcela única. → Verificar o parcelamento no sistema.
                    {a.sistema.funcionario && <span className="text-indigo-600 font-medium"> · caixa de {a.sistema.funcionario}</span>}
                  </p>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ListaProvaveis({ itens }) {
  const [aberto, setAberto] = useState(true);
  if (!itens || itens.length === 0) return null;
  return (
    <div className="bg-white rounded-xl border border-sky-200 overflow-hidden">
      <button onClick={() => setAberto(v => !v)} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-sky-50/50 text-left">
        <span className="text-[12.5px] font-semibold text-sky-700">Prováveis conciliações <span className="text-gray-400">({itens.length})</span> — igual em quase tudo, divergindo em um campo (valor, autorização, bandeira ou tipo)</span>
        <ChevronRight className={`h-4 w-4 text-gray-400 transition-transform ${aberto ? 'rotate-90' : ''}`} />
      </button>
      {aberto && (
        <div className="overflow-x-auto border-t border-sky-100">
          <table className="w-full text-[11.5px]">
            <thead className="bg-sky-50/60 text-gray-500">
              <tr>
                <th className="text-left px-3 py-1.5 font-semibold">Divergência</th>
                <th className="text-left px-3 py-1.5 font-semibold">Adquirente</th>
                <th className="text-left px-3 py-1.5 font-semibold">Bandeira (Sist. / Equals)</th>
                <th className="text-left px-3 py-1.5 font-semibold">Tipo (Sist. / Equals)</th>
                <th className="text-left px-3 py-1.5 font-semibold">Autorização (Sist. / Equals)</th>
                <th className="text-center px-3 py-1.5 font-semibold">Turno</th>
                <th className="text-left px-3 py-1.5 font-semibold">Funcionário / Resp.</th>
                <th className="text-right px-3 py-1.5 font-semibold">Valor (Sist. / Equals)</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((p, i) => {
                const dif = campo => (p.motivo === campo || (p.motivo === 'bandeira_modalidade' && (campo === 'bandeira' || campo === 'modalidade')));
                const par = (campo, sv, ev) => dif(campo)
                  ? <><span className="font-mono text-rose-700">{sv}</span> <span className="text-gray-300">/</span> <span className="font-mono text-emerald-700">{ev}</span></>
                  : <span className="text-gray-700">{sv}</span>;
                return (
                  <tr key={i} className="border-t border-sky-50">
                    <td className="px-3 py-1"><span className="inline-flex items-center rounded-full bg-sky-100 text-sky-700 text-[10px] font-semibold px-2 py-0.5">{p.motivoLabel}</span></td>
                    <td className="px-3 py-1 text-gray-700">{p.equals.adquirente || '—'}</td>
                    <td className="px-3 py-1">{par('bandeira', p.sistema.bandeira || '—', p.equals.bandeira || '—')}</td>
                    <td className="px-3 py-1">{par('modalidade', p.sistema.modalidade || '—', p.equals.modalidade || '—')}</td>
                    <td className="px-3 py-1">{par('autorizacao', p.sistema.autorizacao, p.equals.autorizacao)}{p.sistema.conta ? <span className="text-gray-400"> · conta {p.sistema.conta}</span> : null}</td>
                    <td className="px-3 py-1 text-center text-gray-700">{p.sistema.turno ?? '—'}</td>
                    <td className="px-3 py-1 text-indigo-700">{p.sistema.funcionario || p.sistema.responsavel || '—'}</td>
                    <td className="px-3 py-1 text-right tabular-nums">{par('valor', formatCurrency(p.sistema.valor), formatCurrency(p.equals.valor))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ListaDivergencia({ titulo, itens, cor }) {
  const [aberto, setAberto] = useState(false);
  if (!itens || itens.length === 0) return null;
  const corTxt = cor === 'rose' ? 'text-rose-700' : 'text-amber-700';
  const temFunc = itens.some(t => t.funcionario || t.responsavel);
  const temTurno = itens.some(t => t.turno != null && t.turno !== '');
  return (
    <div className="bg-white rounded-xl border border-gray-200/60 overflow-hidden">
      <button onClick={() => setAberto(v => !v)} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 text-left">
        <span className={`text-[12.5px] font-semibold ${corTxt}`}>{titulo} <span className="text-gray-400">({itens.length})</span></span>
        <ChevronRight className={`h-4 w-4 text-gray-400 transition-transform ${aberto ? 'rotate-90' : ''}`} />
      </button>
      {aberto && (
        <div className="overflow-x-auto border-t border-gray-100">
          <table className="w-full text-[11.5px]">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-3 py-1.5 font-semibold">Adquirente</th>
                <th className="text-left px-3 py-1.5 font-semibold">Bandeira</th>
                <th className="text-left px-3 py-1.5 font-semibold">Modalidade</th>
                <th className="text-left px-3 py-1.5 font-semibold">Autorização</th>
                {temTurno && <th className="text-center px-3 py-1.5 font-semibold">Turno</th>}
                {temFunc && <th className="text-left px-3 py-1.5 font-semibold">Funcionário / Resp.</th>}
                <th className="text-right px-3 py-1.5 font-semibold">Valor</th>
              </tr>
            </thead>
            <tbody>
              {itens.slice(0, 300).map((t, i) => (
                <tr key={i} className="border-t border-gray-50">
                  <td className="px-3 py-1 text-gray-700">{t.adquirente || '—'}</td>
                  <td className="px-3 py-1 text-gray-700">{t.bandeira || '—'}</td>
                  <td className="px-3 py-1 text-gray-700">{t.modalidade || '—'}</td>
                  <td className="px-3 py-1 font-mono text-gray-700">{t.autorizacao || '—'}{t.conta ? <span className="text-gray-400"> · conta {t.conta}</span> : null}</td>
                  {temTurno && <td className="px-3 py-1 text-center text-gray-700">{t.turno ?? '—'}</td>}
                  {temFunc && <td className="px-3 py-1 text-indigo-700">{t.funcionario || t.responsavel || '—'}</td>}
                  <td className="px-3 py-1 text-right tabular-nums text-gray-700">{formatCurrency(t.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {itens.length > 300 && <p className="text-[10px] text-gray-400 px-3 py-1.5">Mostrando 300 de {itens.length}.</p>}
        </div>
      )}
    </div>
  );
}

function Card({ titulo, valor, cor, icon }) {
  const cores = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    sky: 'bg-sky-50 border-sky-200 text-sky-700',
    rose: 'bg-rose-50 border-rose-200 text-rose-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
  };
  return (
    <div className={`rounded-xl border p-4 flex items-center justify-between ${cores[cor]}`}>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80">{titulo}</p>
        <p className="text-2xl font-bold tabular-nums">{valor}</p>
      </div>
      <span className="opacity-60">{icon}</span>
    </div>
  );
}
