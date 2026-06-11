// Wizard multi-passo de solicitação de orçamento.
// 4 passos:
//   1. Dados do solicitante (nome, whatsapp, email — todos obrigatórios)
//   2. O que deseja melhorar (texto livre)
//   3. Empresas:
//      - Primeiro: quantas empresas?
//      - Depois: tabela com 1 linha por empresa pra preencher
//      - Coluna "Conveniência" abre modal pra inserir faturamento da loja
//   4. Revisão + envio

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, Send, CheckCircle2, Loader2,
  User, Phone, Mail, Sparkles, Building2, ShoppingBag, X,
} from 'lucide-react';
import LogoCCI from '../components/ui/LogoCCI';
import * as svc from '../services/orcamentoSolicitacoesService';

const PASSOS = [
  { id: 1, label: 'Você' },
  { id: 2, label: 'Desejo' },
  { id: 3, label: 'Empresas' },
  { id: 4, label: 'Revisão' },
];

function fmtNumero(v) {
  if (v === '' || v == null) return '—';
  return new Intl.NumberFormat('pt-BR').format(Number(v) || 0);
}
function fmtMoeda(v) {
  if (v === '' || v == null) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(Number(v) || 0);
}
function mascaraWhatsapp(v) {
  const d = String(v || '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
function emailValido(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
}

export default function SolicitarOrcamento() {
  const navigate = useNavigate();
  const [passo, setPasso] = useState(1);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState(null);

  // Estado do "quantas empresas?" — antes da tabela aparecer
  const [qtdInput, setQtdInput] = useState(1);
  const [qtdConfirmada, setQtdConfirmada] = useState(false);

  // Modal de conveniência
  const [modalConv, setModalConv] = useState(null); // { idx, valor }

  const [dados, setDados] = useState({
    nome: '',
    whatsapp: '',
    email: '',
    desejo: '',
    postos: [],
  });

  const set = (campo, valor) => setDados(prev => ({ ...prev, [campo]: valor }));
  const setEmp = (idx, campo, valor) => setDados(prev => ({
    ...prev,
    postos: prev.postos.map((p, i) => i === idx ? { ...p, [campo]: valor } : p),
  }));

  const confirmarQtd = () => {
    const n = Math.max(1, Math.min(50, Number(qtdInput) || 1));
    setDados(prev => ({
      ...prev,
      postos: Array.from({ length: n }, () => svc.empresaNova()),
    }));
    setQtdConfirmada(true);
  };

  const passo1Valido = (
    dados.nome.trim().length >= 3
    && dados.whatsapp.replace(/\D/g, '').length >= 10
    && emailValido(dados.email)
  );
  const passo2Valido = dados.desejo.trim().length >= 10;
  const passo3Valido = qtdConfirmada && dados.postos.length > 0 && dados.postos.every(p => (
    p.nome.trim().length > 0
    && Number(p.litrosMes) > 0
    && Number(p.faturamentoMes) > 0
  ));

  const avancar = () => {
    setErro(null);
    if (passo === 1 && !passo1Valido) { setErro('Preencha nome, WhatsApp e um e-mail válido.'); return; }
    if (passo === 2 && !passo2Valido) { setErro('Conte um pouco sobre o que deseja melhorar.'); return; }
    if (passo === 3 && !passo3Valido) { setErro('Cada empresa precisa de nome, litros e faturamento.'); return; }
    setPasso(p => Math.min(p + 1, PASSOS.length));
  };
  const voltar = () => { setErro(null); setPasso(p => Math.max(p - 1, 1)); };

  const enviar = async () => {
    setEnviando(true); setErro(null);
    try {
      const postosLimpos = dados.postos.map(p => ({
        nome: p.nome.trim(),
        litrosMes: Number(p.litrosMes) || 0,
        faturamentoMes: Number(p.faturamentoMes) || 0,
        contasBancarias: Number(p.contasBancarias) || 0,
        possuiCartaoFrota: !!p.possuiCartaoFrota,
        cartoesFrota: (p.cartoesFrota || '').trim(),
        adquirentes: (p.adquirentes || '').trim(),
        funcionarios: Number(p.funcionarios) || 0,
        custoMedioFuncionario: Number(p.custoMedioFuncionario) || 0,
        possuiConveniencia: !!p.possuiConveniencia,
        faturamentoConveniencia: Number(p.faturamentoConveniencia) || 0,
      }));
      await svc.criarSolicitacao({ ...dados, postos: postosLimpos });
      setEnviado(true);
    } catch (err) {
      setErro(err.message || 'Erro ao enviar. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  };

  if (enviado) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="max-w-md text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/20 border border-emerald-400/40 mb-6">
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-3">Solicitação recebida!</h1>
          <p className="text-slate-300 leading-relaxed mb-6">
            Obrigado, <strong>{dados.nome.split(' ')[0]}</strong>! Nossa equipe vai analisar e entrar
            em contato pelo WhatsApp <strong>{mascaraWhatsapp(dados.whatsapp)}</strong> com a proposta.
          </p>
          <Link to="/" className="inline-flex items-center gap-2 rounded-xl border border-slate-700 hover:border-slate-500 bg-slate-900 hover:bg-slate-800 px-5 py-2.5 text-sm font-medium transition-colors">
            <ArrowLeft className="h-4 w-4" /> Voltar ao site
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/[0.06] sticky top-0 bg-slate-950/80 backdrop-blur-md z-10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <span className="h-8 w-8 inline-flex items-center justify-center">
              <LogoCCI className="h-full w-full" />
            </span>
            <span className="text-[20px] font-bold tracking-tight leading-none mt-[1px]"
              style={{ fontFamily: "'Sora', sans-serif" }}>CCI</span>
          </Link>
          <button onClick={() => navigate('/')}
            className="text-[12px] text-slate-400 hover:text-white flex items-center gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar
          </button>
        </div>
      </header>

      <main className={`mx-auto py-10 sm:py-14 ${passo === 3 && qtdConfirmada ? 'max-w-[1600px] px-4 sm:px-6' : 'max-w-3xl px-6'}`}>
        {/* Stepper */}
        <div className="mb-10 max-w-3xl mx-auto">
          <div className="flex items-center gap-2">
            {PASSOS.map((p, i) => {
              const ativo = p.id === passo;
              const feito = p.id < passo;
              return (
                <div key={p.id} className="flex-1 flex items-center gap-2">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-[12px] font-bold transition-colors flex-shrink-0 ${
                    ativo ? 'bg-blue-600 text-white ring-4 ring-blue-600/20'
                      : feito ? 'bg-emerald-500 text-white'
                      : 'bg-slate-800 text-slate-500'
                  }`}>
                    {feito ? <CheckCircle2 className="h-4 w-4" /> : p.id}
                  </div>
                  {i < PASSOS.length - 1 && (
                    <div className={`flex-1 h-0.5 ${feito ? 'bg-emerald-500' : 'bg-slate-800'}`} />
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 uppercase tracking-wider">
            {PASSOS.map(p => (
              <div key={p.id} className={`flex-1 text-center ${p.id === passo ? 'text-blue-400 font-semibold' : ''}`}>
                {p.label}
              </div>
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={passo}
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="bg-slate-900/40 border border-white/[0.06] rounded-2xl p-6 sm:p-8">

            {/* PASSO 1 */}
            {passo === 1 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl sm:text-2xl font-semibold tracking-tight mb-1">Quem é você?</h2>
                  <p className="text-[13px] text-slate-400">Pra entrarmos em contato com a proposta.</p>
                </div>
                <Campo icon={User} label="Nome do proprietário" obrigatorio>
                  <input type="text" value={dados.nome} onChange={e => set('nome', e.target.value)}
                    placeholder="Seu nome completo"
                    className="w-full bg-slate-950 border border-slate-700 focus:border-blue-500 rounded-lg px-3 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                </Campo>
                <Campo icon={Phone} label="WhatsApp" obrigatorio>
                  <input type="tel" value={mascaraWhatsapp(dados.whatsapp)}
                    onChange={e => set('whatsapp', e.target.value.replace(/\D/g, ''))}
                    placeholder="(00) 00000-0000"
                    className="w-full bg-slate-950 border border-slate-700 focus:border-blue-500 rounded-lg px-3 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                </Campo>
                <Campo icon={Mail} label="E-mail" obrigatorio>
                  <input type="email" value={dados.email} onChange={e => set('email', e.target.value)}
                    placeholder="seu@email.com"
                    className="w-full bg-slate-950 border border-slate-700 focus:border-blue-500 rounded-lg px-3 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                </Campo>
              </div>
            )}

            {/* PASSO 2 */}
            {passo === 2 && (
              <div className="space-y-5">
                <h2 className="text-xl sm:text-2xl font-semibold tracking-tight mb-1">Conte sobre seu posto ou rede</h2>
                <Campo icon={Sparkles} label="O que você deseja melhorar?" obrigatorio>
                  <textarea value={dados.desejo} onChange={e => set('desejo', e.target.value)}
                    placeholder="Ex: Reduzir custos do financeiro, ter dashboards de gestão, terceirizar BPO contábil, melhorar conciliação..."
                    rows={6}
                    className="w-full bg-slate-950 border border-slate-700 focus:border-blue-500 rounded-lg px-3 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none" />
                </Campo>
              </div>
            )}

            {/* PASSO 3 — primeiro pergunta quantas, depois tabela */}
            {passo === 3 && !qtdConfirmada && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl sm:text-2xl font-semibold tracking-tight mb-1 flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-blue-400" /> Empresas
                  </h2>
                  <p className="text-[13px] text-slate-400">Quantas empresas você gostaria de incluir nesta solicitação?</p>
                </div>
                <div className="max-w-xs">
                  <Campo label="Quantidade de empresas" obrigatorio>
                    <input type="number" min={1} max={50} value={qtdInput}
                      onChange={e => setQtdInput(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 focus:border-blue-500 rounded-lg px-3 py-2.5 text-[16px] font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  </Campo>
                </div>
                <button type="button" onClick={confirmarQtd}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-5 py-2.5 text-sm font-semibold transition-colors">
                  Confirmar <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}

            {passo === 3 && qtdConfirmada && (
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <h2 className="text-xl sm:text-2xl font-semibold tracking-tight mb-1 flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-blue-400" /> Dados de {dados.postos.length} empresa{dados.postos.length !== 1 ? 's' : ''}
                    </h2>
                    <p className="text-[13px] text-slate-400">Preencha cada linha. Use a coluna "Conveniência" pra adicionar faturamento da loja.</p>
                  </div>
                  <button type="button" onClick={() => { setQtdConfirmada(false); setDados(prev => ({ ...prev, postos: [] })); }}
                    className="text-[12px] text-slate-400 hover:text-white">
                    Alterar quantidade
                  </button>
                </div>

                {/* Tabela */}
                <div className="rounded-xl border border-slate-800 overflow-hidden">
                  <table className="w-full table-fixed text-[11.5px]">
                    <colgroup>
                      <col className="w-[3%]" />
                      <col className="w-[14%]" />
                      <col className="w-[10%]" />
                      <col className="w-[11%]" />
                      <col className="w-[7%]" />
                      <col className="w-[6%]" />
                      <col className="w-[11%]" />
                      <col className="w-[14%]" />
                      <col className="w-[12%]" />
                      <col className="w-[12%]" />
                    </colgroup>
                    <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider text-[9.5px]">
                      <tr>
                        <th className="text-left px-2 py-2 font-semibold">#</th>
                        <th className="text-left px-2 py-2 font-semibold">Nome *</th>
                        <th className="text-right px-2 py-2 font-semibold">Litros *</th>
                        <th className="text-right px-2 py-2 font-semibold">Fatur. *</th>
                        <th className="text-right px-2 py-2 font-semibold">Bancos</th>
                        <th className="text-right px-2 py-2 font-semibold">Func.</th>
                        <th className="text-right px-2 py-2 font-semibold">Custo méd.</th>
                        <th className="text-left px-2 py-2 font-semibold">Cartão Frota</th>
                        <th className="text-left px-2 py-2 font-semibold">Adquirentes</th>
                        <th className="text-center px-2 py-2 font-semibold">Conveniência</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dados.postos.map((p, idx) => (
                        <tr key={idx} className="border-t border-slate-800 hover:bg-slate-900/40 transition-colors">
                          <td className="px-2 py-1.5 text-slate-500 font-mono text-[11px] text-center">{idx + 1}</td>
                          <td className="px-1.5 py-1">
                            <input type="text" value={p.nome} onChange={e => setEmp(idx, 'nome', e.target.value)}
                              placeholder="Nome"
                              className="w-full bg-slate-950 border border-slate-700 focus:border-blue-500 rounded px-2 py-1.5 text-[12px] focus:outline-none" />
                          </td>
                          <CelInput v={p.litrosMes} onChange={v => setEmp(idx, 'litrosMes', v)} />
                          <CelInput v={p.faturamentoMes} onChange={v => setEmp(idx, 'faturamentoMes', v)} prefixo="R$" />
                          <CelInput v={p.contasBancarias} onChange={v => setEmp(idx, 'contasBancarias', v)} />
                          <CelInput v={p.funcionarios} onChange={v => setEmp(idx, 'funcionarios', v)} />
                          <CelInput v={p.custoMedioFuncionario} onChange={v => setEmp(idx, 'custoMedioFuncionario', v)} prefixo="R$" />
                          <td className="px-1.5 py-1">
                            <div className="flex items-center gap-1.5">
                              <input type="checkbox" checked={p.possuiCartaoFrota}
                                onChange={e => setEmp(idx, 'possuiCartaoFrota', e.target.checked)}
                                className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 text-blue-600 focus:ring-blue-500 flex-shrink-0" />
                              <input type="text" value={p.cartoesFrota}
                                onChange={e => setEmp(idx, 'cartoesFrota', e.target.value)}
                                disabled={!p.possuiCartaoFrota}
                                placeholder={p.possuiCartaoFrota ? "Ticket, Sem Parar" : "—"}
                                className="flex-1 min-w-0 bg-slate-950 border border-slate-700 focus:border-blue-500 rounded px-2 py-1.5 text-[11.5px] focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed" />
                            </div>
                          </td>
                          <td className="px-1.5 py-1">
                            <input type="text" value={p.adquirentes}
                              onChange={e => setEmp(idx, 'adquirentes', e.target.value)}
                              placeholder="Cielo, Stone"
                              className="w-full bg-slate-950 border border-slate-700 focus:border-blue-500 rounded px-2 py-1.5 text-[11.5px] focus:outline-none" />
                          </td>
                          <td className="px-1.5 py-1">
                            <button type="button"
                              onClick={() => setModalConv({ idx, valor: p.faturamentoConveniencia || '' })}
                              className={`w-full inline-flex items-center justify-center gap-1 rounded px-1.5 py-1.5 text-[11px] font-semibold transition-colors ${
                                p.possuiConveniencia
                                  ? 'bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 hover:bg-emerald-500/25'
                                  : 'bg-slate-800 border border-slate-700 text-slate-400 hover:bg-slate-700'
                              }`}>
                              <ShoppingBag className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">
                                {p.possuiConveniencia
                                  ? fmtMoeda(p.faturamentoConveniencia)
                                  : 'Adicionar'}
                              </span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* PASSO 4 */}
            {passo === 4 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl sm:text-2xl font-semibold tracking-tight mb-1">Revise e envie</h2>
                  <p className="text-[13px] text-slate-400">Confira os dados antes de enviar.</p>
                </div>

                <SecaoRevisao titulo="Solicitante">
                  <LinhaRev label="Nome" valor={dados.nome} />
                  <LinhaRev label="WhatsApp" valor={mascaraWhatsapp(dados.whatsapp)} />
                  <LinhaRev label="E-mail" valor={dados.email} />
                </SecaoRevisao>

                <SecaoRevisao titulo="Desejo">
                  <LinhaRev label="" valor={dados.desejo} multi />
                </SecaoRevisao>

                <SecaoRevisao titulo={`Empresas (${dados.postos.length})`}>
                  <div className="space-y-3">
                    {dados.postos.map((p, idx) => (
                      <div key={idx} className="rounded-lg border border-white/[0.06] bg-slate-950/40 p-3">
                        <p className="text-[13px] font-bold text-blue-300 mb-2 flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5" /> {p.nome || `Empresa ${idx + 1}`}
                        </p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                          <LinhaRev label="Litros/mês" valor={fmtNumero(p.litrosMes)} />
                          <LinhaRev label="Faturamento/mês" valor={fmtMoeda(p.faturamentoMes)} />
                          <LinhaRev label="Contas bancárias" valor={fmtNumero(p.contasBancarias)} />
                          <LinhaRev label="Funcionários" valor={fmtNumero(p.funcionarios)} />
                          <LinhaRev label="Custo médio func." valor={fmtMoeda(p.custoMedioFuncionario)} />
                          <LinhaRev label="Cartão frota" valor={p.possuiCartaoFrota ? (p.cartoesFrota || 'Sim') : 'Não'} />
                          <LinhaRev label="Conveniência" valor={p.possuiConveniencia ? fmtMoeda(p.faturamentoConveniencia) : 'Não'} />
                        </div>
                        {p.adquirentes && (
                          <LinhaRev label="Adquirentes" valor={p.adquirentes} multi />
                        )}
                      </div>
                    ))}
                  </div>
                </SecaoRevisao>
              </div>
            )}

            {erro && (
              <div className="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-300">
                {erro}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 mt-8">
              <button type="button" onClick={voltar} disabled={passo === 1 || enviando}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 hover:border-slate-500 bg-slate-900 hover:bg-slate-800 px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                <ArrowLeft className="h-4 w-4" /> Voltar
              </button>

              {passo < PASSOS.length ? (
                <button type="button" onClick={avancar}
                  disabled={passo === 3 && !qtdConfirmada}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                  Continuar <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button type="button" onClick={enviar} disabled={enviando}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50">
                  {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {enviando ? 'Enviando...' : 'Enviar solicitação'}
                </button>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Modal de conveniência */}
      {modalConv && (
        <ModalConveniencia
          valor={modalConv.valor}
          onClose={() => setModalConv(null)}
          onSalvar={(v) => {
            setEmp(modalConv.idx, 'possuiConveniencia', Number(v) > 0);
            setEmp(modalConv.idx, 'faturamentoConveniencia', v);
            setModalConv(null);
          }}
          onRemover={() => {
            setEmp(modalConv.idx, 'possuiConveniencia', false);
            setEmp(modalConv.idx, 'faturamentoConveniencia', '');
            setModalConv(null);
          }}
        />
      )}
    </div>
  );
}

function ModalConveniencia({ valor, onClose, onSalvar, onRemover }) {
  const [v, setV] = useState(valor || '');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur p-4"
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-white/[0.06] bg-slate-900 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center">
              <ShoppingBag className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-white">Conveniência vinculada</h3>
              <p className="text-[11.5px] text-slate-400">Faturamento mensal da loja</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">
          <label className="block">
            <span className="block text-[11px] font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
              Faturamento da conveniência / mês
            </span>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-slate-500 font-medium pointer-events-none">R$</span>
              <input type="number" min={0} value={v} autoFocus
                onChange={e => setV(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0,00"
                className="w-full bg-slate-950 border border-slate-700 focus:border-blue-500 rounded-lg pl-10 pr-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
          </label>
        </div>
        <div className="px-5 py-3.5 border-t border-white/[0.06] flex items-center justify-between gap-3 bg-slate-950/40">
          <button onClick={onRemover}
            className="text-[12px] text-rose-400 hover:text-rose-300 font-medium">
            Não possui
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onClose}
              className="rounded-lg border border-slate-700 hover:border-slate-500 px-4 py-2 text-[12.5px] font-medium text-slate-300 transition-colors">
              Cancelar
            </button>
            <button onClick={() => onSalvar(v)}
              disabled={!Number(v) || Number(v) <= 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed px-4 py-2 text-[12.5px] font-semibold text-white transition-colors">
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CelInput({ v, onChange, prefixo }) {
  return (
    <td className="px-1.5 py-1">
      <div className="relative">
        {prefixo && (
          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10.5px] text-slate-500 pointer-events-none">
            {prefixo}
          </span>
        )}
        <input type="number" min={0} value={v}
          onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          placeholder="0"
          className={`w-full bg-slate-950 border border-slate-700 focus:border-blue-500 rounded py-1.5 text-[11.5px] text-right focus:outline-none tabular-nums ${prefixo ? 'pl-7 pr-1.5' : 'px-1.5'}`} />
      </div>
    </td>
  );
}

function Campo({ icon: Icon, label, obrigatorio, children }) {
  return (
    <label className="block">
      <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
        {Icon && <Icon className="h-3.5 w-3.5 text-slate-500" />}
        {label}
        {obrigatorio && <span className="text-rose-400">*</span>}
      </span>
      {children}
    </label>
  );
}

function SecaoRevisao({ titulo, children }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-slate-950/40 p-4">
      <p className="text-[10.5px] font-bold uppercase tracking-widest text-slate-500 mb-3">{titulo}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function LinhaRev({ label, valor, multi }) {
  if (!valor) return null;
  return (
    <div className={multi ? 'flex flex-col gap-0.5' : 'flex items-start justify-between gap-3'}>
      {label && <span className="text-[11.5px] text-slate-500 flex-shrink-0">{label}</span>}
      <span className={`text-[12.5px] text-slate-200 ${multi ? 'whitespace-pre-wrap' : 'text-right'}`}>{valor}</span>
    </div>
  );
}
