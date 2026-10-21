import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Stethoscope, Loader2, AlertCircle, Building2, UploadCloud, FileText,
  CheckCircle2, XCircle, RefreshCw, X, ChevronRight, User,
} from 'lucide-react';
import * as clientesService from '../services/clientesService';
import * as mapService from '../services/mapeamentoService';
import * as autosystemService from '../services/autosystemService';
import * as qualityApi from '../services/qualityApiService';
import * as administradorasService from '../services/clienteAdministradorasService';
import SeletorRedeBPO from '../components/ui/SeletorRedeBPO';
import { formatCurrency } from '../utils/format';
import {
  LAYOUTS, layoutPorChave, lerArquivoVendas, detectarLayout, adivinharColunas, sugerirAdquirente,
  melhorModelo, colsDoModelo, mapeamentoPorNome, fixosDoModelo,
} from '../utils/layoutsCartoes';
import * as modelosService from '../services/layoutsArquivoCartaoService';
import * as catalogoCartaoService from '../services/bpoCartaoCatalogoService';

// Layout do arquivo: embutido (Equals, Cielo…) ou modelo salvo ("m:<id>").
// Modelo sem adquirente fixa = a adquirente vem de uma coluna (como a Equals).
function resolverLayout(chave, modelos) {
  if (String(chave).startsWith('m:')) {
    const m = (modelos || []).find(x => `m:${x.id}` === chave);
    return { k: chave, rot: m?.nome || 'Modelo', multi: !m?.adquirente, modelo: m || null };
  }
  return layoutPorChave(chave);
}

// ─── Helpers de datas ─────────────────────────────────────────
function ymd(d) { return d.toISOString().split('T')[0]; }
function hojeStr() { return ymd(new Date()); }
function inicioMesStr() { const d = new Date(); return ymd(new Date(d.getFullYear(), d.getMonth(), 1)); }

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

