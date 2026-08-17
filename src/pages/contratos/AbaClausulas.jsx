// Aba "Cláusulas" — catálogo admin das cláusulas contratuais (cci_clausulas).
// Move as cláusulas do arquivo .js para o banco, editáveis, com condição de
// aplicabilidade, obrigatoriedade, ordem, variáveis e marcação jurídica.

import { useEffect, useState, useCallback } from 'react';
import {
  Loader2, Plus, Pencil, Trash2, Pause, Play, RotateCcw, AlertTriangle,
} from 'lucide-react';
import Modal from '../../components/ui/Modal';
import {
  listarClausulas, salvarClausula, alternarAtivoClausula, excluirClausula,
  restaurarPadroes, TIPOS_CLAUSULA, MODOS_CONDICAO,
} from '../../services/clausulasService';

const TIPO_STYLE = {
  objeto:      'bg-blue-50 text-blue-700 border-blue-200',
  servico:     'bg-emerald-50 text-emerald-700 border-emerald-200',
  pagamento:   'bg-amber-50 text-amber-700 border-amber-200',
  geral:       'bg-gray-100 text-gray-600 border-gray-200',
  juridica:    'bg-violet-50 text-violet-700 border-violet-200',
  lgpd:        'bg-rose-50 text-rose-700 border-rose-200',
  encerramento:'bg-slate-100 text-slate-600 border-slate-200',
};

function condicaoTexto(c) {
  const cond = c.condicao || {};
  switch (cond.modo) {
    case 'sempre':    return 'Sempre';
    case 'categoria': return `Categoria = ${cond.valor || '?'}`;
    case 'servico':   return `Serviço: ${cond.valor || c.chave}`;
    case 'flag':      return `Flag: ${cond.valor || '?'}`;
    default:          return '—';
  }
}

// Preview simples dos blocos.
function PreviewBlocos({ blocos }) {
  if (!Array.isArray(blocos)) return <p className="text-xs text-rose-600">corpo inválido</p>;
  return (
    <div className="space-y-2 text-[13px] leading-relaxed text-gray-700">
      {blocos.map((b, i) => {
        if (b.tipo === 'subtitulo') return <p key={i} className="font-semibold text-gray-800">{b.texto}</p>;
        if (b.tipo === 'paragrafo') return <p key={i}>{b.texto}</p>;
        if (b.tipo === 'lista') return <ul key={i} className={`ml-5 ${b.ordenada ? 'list-decimal' : 'list-disc'}`}>{(b.itens || []).map((it, j) => <li key={j}>{it}</li>)}</ul>;
        if (b.tipo === 'tabela') return (
          <table key={i} className="w-full border-collapse text-xs">
            <thead><tr>{(b.colunas || []).map((c, j) => <th key={j} className="border border-gray-200 bg-gray-50 px-2 py-1 text-left">{c}</th>)}</tr></thead>
            <tbody>{(b.linhas || []).map((l, j) => <tr key={j}>{l.map((cel, k) => <td key={k} className="border border-gray-200 px-2 py-1">{cel}</td>)}</tr>)}</tbody>
          </table>
        );
        if (b.tipo === 'marcador') return <p key={i} className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-600">⟦ tabela de serviços injetada aqui ⟧</p>;
        return null;
      })}
    </div>
  );
}

