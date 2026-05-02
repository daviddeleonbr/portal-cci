// Relatorios de BI (Power BI) cadastrados pela CCI.
// Lista cards de cada relatorio disponivel para a empresa do cliente; ao clicar
// em "Visualizar dados", abre um iframe full-width com o link publico (escondido
// no JSX, exposto apenas como src do iframe). Botao "Voltar aos relatorios"
// permite escolher outro relatorio.

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3, Eye, Loader2, ArrowLeft, ExternalLink, AlertCircle, Maximize2,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { useClienteSession } from '../../hooks/useAuth';
import * as relatoriosBiService from '../../services/relatoriosBiService';

export default function ClienteRelatoriosBi() {
  const session = useClienteSession();
  const cliente = session?.cliente;
  const chaveApi = session?.chaveApi;

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [relatorios, setRelatorios] = useState([]);
  const [selecionado, setSelecionado] = useState(null);

  const carregar = useCallback(async () => {
    if (!chaveApi?.id) { setLoading(false); return; }
    try {
      setLoading(true); setErro(null);
      const lista = await relatoriosBiService.listarParaCliente({
        chave_api_id: chaveApi.id,
        cliente_id: cliente?.id || null,
      });
      setRelatorios(lista);
    } catch (e) {
      setErro(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [chaveApi?.id, cliente?.id]);

  useEffect(() => { carregar(); }, [carregar]);

  // ─── Modo viewer (iframe) ────────────────────────────────────────────
  if (selecionado) {
    return (
      <div>
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <button
            onClick={() => setSelecionado(null)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13px] font-medium text-gray-700 hover:border-gray-300 hover:text-gray-900 transition-colors shadow-sm"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar aos relatórios
          </button>
          <div className="min-w-0 flex-1 px-2">
            <h2 className="text-sm font-semibold text-gray-900 truncate">{selecionado.nome}</h2>
            {selecionado.descricao && (
              <p className="text-[11.5px] text-gray-500 truncate">{selecionado.descricao}</p>
            )}
          </div>
          <button
            onClick={() => abrirEmFullscreen(`bi-iframe-${selecionado.id}`)}
            title="Abrir em tela cheia"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13px] font-medium text-gray-700 hover:border-gray-300 transition-colors shadow-sm"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            Tela cheia
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
          <iframe
            id={`bi-iframe-${selecionado.id}`}
            title={selecionado.nome}
            src={selecionado.link_publico}
            className="w-full"
            style={{ height: 'calc(100vh - 180px)', minHeight: 600, border: 0 }}
            allowFullScreen
          />
        </div>
      </div>
    );
  }

  // ─── Modo lista ──────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        title="Relatórios de BI"
        description="Painel de Business Intelligence cadastrados pela CCI Consultoria"
      />

      {/* Aviso de transicao */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 mb-5 flex items-start gap-3">
        <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-[12.5px] text-amber-900 leading-relaxed">
          <p className="font-semibold">Em transicao</p>
          <p>Estes relatórios continuarao disponíveis enquanto migramos para a plataforma proprietaria. Para duvidas, fale com a CCI no menu Suporte.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-12 justify-center text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Carregando relatórios...</span>
        </div>
      ) : erro ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          Erro ao carregar relatórios: {erro}
        </div>
      ) : relatorios.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center">
          <BarChart3 className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-700">Nenhum relatório de BI cadastrado</p>
          <p className="text-[12.5px] text-gray-500 mt-1">
            A CCI ainda não cadastrou relatórios para a sua conta. Caso precise, fale com seu consultor.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {relatorios.map((r, i) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="group bg-white rounded-2xl border border-gray-200/60 shadow-sm hover:shadow-md hover:border-blue-200 transition-all overflow-hidden"
            >
              <div className="p-5">
                <div className="flex items-start gap-3 mb-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 text-white flex items-center justify-center shadow-sm flex-shrink-0">
                    <BarChart3 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-gray-900 leading-tight truncate">{r.nome}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">Power BI</p>
                  </div>
                </div>
                {r.descricao && (
                  <p className="text-[12.5px] text-gray-600 leading-relaxed line-clamp-3 min-h-[3em]">
                    {r.descricao}
                  </p>
                )}
              </div>
              <div className="border-t border-gray-100 px-5 py-3 flex items-center justify-end">
                <button
                  onClick={() => setSelecionado(r)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 text-[12.5px] font-semibold transition-colors shadow-sm group-hover:bg-blue-700"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Visualizar dados
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

// Ativa modo fullscreen no iframe usando a API do navegador (graceful degradation
// se nao houver suporte — apenas ignora).
function abrirEmFullscreen(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
  if (req) req.call(el);
}