export default function BpoDiagnosticarCartoes() {
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [chavesApi, setChavesApi] = useState([]);
  const [redesAutosystem, setRedesAutosystem] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [redeSel, setRedeSel] = useState(null);
  const [empresaId, setEmpresaId] = useState('');
  const [dataDe, setDataDe] = useState(inicioMesStr());
  const [dataAte, setDataAte] = useState(hojeStr());

  // Arquivos de vendas (Equals e/ou adquirentes): { id, nome, layout, adquirente, headers, rows, cols }.
  // Mapeamento de colunas. Chave: adquirente · bandeira · modalidade · autorização · valor (bruto).
  const [arquivos, setArquivos] = useState([]);
  const [adquirentesRede, setAdquirentesRede] = useState([]); // das contas de cartão da rede
  const [modelos, setModelos] = useState([]); // modelos de layout salvos
  const [adquirentesCatalogo, setAdquirentesCatalogo] = useState([]); // catálogo (BPO → adquirentes)
  const [catalogoFixos, setCatalogoFixos] = useState({ bandeiras: [], modalidades: [] }); // p/ valores fixos
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
    if (!redeSel) return [];
    const daRede = redeSel.tipo === 'webposto'
      ? (c) => c.chave_api_id === redeSel.id && c.usa_webposto !== false
      : (c) => c.as_rede_id === redeSel.id;
    return (clientes || [])
      .filter(c => daRede(c) && c.empresa_codigo != null && c.status === 'ativo')
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  }, [clientes, redeSel]);

  useEffect(() => {
    modelosService.listarModelos().then(setModelos).catch(() => {});
    catalogoCartaoService.listarCatalogoCartao()
      .then(c => {
        setAdquirentesCatalogo((c.adquirentes || []).map(a => a.nome).filter(Boolean));
        setCatalogoFixos({ bandeiras: (c.bandeiras || []).map(b => b.nome), modalidades: (c.modalidades || []).map(m => m.nome) });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!redeSel) return undefined;
    let cancel = false;
    (redeSel.tipo === 'webposto' ? administradorasService.listarPorRede(redeSel.id) : autosystemService.listarContasCartaoRede(redeSel.id))
      .then(cs => { if (!cancel) setAdquirentesRede([...new Set((cs || []).map(c => String(c.adquirente || '').trim()).filter(Boolean))].sort()); })
      .catch(() => { if (!cancel) setAdquirentesRede([]); });
    return () => { cancel = true; };
  }, [redeSel]);

  const empresaSel = useMemo(
    () => empresasDaRede.find(e => e.id === empresaId) || null,
    [empresasDaRede, empresaId],
  );

  const alterarArquivo = (id, patch) => { setArquivos(l => l.map(a => (a.id === id ? { ...a, ...patch } : a))); setResultado(null); };
  const removerArquivo = (id) => { setArquivos(l => l.filter(a => a.id !== id)); setResultado(null); };

  const adicionarArquivos = useCallback(async (files) => {
    const lista = [...(files || [])];
    if (!lista.length) return;
    setResultado(null);
    for (const file of lista) {
      try {
        const { headers, rows } = await lerArquivoVendas(file);
        if (headers.length === 0) { setError(`${file.name}: arquivo vazio ou ilegível.`); continue; }
        // 1º um modelo salvo que reconheça o cabeçalho; senão o layout embutido.
        const modelo = melhorModelo(modelos, headers);
        const layout = modelo ? `m:${modelo.id}` : detectarLayout(file.name, headers);
        setArquivos(l => [...l, {
          id: crypto.randomUUID(), nome: file.name, layout, headers, rows,
          adquirente: modelo ? (modelo.adquirente || '') : sugerirAdquirente(layout, adquirentesRede),
          cols: modelo ? colsDoModelo(modelo, headers) : adivinharColunas(layout, headers),
          fixos: fixosDoModelo(modelo),
        }]);
        setError(null);
      } catch (err) { setError(`Falha ao ler ${file.name}: ${err.message}`); }
    }
    if (fileRef.current) fileRef.current.value = '';
  }, [adquirentesRede, modelos]);

  const trocarLayout = (arq, layout) => {
    const lay = resolverLayout(layout, modelos);
    if (lay.modelo) {
      alterarArquivo(arq.id, { layout, cols: colsDoModelo(lay.modelo, arq.headers), adquirente: lay.modelo.adquirente || '', fixos: fixosDoModelo(lay.modelo) });
    } else {
      alterarArquivo(arq.id, { layout, cols: adivinharColunas(layout, arq.headers), adquirente: sugerirAdquirente(layout, adquirentesRede) });
    }
  };

  // Salva o mapeamento atual do arquivo como modelo (novo ou atualizando o selecionado).
  const salvarModeloDoArquivo = async (arq, { nome, atualizar }) => {
    const lay = resolverLayout(arq.layout, modelos);
    const salvo = await modelosService.salvarModelo({
      id: atualizar ? lay.modelo?.id : undefined,
      nome: atualizar ? lay.modelo?.nome : nome,
      adquirente: lay.multi ? null : (arq.adquirente || null),
      mapeamento: { ...mapeamentoPorNome(arq.cols, arq.headers), fixos: arq.fixos || {} },
      colunas: arq.headers,
    });
    setModelos(l => [...l.filter(m => m.id !== salvo.id), salvo].sort((a, b) => a.nome.localeCompare(b.nome)));
    alterarArquivo(arq.id, { layout: `m:${salvo.id}` });
    return salvo;
  };
  const excluirModeloDoArquivo = async (arq) => {
    const lay = resolverLayout(arq.layout, modelos);
    if (!lay.modelo || !confirm(`Excluir o modelo "${lay.modelo.nome}"?`)) return;
    await modelosService.excluirModelo(lay.modelo.id);
    setModelos(l => l.filter(m => m.id !== lay.modelo.id));
    alterarArquivo(arq.id, { layout: lay.multi ? 'equals' : 'outro' });
  };

  // Transações dos arquivos (lista normalizada + chave de conferência) e as
  // adquirentes que eles cobrem — o sistema só é cobrado nessas adquirentes.
  const equalsTx = useMemo(() => {
    if (!arquivos.length) return null;
    const pronto = (a) => a.cols.valor !== '' && a.cols.autorizacao !== '' && (resolverLayout(a.layout, modelos).multi || a.adquirente);
    if (!arquivos.every(pronto)) return null;
    const ehVazio = x => !/[a-z0-9]/i.test(String(x || '')); // '', '-', '—' → vazio
    const lista = [];
    const porArquivo = {};
    const cobertos = new Set();
    let ignoradas = 0, coberturaDesconhecida = false;
    arquivos.forEach(arq => {
      const lay = resolverLayout(arq.layout, modelos);
      const { adquirente, bandeira, modalidade, autorizacao, valor, total: totalCol, parcelas, hora } = arq.cols;
      const ti = totalCol === '' || totalCol == null ? -1 : Number(totalCol);
      const qi = lay.multi && adquirente !== '' ? Number(adquirente) : -1;
      const bi = bandeira === '' ? -1 : Number(bandeira);
      const mi = modalidade === '' ? -1 : Number(modalidade);
      const ai = Number(autorizacao), vi = Number(valor);
      const pi = parcelas === '' ? -1 : Number(parcelas);
      const hi = hora === '' ? -1 : Number(hora);
      const mapeouMeta = qi >= 0 || bi >= 0 || mi >= 0;
      const adqFixa = lay.multi ? '' : normBandeira(arq.adquirente);
      let qtd = 0, total = 0, ign = 0;
      // Venda parcelada em várias linhas (uma por parcela, mesma autorização):
      // vira UMA transação com o total da venda (coluna "total" ou soma das parcelas).
      const parceladas = new Map();
      arq.rows.forEach((r) => {
        const v = parseValorBR(r[vi]);
        const aut = normAutorizacao(r[ai]);
        if (v == null || !aut) { ign++; return; }
        // Linha TOTALIZADORA do relatório: tem valor mas nenhum dado de cartão.
        if (mapeouMeta && ehVazio(r[qi]) && ehVazio(r[bi]) && ehVazio(r[mi])) { ign++; return; }
        const adq = lay.multi ? (qi >= 0 ? normBandeira(r[qi]) : '') : adqFixa;
        // Sem a coluna: usa o valor fixo do arquivo (ex.: frota = sempre crédito).
        const band = bi >= 0 ? normBandeira(r[bi]) : normBandeira(arq.fixos?.bandeira || '');
        const modal = mi >= 0 ? normModalidade(r[mi]) : (arq.fixos?.modalidade ? normModalidade(arq.fixos.modalidade) : '');
        // Parcelado? Pela coluna de parcelas (>1) ou pelo texto da modalidade ("Parcelado…").
        const nParc = pi >= 0 ? (parseInt(String(r[pi]).replace(/[^\d]/g, ''), 10) || 0) : 0;
        const parceladoEquals = nParc > 1 || (mi >= 0 && textoIndicaParcelado(r[mi]));
        const h = hi >= 0 ? String(r[hi] || '').trim() : '';
        const origem = lay.multi ? lay.rot.split(' ')[0] : (arq.adquirente || lay.rot);
        if (nParc > 1) {
          const gk = `${adq}|${band}|${modal}|${aut}`;
          const g = parceladas.get(gk) || { adquirente: adq, bandeira: band, modalidade: modal, autorizacao: aut, hora: h, origem, nParc, soma: 0, totalVenda: null, linhas: 0 };
          g.soma += v; g.linhas++;
          const tv = ti >= 0 ? parseValorBR(r[ti]) : null;
          if (tv != null) g.totalVenda = tv;
          parceladas.set(gk, g);
        } else {
          lista.push({ adquirente: adq, bandeira: band, modalidade: modal, autorizacao: aut, valor: v, hora: h, parceladoEquals, parcelasEquals: nParc || null, origem, key: `${adq}|${band}|${modal}|${aut}|${v.toFixed(2)}` });
          qtd++; total += v;
        }
        if (adq) cobertos.add(adq);
      });
      parceladas.forEach(g => {
        const v = Number((g.totalVenda ?? g.soma).toFixed(2));
        lista.push({ adquirente: g.adquirente, bandeira: g.bandeira, modalidade: g.modalidade, autorizacao: g.autorizacao, valor: v, hora: g.hora, parceladoEquals: true, parcelasEquals: g.nParc, origem: g.origem, key: `${g.adquirente}|${g.bandeira}|${g.modalidade}|${g.autorizacao}|${v.toFixed(2)}` });
        qtd++; total += v;
      });
      if (lay.multi && qi < 0) coberturaDesconhecida = true; // sem coluna de adquirente: não dá para limitar
      if (!lay.multi && adqFixa) cobertos.add(adqFixa);
      ignoradas += ign;
      porArquivo[arq.id] = { qtd, total, ignoradas: ign };
    });
    const total = lista.reduce((acc, t) => acc + t.valor, 0);
    return { lista, total, ignoradas, porArquivo, cobertos: coberturaDesconhecida ? null : cobertos };
  }, [arquivos, modelos]);

  const podeDiagnosticar = !!redeSel && empresaId && dataDe && dataAte && equalsTx;

  const diagnosticar = useCallback(async () => {
    if (!podeDiagnosticar) return;
    setLoading(true); setError(null); setResultado(null);
    try {
      const sistemaRaw = [];
      const foraCobertura = new Map(); // adquirente → nº de lançamentos não conferidos
      let semDocumento = 0;
      // Adquirente que nenhum arquivo cobre (ex.: fora da Equals e sem arquivo próprio): não cobra.
      const coberto = (adqNome) => {
        if (!equalsTx.cobertos || equalsTx.cobertos.has(normBandeira(adqNome || ''))) return true;
        const k = adqNome || '(sem adquirente)';
        foraCobertura.set(k, (foraCobertura.get(k) || 0) + 1);
        return false;
      };

      if (redeSel.tipo === 'webposto') {
        // Webposto: transações de cartão da Quality (CARTAO — autorização, valor,
        // parcela, administradora) + parametrização das administradoras da rede
        // (Editar rede → Administradoras: adquirente/bandeira/modalidade).
        const adms = await administradorasService.listarPorRede(redeSel.id);
        const cfgPorAdm = new Map();
        (adms || []).filter(a => a.ativo !== false && a.adquirente)
          .forEach(a => cfgPorAdm.set(Number(a.administradora_codigo), a));
        if (cfgPorAdm.size === 0) {
          setResultado({ semConfig: true, webposto: true, totalEquals: equalsTx.lista.length });
          return;
        }
        const chave = chavesApi.find(c => c.id === redeSel.id)?.chave;
        if (!chave) throw new Error('Chave da API Quality não encontrada para esta rede.');
        const filtros = { dataInicial: dataDe, dataFinal: dataAte, empresaCodigo: empresaSel.empresa_codigo };
        // VENDA traz funcionário e caixa de cada venda (para agrupar os ajustes).
        const [cartoes, vendas] = await Promise.all([
          qualityApi.buscarCartoes(chave, filtros),
          qualityApi.buscarVendas(chave, filtros).catch(() => []),
        ]);
        const vendaPorCodigo = new Map((vendas || []).map(v => [Number(v.vendaCodigo ?? v.codigo), v]));
        (cartoes || []).forEach(c => {
          const cfg = cfgPorAdm.get(Number(c.administradoraCodigo));
          if (!cfg) return; // administradora não parametrizada (ex.: PIX) — fora do diagnóstico
          const aut = normAutorizacao(c.autorizacao);
          if (!aut) { semDocumento++; return; }
          if (!coberto(cfg.adquirente)) return;
          const venda = vendaPorCodigo.get(Number(c.vendaCodigo));
          const func = (venda?.funcionarioNome || '').trim();
          sistemaRaw.push({
            adquirente: normBandeira(cfg.adquirente), bandeira: normBandeira(cfg.bandeira || ''),
            // Frota é sempre crédito (vale mesmo sem modalidade informada).
            modalidade: normModalidade(cfg.frota ? 'Crédito' : (cfg.modalidade || '')), autorizacao: aut,
            parcela: Number(c.parcela) || null, valor: Number(c.valor) || 0,
            conta: String(c.administradoraCodigo), contaNome: cfg.descricao || c.adiministradoraDescricao || c.administradoraDescricao || '',
            data: c.dataMovimento || c.dataFiscal, turno: venda?.caixaCodigo ?? null,
            documento: String(c.autorizacao || ''), obs: c.horaMovimento ? `${c.horaMovimento}` : '', pessoa: c.clienteRazao || '',
            funcionario: func, usuario: '', responsavel: '',
          });
        });
      } else {
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
          if (!coberto(cfg.adquirente)) return;
          sistemaRaw.push({
            adquirente: normBandeira(cfg.adquirente || ''), bandeira: normBandeira(cfg.bandeira || ''),
            modalidade: normModalidade(cfg.modalidade || ''), autorizacao: aut, parcela, valor,
            conta: cfg.codigo, contaNome: cfg.nome, data: l.data, turno: l.turno,
            documento: l.documento || '', obs: (l.obs || '').trim(), pessoa: l.pessoa_nome || '',
            funcionario: (l.usuario_nome || '').trim(), usuario: (l.usuario || '').trim(),
            responsavel: (l.responsavel_nome || '').trim(),
          });
        });
      }

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

      // 4) Conciliação. Adquirente, autorização e valor precisam bater; bandeira
      //    e modalidade só contam quando OS DOIS lados têm o valor (vazio = não
      //    se aplica — ex.: Good Card sem bandeira no sistema, arquivo sem débito/crédito).
      const v2 = t => t.valor.toFixed(2);
      const compat = (x, y) => !x || !y || x === y;
      const usados = new Set();
      const idxSis = new Map(); // adquirente|autorização|valor → [sistema]
      sistemaTx.forEach(t => {
        const k = `${t.adquirente}|${t.autorizacao}|${v2(t)}`;
        const arr = idxSis.get(k) || []; arr.push(t); idxSis.set(k, arr);
      });
      const conciliadas = [], soEquals = [];
      equalsTx.lista.forEach(e => {
        const s = (idxSis.get(`${e.adquirente}|${e.autorizacao}|${v2(e)}`) || [])
          .find(t => !usados.has(t) && compat(e.bandeira, t.bandeira) && compat(e.modalidade, t.modalidade));
        if (s) { usados.add(s); conciliadas.push({ equals: e, sistema: s }); }
        else soEquals.push(e);
      });
      const soSistema = sistemaTx.filter(t => !usados.has(t));

      // 5) PROVÁVEIS conciliações: dos restantes, casa quando SÓ um (ou um par
      //    específico) dos campos diverge, mantendo o resto igual. Processa do mais
      //    confiável (1 campo) para o menos (bandeira + tipo). O adquirente sempre
      //    precisa bater; bandeira/tipo só "divergem" se os dois lados tiverem valor.
      const difBand = (e, s) => e.bandeira && s.bandeira && e.bandeira !== s.bandeira;
      const difModal = (e, s) => e.modalidade && s.modalidade && e.modalidade !== s.modalidade;
      const PADROES_PROVAVEL = [
        { motivo: 'valor', label: 'Valor diferente',
          casa: (e, s) => e.autorizacao === s.autorizacao && v2(e) !== v2(s) && compat(e.bandeira, s.bandeira) && compat(e.modalidade, s.modalidade) },
        { motivo: 'autorizacao', label: 'Autorização diferente',
          casa: (e, s) => v2(e) === v2(s) && e.autorizacao !== s.autorizacao && compat(e.bandeira, s.bandeira) && compat(e.modalidade, s.modalidade) },
        { motivo: 'bandeira', label: 'Bandeira diferente',
          casa: (e, s) => e.autorizacao === s.autorizacao && v2(e) === v2(s) && difBand(e, s) && compat(e.modalidade, s.modalidade) },
        { motivo: 'modalidade', label: 'Tipo diferente',
          casa: (e, s) => e.autorizacao === s.autorizacao && v2(e) === v2(s) && difModal(e, s) && compat(e.bandeira, s.bandeira) },
        { motivo: 'bandeira_modalidade', label: 'Bandeira e tipo diferentes',
          casa: (e, s) => e.autorizacao === s.autorizacao && v2(e) === v2(s) && difBand(e, s) && difModal(e, s) },
      ];

      let restEquals = soEquals.slice();
      let restSistema = soSistema.slice();
      const provaveis = [];
      PADROES_PROVAVEL.forEach(padrao => {
        const porAdq = new Map();
        restSistema.forEach(t => { const arr = porAdq.get(t.adquirente) || []; arr.push(t); porAdq.set(t.adquirente, arr); });
        const sisUsado = new Set(), eqUsado = new Set();
        restEquals.forEach((e, ei) => {
          const s = (porAdq.get(e.adquirente) || []).find(t => !sisUsado.has(t) && padrao.casa(e, t));
          if (!s) return;
          provaveis.push({ equals: e, sistema: s, motivo: padrao.motivo, motivoLabel: padrao.label });
          sisUsado.add(s); eqUsado.add(ei);
        });
        restEquals = restEquals.filter((_, i) => !eqUsado.has(i));
        restSistema = restSistema.filter(t => !sisUsado.has(t));
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
        foraCobertura: [...foraCobertura.entries()],
        alertasParcelamento,
        valorEquals: equalsTx.total,
        valorSistema: sistemaTx.reduce((s, t) => s + t.valor, 0),
      });
    } catch (err) { setError(err.message || 'Falha ao diagnosticar.'); }
    finally { setLoading(false); }
  }, [podeDiagnosticar, equalsTx, redeSel, empresaSel, dataDe, dataAte, chavesApi]);

  if (loadingMeta) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>;

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
          <h3 className="text-sm font-semibold text-gray-800">Diagnóstico de cartões — Sistema (Autosystem/Webposto) × Equals / adquirentes</h3>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Rede</label>
          <SeletorRedeBPO chavesApi={chavesApi} redesAutosystem={redesAutosystem}
            value={redeSel} onChange={(r) => { setRedeSel(r); setEmpresaId(''); setResultado(null); }}
            placeholder="Selecione uma rede..." />
          {redeSel?.tipo === 'webposto' && (
            <p className="mt-2 text-[11px] text-gray-500">
              Webposto: o sistema é lido das transações de cartão da Quality, usando a parametrização das administradoras
              (Editar rede → Administradoras).
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

      {/* Arquivos de vendas: Equals e/ou adquirentes (Cielo, Rede, Getnet, Sipag…) */}
      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Arquivos de vendas (Equals e/ou adquirentes)</h3>
          <p className="mt-0.5 text-[11px] text-gray-500">
            Envie a Equals e, se a empresa tiver adquirente fora dela, o relatório da própria adquirente. O sistema é conferido só
            nas adquirentes cobertas pelos arquivos.
          </p>
        </div>

        {arquivos.map(arq => (
          <ArquivoVendas key={arq.id} arq={arq} adquirentesRede={adquirentesRede} adquirentesCatalogo={adquirentesCatalogo} modelos={modelos}
            catalogoFixos={catalogoFixos} onFixo={(campo, v) => alterarArquivo(arq.id, { fixos: { ...(arq.fixos || {}), [campo]: v } })}
            lay={resolverLayout(arq.layout, modelos)}
            onSalvarModelo={(opts) => salvarModeloDoArquivo(arq, opts)}
            onExcluirModelo={() => excluirModeloDoArquivo(arq).catch(e => setError(e.message))}
            resumo={equalsTx?.porArquivo?.[arq.id]}
            onLayout={(l) => trocarLayout(arq, l)}
            onAdquirente={(v) => alterarArquivo(arq.id, { adquirente: v })}
            onCol={(campo, idx) => alterarArquivo(arq.id, { cols: { ...arq.cols, [campo]: idx } })}
            onRemover={() => removerArquivo(arq.id)} />
        ))}

        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl px-6 py-6 cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors">
          <UploadCloud className="h-7 w-7 text-gray-400" />
          <span className="text-sm text-gray-600">{arquivos.length ? 'Adicionar outro arquivo' : 'Arraste ou clique para enviar os arquivos de vendas'}</span>
          <span className="text-[11px] text-gray-400">CSV ou Excel (.xlsx/.xls) · Equals, Cielo, Rede, Getnet, Sipag ou outra adquirente · pode enviar vários</span>
          <input ref={fileRef} type="file" multiple accept=".csv,.xlsx,.xls,.xlsm,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" className="hidden"
            onChange={(e) => adicionarArquivos(e.target.files)} />
        </label>

        {equalsTx && (
          <p className="text-[11px] text-gray-500">
            Total dos arquivos: <strong className="text-gray-800">{equalsTx.lista.length} transações</strong> · {formatCurrency(equalsTx.total)}
            {equalsTx.cobertos && equalsTx.cobertos.size > 0 && <> · adquirentes conferidas: <strong className="text-gray-700">{[...equalsTx.cobertos].join(', ')}</strong></>}
            {!equalsTx.cobertos && <span className="text-amber-600"> · a Equals está sem a coluna Adquirente mapeada: todas as adquirentes do sistema serão conferidas</span>}
          </p>
        )}
      </div>

      {/* Ação */}
      <div className="flex items-center gap-3">
        <button onClick={diagnosticar} disabled={!podeDiagnosticar || loading}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Diagnosticar
        </button>
        {!podeDiagnosticar && <span className="text-[11px] text-gray-400">Selecione rede + empresa + período, envie os arquivos e mapeie ao menos Autorização e Valor (e a adquirente de cada arquivo).</span>}
      </div>

      {/* Resultado */}
      {resultado?.semConfig && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">
            {resultado.webposto ? (
              <>Nenhuma <strong>administradora</strong> parametrizada para esta rede. Informe adquirente, bandeira e modalidade em
              <strong> Cadastros → Clientes → Editar rede → Administradoras</strong> e tente de novo.</>
            ) : (
              <>Nenhuma <strong>conta de cartão</strong> configurada para esta rede. Marque as contas em
              <strong> Cadastros → Clientes → Editar rede → Empresas → Contas de cartão</strong> e tente de novo.</>
            )}
          </p>
        </div>
      )}

      {resultado && !resultado.semConfig && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card titulo="Conciliadas" valor={resultado.conciliadas.length} cor="emerald" icon={<CheckCircle2 className="h-6 w-6" />} />
            <Card titulo="Prováveis" valor={(resultado.provaveis || []).length} cor="sky" icon={<AlertCircle className="h-6 w-6" />} />
            <Card titulo="Só nos arquivos" valor={resultado.soEquals.length} cor="rose" icon={<XCircle className="h-6 w-6" />} />
            <Card titulo="Só no sistema" valor={resultado.soSistema.length} cor="amber" icon={<XCircle className="h-6 w-6" />} />
          </div>
          <div className="flex flex-wrap gap-4 text-[12px] text-gray-600 px-1">
            <span>Arquivos: <strong>{resultado.totalEquals}</strong> · {formatCurrency(resultado.valorEquals)}</span>
            <span>Sistema: <strong>{resultado.totalSistema}</strong> · {formatCurrency(resultado.valorSistema)}</span>
            {resultado.semDocumento > 0 && <span className="text-amber-600">{resultado.semDocumento} lançamento(s) do sistema sem documento (autorização)</span>}
            {resultado.foraCobertura?.length > 0 && (
              <span className="text-gray-500">Não conferidos (adquirente sem arquivo): {resultado.foraCobertura.map(([a, n]) => `${a} (${n})`).join(', ')}</span>
            )}
          </div>

          <AjustesSugeridos resultado={resultado} />
          <AlertasParcelamento itens={resultado.alertasParcelamento || []} />
          <ListaProvaveis itens={resultado.provaveis || []} />
          <ListaDivergencia titulo="Só nos arquivos (não achou no sistema)" itens={resultado.soEquals} cor="rose" />
          <ListaDivergencia titulo="Só no sistema (não achou nos arquivos)" itens={resultado.soSistema} cor="amber" />
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
  { tipo: 'semEquals',  titulo: 'Sem correspondência nos arquivos' },
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
      return <>valor no sistema {sis(formatCurrency(s.valor))} ≠ {e.origem || 'arquivo'} {eq(formatCurrency(e.valor))}</>;
    case 'bandeira':
      return <>bandeira no sistema {sis(s.bandeira || '—')} ≠ {e.origem || 'arquivo'} {eq(e.bandeira || '—')}</>;
    case 'modalidade':
      return <>tipo no sistema {sis(s.modalidade || '—')} ≠ {e.origem || 'arquivo'} {eq(e.modalidade || '—')}</>;
    case 'bandeira_modalidade':
      return <>bandeira {sis(s.bandeira || '—')} ≠ {eq(e.bandeira || '—')} e tipo {sis(s.modalidade || '—')} ≠ {eq(e.modalidade || '—')}</>;
    default: // autorizacao
      return <>autorização no sistema {sis(s.autorizacao)} ≠ {e.origem || 'arquivo'} {eq(e.autorizacao)}</>;
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
          Lançamento no sistema (conta <strong>{rotuloConta(s.conta, s.contaNome)}</strong>, {fmtDataBR(s.data)}) sem correspondência nos arquivos das adquirentes: autorização <span className="font-mono">{s.autorizacao}</span> · {formatCurrency(s.valor)}. → Revisar (valor/autorização errada, duplicidade ou lançamento indevido).
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
        Transação {e.origem ? `(${e.origem}) ` : ''}sem correspondência no sistema: <strong>{e.adquirente}/{e.bandeira}/{e.modalidade}</strong> · autorização <span className="font-mono">{e.autorizacao}</span> · {formatCurrency(e.valor)}{e.hora ? <> · {e.hora}</> : null}. → Lançar no sistema.
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
                    o sistema fatiou em <strong>{a.sistema.parcelas}x</strong> ({a.sistema.membros.map(m => m.documento).join(', ')}), mas no arquivo da adquirente <strong>não é parcelado</strong>. → Verificar: lançamento à vista foi parcelado indevidamente.
                    {a.sistema.funcionario && <span className="text-indigo-600 font-medium"> · caixa de {a.sistema.funcionario}</span>}
                  </p>
                </>
              ) : (
                <>
                  <span className="mt-0.5 inline-flex items-center rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold px-2 py-0.5 flex-shrink-0">Adquirente parcelada</span>
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
                <th className="text-left px-3 py-1.5 font-semibold">Bandeira (Sist. / Arquivo)</th>
                <th className="text-left px-3 py-1.5 font-semibold">Tipo (Sist. / Arquivo)</th>
                <th className="text-left px-3 py-1.5 font-semibold">Autorização (Sist. / Arquivo)</th>
                <th className="text-center px-3 py-1.5 font-semibold">Turno</th>
                <th className="text-left px-3 py-1.5 font-semibold">Funcionário / Resp.</th>
                <th className="text-right px-3 py-1.5 font-semibold">Valor (Sist. / Arquivo)</th>
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
  const temHora = itens.some(t => t.hora);
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
                {temHora && <th className="text-center px-3 py-1.5 font-semibold">Hora</th>}
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
                  {temHora && <td className="px-3 py-1 text-center text-gray-700">{t.hora || '—'}</td>}
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

// Um arquivo de vendas: layout, adquirente (quando o arquivo é de uma só),
// mapeamento das colunas e prévia das primeiras linhas.
const MAP_FIELDS = [
  { campo: 'adquirente', label: 'Adquirente', cor: 'bg-sky-50 text-sky-700', soMulti: true },
  { campo: 'bandeira', label: 'Bandeira', cor: 'bg-purple-50 text-purple-700' },
  { campo: 'modalidade', label: 'Modalidade (déb/créd)', cor: 'bg-amber-50 text-amber-700' },
  { campo: 'autorizacao', label: 'Autorização *', cor: 'bg-blue-50 text-blue-700' },
  { campo: 'valor', label: 'Valor bruto *', cor: 'bg-emerald-50 text-emerald-700' },
  { campo: 'total', label: 'Total da venda (parcelado)', cor: 'bg-teal-50 text-teal-700' },
  { campo: 'parcelas', label: 'Parcelas', cor: 'bg-indigo-50 text-indigo-700' },
  { campo: 'hora', label: 'Hora', cor: 'bg-rose-50 text-rose-700' },
];

function ArquivoVendas({ arq, lay, modelos, adquirentesRede, adquirentesCatalogo = [], catalogoFixos = { bandeiras: [], modalidades: [] }, onFixo, resumo, onLayout, onAdquirente, onCol, onRemover, onSalvarModelo, onExcluirModelo }) {
  const [salvarAberto, setSalvarAberto] = useState(false);
  const [nomeModelo, setNomeModelo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [msgModelo, setMsgModelo] = useState('');
  const salvarModelo = async (atualizar) => {
    setSalvando(true); setMsgModelo('');
    try {
      const m = await onSalvarModelo({ nome: nomeModelo.trim(), atualizar });
      setSalvarAberto(false); setNomeModelo('');
      setMsgModelo(`Modelo "${m.nome}" salvo — será aplicado automaticamente em arquivos com estas colunas.`);
    } catch (e) { setMsgModelo(e.message); }
    finally { setSalvando(false); }
  };
  const campos = MAP_FIELDS.filter(f => !f.soMulti || lay.multi);
  const corColuna = (i) => campos.find(x => String(arq.cols[x.campo]) === String(i))?.cor || '';
  // Adquirentes da rede (já parametrizadas) primeiro; depois o restante do catálogo.
  const daRede = [...new Set(adquirentesRede)].sort();
  const outrasAdq = [...new Set([...adquirentesCatalogo, ...(arq.adquirente ? [arq.adquirente] : [])])]
    .filter(a => !daRede.includes(a)).sort();
  const sel = 'h-9 rounded-lg border border-gray-200 bg-white px-2 text-[12px] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100';

  return (
    <div className="rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <FileText className="h-4 w-4 text-blue-600" />
        <span className="text-[12px] font-medium text-gray-800">{arq.nome}</span>
        <span className="text-[11px] text-gray-400">· {arq.rows.length} linhas · {arq.headers.length} colunas</span>
        {resumo && (
          <span className="text-[11px] text-gray-500">
            · <strong className="text-gray-700">{resumo.qtd} transações</strong> · {formatCurrency(resumo.total)}
            {resumo.ignoradas > 0 && <span className="text-amber-600"> · {resumo.ignoradas} sem autorização/valor</span>}
          </span>
        )}
        <button onClick={onRemover} className="ml-auto inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-800">
          <X className="h-3.5 w-3.5" /> Remover
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Layout</label>
          <select value={arq.layout} onChange={(e) => onLayout(e.target.value)} className={sel}>
            {modelos.length > 0 && (
              <optgroup label="Modelos salvos">
                {modelos.map(m => <option key={m.id} value={`m:${m.id}`}>{m.nome}{m.adquirente ? ` · ${m.adquirente}` : ''}</option>)}
              </optgroup>
            )}
            <optgroup label="Padrões">
              {LAYOUTS.map(l => <option key={l.k} value={l.k}>{l.rot}</option>)}
            </optgroup>
          </select>
        </div>
        {!lay.multi && (
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Adquirente do arquivo *</label>
            <select value={arq.adquirente} onChange={(e) => onAdquirente(e.target.value)} className={sel}>
              <option value="">— selecione —</option>
              {daRede.length > 0 && (
                <optgroup label="Parametrizadas nesta rede">
                  {daRede.map(a => <option key={a} value={a}>{a}</option>)}
                </optgroup>
              )}
              {outrasAdq.length > 0 && (
                <optgroup label={daRede.length ? 'Outras do catálogo' : 'Catálogo'}>
                  {outrasAdq.map(a => <option key={a} value={a}>{a}</option>)}
                </optgroup>
              )}
            </select>
          </div>
        )}
        {campos.map(f => (
          <div key={f.campo}>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{f.label}</label>
            <select value={arq.cols[f.campo]} onChange={(e) => onCol(f.campo, e.target.value)} className={sel}>
              <option value="">— selecione —</option>
              {arq.headers.map((h, i) => <option key={i} value={i}>{h || `(coluna ${i + 1})`}</option>)}
            </select>
            {/* Sem coluna no arquivo: valor fixo para todas as linhas */}
            {(f.campo === 'modalidade' || f.campo === 'bandeira') && arq.cols[f.campo] === '' && (
              <select value={arq.fixos?.[f.campo] || ''} onChange={(e) => onFixo(f.campo, e.target.value)}
                title="O arquivo não tem esta coluna? Use um valor fixo para todas as linhas."
                className={`${sel} mt-1 block w-full border-dashed`}>
                <option value="">{f.campo === 'modalidade' ? 'ou fixo: ex. Crédito' : 'ou fixo…'}</option>
                {(f.campo === 'modalidade' ? catalogoFixos.modalidades : catalogoFixos.bandeiras).map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            )}
          </div>
        ))}
      </div>
      {/* Modelo de layout: salva este mapeamento para os próximos arquivos com as mesmas colunas */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
        <span className="text-[11px] text-gray-500">
          {lay.modelo ? <>Usando o modelo <strong className="text-gray-700">{lay.modelo.nome}</strong>.</> : 'Mapeou as colunas? Salve como modelo para não repetir no próximo arquivo.'}
        </span>
        {salvarAberto ? (
          <>
            <input value={nomeModelo} onChange={e => setNomeModelo(e.target.value)} placeholder="Nome do modelo (ex.: Sipag)" autoFocus
              className="h-8 w-56 rounded-lg border border-gray-200 bg-white px-2 text-[12px] focus:border-blue-400 focus:outline-none" />
            <button onClick={() => salvarModelo(false)} disabled={salvando || nomeModelo.trim().length < 2 || (!lay.multi && !arq.adquirente)}
              className="h-8 rounded-lg bg-blue-600 px-3 text-[12px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50">Salvar</button>
            <button onClick={() => setSalvarAberto(false)} className="h-8 rounded-lg px-2 text-[12px] text-gray-500 hover:text-gray-800">Cancelar</button>
          </>
        ) : (
          <div className="ml-auto flex gap-2">
            {lay.modelo && (
              <>
                <button onClick={() => salvarModelo(true)} disabled={salvando}
                  className="h-8 rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Atualizar modelo</button>
                <button onClick={onExcluirModelo}
                  className="h-8 rounded-lg px-2 text-[12px] text-red-600 hover:bg-red-50">Excluir modelo</button>
              </>
            )}
            <button onClick={() => { setSalvarAberto(true); setNomeModelo(lay.modelo ? '' : (arq.adquirente || '')); }}
              className="h-8 rounded-lg border border-blue-200 bg-white px-3 text-[12px] font-medium text-blue-700 hover:bg-blue-50">Salvar como novo modelo</button>
          </div>
        )}
        {msgModelo && <p className="basis-full text-[11px] text-gray-600">{msgModelo}</p>}
      </div>

      <p className="text-[10px] text-gray-400">
        * obrigatórios. A conferência casa por <strong>adquirente · bandeira · modalidade · autorização · valor bruto</strong>.
        {!lay.multi && ' A adquirente deve ser a mesma usada nas contas de cartão da rede.'}
      </p>

      <div className="overflow-x-auto border border-gray-100 rounded-lg">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 text-gray-500">
            <tr>{arq.headers.map((h, i) => (
              <th key={i} className={`text-left px-2 py-1.5 font-semibold whitespace-nowrap ${corColuna(i)}`}>{h || `col ${i + 1}`}</th>
            ))}</tr>
          </thead>
          <tbody>
            {arq.rows.slice(0, 6).map((r, ri) => (
              <tr key={ri} className="border-t border-gray-50">
                {arq.headers.map((_, ci) => <td key={ci} className="px-2 py-1 text-gray-600 whitespace-nowrap">{r[ci]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {arq.rows.length > 6 && <p className="text-[10px] text-gray-400">Mostrando 6 de {arq.rows.length} linhas.</p>}
    </div>
  );
}