export default function AbaClausulas({ showToast }) {
  const [clausulas, setClausulas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // clausula em edição ou {} nova
  const [restaurando, setRestaurando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      setClausulas(await listarClausulas());
    } catch (e) {
      showToast?.('error', 'Erro ao carregar cláusulas: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { carregar(); }, [carregar]);

  const toggle = async (c) => {
    try { await alternarAtivoClausula(c.id, !c.ativo); carregar(); }
    catch (e) { showToast?.('error', e.message); }
  };
  const remover = async (c) => {
    if (!confirm(`Excluir a cláusula "${c.titulo}"?`)) return;
    try { await excluirClausula(c.id); carregar(); showToast?.('success', 'Cláusula excluída.'); }
    catch (e) { showToast?.('error', e.message); }
  };
  const restaurar = async () => {
    if (!confirm('Restaurar as cláusulas padrão? As customizadas são preservadas; as padrão voltam ao texto original.')) return;
    setRestaurando(true);
    try { await restaurarPadroes(); await carregar(); showToast?.('success', 'Padrões restaurados.'); }
    catch (e) { showToast?.('error', e.message); }
    finally { setRestaurando(false); }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">Catálogo de cláusulas que o motor seleciona conforme os serviços contratados.</p>
        <div className="flex items-center gap-2">
          <button onClick={restaurar} disabled={restaurando}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            {restaurando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Restaurar padrões
          </button>
          <button onClick={() => setModal({ tipo: 'geral', condicao: { modo: 'sempre' }, corpo: [], ordem: 100, ativo: true, variaveis: [] })}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" /> Nova cláusula
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 p-8 text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 w-12">Ordem</th>
                <th className="px-4 py-3">Cláusula</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Aplica quando</th>
                <th className="px-4 py-3">Sinais</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {clausulas.map(c => (
                <tr key={c.id} className={c.ativo ? '' : 'opacity-50'}>
                  <td className="px-4 py-3 tabular-nums text-gray-400">{c.ordem}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{c.titulo}</div>
                    <div className="text-xs text-gray-400">{c.chave}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${TIPO_STYLE[c.tipo] || TIPO_STYLE.geral}`}>{c.tipo}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{condicaoTexto(c)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.obrigatoria && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">obrigatória</span>}
                      {c.revisar_juridico && <span className="flex items-center gap-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"><AlertTriangle className="h-3 w-3" />jurídico</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => toggle(c)} title={c.ativo ? 'Desativar' : 'Ativar'} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                        {c.ativo ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </button>
                      <button onClick={() => setModal(c)} title="Editar" className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => remover(c)} title="Excluir" className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <ModalClausula
          clausula={modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); carregar(); }}
          showToast={showToast}
        />
      )}
    </div>
  );
}

// ── Modal editar/criar ──────────────────────────────────────
function ModalClausula({ clausula, onClose, onSaved, showToast }) {
  const isEdit = !!clausula.id;
  const [form, setForm] = useState({
    chave: '', titulo: '', tipo: 'geral', ordem: 100, obrigatoria: false,
    revisar_juridico: false, ativo: true, condicao: { modo: 'sempre' }, variaveis: [],
    ...clausula,
  });
  const [corpoTexto, setCorpoTexto] = useState(JSON.stringify(clausula.corpo ?? [], null, 2));
  const [erroJson, setErroJson] = useState('');
  const [salvando, setSalvando] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setCond = (k, v) => setForm(f => ({ ...f, condicao: { ...f.condicao, [k]: v } }));

  let corpoParsed = null;
  try { corpoParsed = JSON.parse(corpoTexto); } catch { /* mostrado no submit */ }

  const submit = async (e) => {
    e.preventDefault();
    let corpo;
    try { corpo = JSON.parse(corpoTexto); if (!Array.isArray(corpo)) throw new Error('deve ser um array de blocos'); }
    catch (err) { setErroJson('JSON inválido: ' + err.message); return; }
    setErroJson('');
    setSalvando(true);
    try {
      const variaveis = Array.isArray(form.variaveis) ? form.variaveis : String(form.variaveis || '').split(',').map(s => s.trim()).filter(Boolean);
      await salvarClausula({ ...form, corpo, variaveis, ordem: Number(form.ordem) || 100 });
      showToast?.('success', 'Cláusula salva.');
      onSaved();
    } catch (err) {
      showToast?.('error', 'Erro ao salvar: ' + err.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Editar cláusula' : 'Nova cláusula'} size="xl"
      footer={(
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancelar</button>
          <button type="submit" form="form-clausula" disabled={salvando} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />} {isEdit ? 'Salvar' : 'Criar'}
          </button>
        </div>
      )}>
      <form id="form-clausula" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Título *</label>
            <input required value={form.titulo} onChange={e => set('titulo', e.target.value)} className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Chave *</label>
            <input required value={form.chave} onChange={e => set('chave', e.target.value)} disabled={isEdit} placeholder="geral_xxx" className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm disabled:bg-gray-50 disabled:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Tipo</label>
            <select value={form.tipo} onChange={e => set('tipo', e.target.value)} className="w-full h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm">
              {TIPOS_CLAUSULA.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Ordem</label>
            <input type="number" value={form.ordem} onChange={e => set('ordem', e.target.value)} className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 h-10 mt-5">
            <input type="checkbox" checked={!!form.obrigatoria} onChange={e => set('obrigatoria', e.target.checked)} /> Obrigatória
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 h-10 mt-5">
            <input type="checkbox" checked={!!form.revisar_juridico} onChange={e => set('revisar_juridico', e.target.checked)} /> Revisar jurídico
          </label>
        </div>

        {/* Condição */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Aplica quando</label>
            <select value={form.condicao.modo} onChange={e => setCond('modo', e.target.value)} className="w-full h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm">
              {MODOS_CONDICAO.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </div>
          {form.condicao.modo !== 'sempre' && (
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                {form.condicao.modo === 'categoria' ? 'Categoria (bpo, consultoria…)' : form.condicao.modo === 'servico' ? 'Chave do serviço (ex.: servico_conciliacao_bancaria)' : 'Flag (ex.: envolve_dados_pessoais)'}
              </label>
              <input value={form.condicao.valor ?? ''} onChange={e => setCond('valor', e.target.value)} className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm" />
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Variáveis (separadas por vírgula)</label>
          <input value={Array.isArray(form.variaveis) ? form.variaveis.join(', ') : form.variaveis} onChange={e => set('variaveis', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="foro.comarca, foro.uf" className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm" />
        </div>

        {/* Corpo (blocos JSON) + preview */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Corpo — blocos (JSON)</label>
            <textarea rows={14} value={corpoTexto} onChange={e => setCorpoTexto(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs resize-none focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            {erroJson && <p className="mt-1 text-xs text-rose-600">{erroJson}</p>}
            <p className="mt-1 text-[11px] text-gray-400">Tipos: subtitulo, paragrafo, lista (itens[], ordenada?), tabela (colunas[], linhas[][]), marcador (nome). Use {'{{variavel}}'} para dados dinâmicos.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Pré-visualização</label>
            <div className="h-[22rem] overflow-auto rounded-lg border border-gray-100 bg-gray-50 p-3">
              <PreviewBlocos blocos={corpoParsed} />
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}
