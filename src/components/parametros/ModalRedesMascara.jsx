// Modal: escolhe QUAIS redes podem usar uma máscara (DRE ou Fluxo).
// Reutilizado pelas duas páginas de parâmetros — recebe as funções do serviço
// específico (listarRedes/definirRedes) por prop. Vazio = disponível a todas.
import { useState, useEffect } from 'react';
import { X, Loader2, Save, Network, Building2, AlertCircle } from 'lucide-react';
import * as mapService from '../../services/mapeamentoService';
import * as autosystemService from '../../services/autosystemService';

export default function ModalRedesMascara({ mascara, listarRedes, definirRedes, onClose, onSaved }) {
  const [redesWp, setRedesWp] = useState([]);
  const [redesAs, setRedesAs] = useState([]);
  const [selecionadas, setSelecionadas] = useState(() => new Set()); // 'wp:<id>' | 'as:<id>'
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCarregando(true);
      try {
        const [wp, as, atuais] = await Promise.all([
          mapService.listarChavesApi().catch(() => []),
          autosystemService.listarRedes().catch(() => []),
          listarRedes(mascara.id).catch(() => []),
        ]);
        if (!vivo) return;
        setRedesWp(wp || []);
        setRedesAs((as || []).filter(r => r.ativo !== false));
        const sel = new Set();
        (atuais || []).forEach(r => {
          if (r.chave_api_id) sel.add(`wp:${r.chave_api_id}`);
          if (r.as_rede_id) sel.add(`as:${r.as_rede_id}`);
        });
        setSelecionadas(sel);
      } catch (e) {
        if (vivo) setErro(e.message || 'Falha ao carregar redes');
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [mascara.id, listarRedes]);

  const toggle = (key) => setSelecionadas(prev => {
    const s = new Set(prev);
    if (s.has(key)) s.delete(key); else s.add(key);
    return s;
  });

  const total = redesWp.length + redesAs.length;
  const todas = selecionadas.size === 0;

  const salvar = async () => {
    setSalvando(true); setErro(null);
    try {
      const redes = [...selecionadas].map(k => {
        const [tipo, id] = k.split(':');
        return tipo === 'wp' ? { chave_api_id: id } : { as_rede_id: id };
      });
      await definirRedes(mascara.id, redes);
      onSaved?.();
      onClose();
    } catch (e) {
      setErro(e.message || 'Falha ao salvar');
    } finally {
      setSalvando(false);
    }
  };

  const Item = ({ keyId, nome }) => {
    const marcada = selecionadas.has(keyId);
    return (
      <label className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
        <input type="checkbox" checked={marcada} onChange={() => toggle(keyId)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
        <Building2 className="h-3.5 w-3.5 text-gray-300 flex-shrink-0" />
        <span className="text-[13px] text-gray-800 truncate">{nome}</span>
      </label>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={salvando ? undefined : onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100">
          <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
            <Network className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900 truncate">Redes que podem usar</h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate">Máscara: <strong>{mascara.nome}</strong></p>
          </div>
          <button onClick={onClose} disabled={salvando} className="p-2 -mr-1 rounded-lg hover:bg-gray-100 text-gray-500 disabled:opacity-50">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className={`px-5 py-2.5 text-[12px] flex items-center gap-2 border-b border-gray-100 ${
          todas ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'
        }`}>
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {todas
            ? 'Nenhuma marcada = disponível para TODAS as redes.'
            : `${selecionadas.size} de ${total} rede(s) selecionada(s) — só elas verão esta máscara.`}
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          {carregando ? (
            <div className="flex items-center justify-center gap-2 py-10 text-gray-500 text-sm">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" /> Carregando redes...
            </div>
          ) : (
            <>
              {redesWp.length > 0 && (
                <div>
                  <p className="px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Webposto</p>
                  {redesWp.map(r => <Item key={`wp:${r.id}`} keyId={`wp:${r.id}`} nome={r.nome} />)}
                </div>
              )}
              {redesAs.length > 0 && (
                <div>
                  <p className="px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Autosystem</p>
                  {redesAs.map(r => <Item key={`as:${r.id}`} keyId={`as:${r.id}`} nome={r.nome} />)}
                </div>
              )}
              {total === 0 && <p className="text-center text-sm text-gray-400 py-8">Nenhuma rede cadastrada.</p>}
            </>
          )}
        </div>

        {erro && <div className="px-5 py-2 text-[12px] text-red-700 bg-red-50 flex items-center gap-2"><AlertCircle className="h-3.5 w-3.5" />{erro}</div>}

        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/60 flex items-center gap-2">
          {!todas && (
            <button onClick={() => setSelecionadas(new Set())} disabled={salvando}
              className="text-xs text-gray-600 hover:text-gray-900">Limpar (todas)</button>
          )}
          <div className="flex-1" />
          <button onClick={onClose} disabled={salvando} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancelar</button>
          <button onClick={salvar} disabled={salvando || carregando}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-40">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
