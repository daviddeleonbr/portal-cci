// FECHAMENTO DE CAIXA — portal do cliente (Webposto e Autosystem; tipo pela
// sessão). Fechamento geral do dia (ou de um turno): vendas de um lado, formas
// de recebimento do outro, acréscimos/descontos, devoluções (Autosystem) ou
// vendas canceladas (Webposto) e aferições. Direto do sistema, qualquer dia.
// Cálculo em services/fechamentoCaixaService.js. Pensado primeiro p/ celular.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Droplet, Fuel, Loader2,
  MinusCircle, PlusCircle, RefreshCw, RotateCcw, ShoppingBag, Wallet, XCircle,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import InputData from '../../components/ui/InputData';
import CardEmpresaAtiva from '../../components/cliente/CardEmpresaAtiva';
import { useClienteSession } from '../../hooks/useAuth';
import { trocarEmpresaAtiva } from '../../lib/auth';
import * as fechService from '../../services/fechamentoCaixaService';
import { formatCurrency } from '../../utils/format';
import { hojeBR, isoDataBR } from '../../utils/dataBR';

const fmtQtd = (v, casas = 2) => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: casas });
const somarDias = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return isoDataBR(d); };
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const diaSemana = (iso) => DIAS[new Date(`${iso}T12:00:00`).getDay()];

const COR_FORMA = {
  dinheiro: 'bg-emerald-500', cartao: 'bg-blue-600', a_prazo: 'bg-amber-500', cheque: 'bg-violet-500', outros: 'bg-gray-400',
};

export default function ClienteFechamentoCaixa() {
  const session = useClienteSession();
  const cliente = session?.cliente;
  const usuario = session?.usuario;
  const tipo = session?.tipoCliente === 'autosystem' ? 'autosystem' : 'webposto';

  const [data, setData] = useState(() => hojeBR(-1)); // padrão: ontem (dia fechado)
  const [turno, setTurno] = useState(null);           // null = dia todo
  const [bruto, setBruto] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);
  const hoje = hojeBR();

  const carregar = useCallback(async ({ forcar = false } = {}) => {
    if (!cliente?.id || !data) return;
    setCarregando(true); setErro(null);
    try {
      setBruto(await fechService.carregar(cliente, data, tipo, { forcar }));
    } catch (e) {
      setErro(e.message || 'Não foi possível carregar o fechamento.');
      setBruto(null);
    } finally {
      setCarregando(false);
    }
  }, [cliente, data, tipo]);

  useEffect(() => { setTurno(null); carregar(); }, [carregar]);

  const f = useMemo(() => fechService.montar(bruto, turno), [bruto, turno]);
  const diferenca = f ? f.totalRecebido - f.vendas.total : 0;

  const cabecalho = (
    <PageHeader title="Fechamento de caixa" description="Vendas, recebimentos, ajustes e aferições do dia" acoesNaLinha>
      <button type="button" onClick={() => carregar({ forcar: true })} disabled={carregando} aria-label="Atualizar" title="Atualizar"
        className="inline-flex h-10 w-10 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 sm:w-auto sm:px-4">
        <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} aria-hidden="true" /> <span className="hidden sm:inline">Atualizar</span>
      </button>
    </PageHeader>
  );

  if (!cliente?.empresa_codigo) {
    return (
      <div>
        {cabecalho}
        <div className="rounded-2xl border border-gray-200/60 bg-white px-6 py-14 text-center shadow-sm">
          <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-amber-500" aria-hidden="true" />
          <p className="text-sm font-semibold text-gray-900">Esta empresa ainda não está vinculada ao sistema.</p>
          <p className="mt-1 text-xs text-gray-600">Fale com a CCI para habilitar.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-6">
      {cabecalho}

      <CardEmpresaAtiva empresa={cliente} empresas={session?.clientesRede || []}
        onTrocar={usuario?.permissoes?.includes('trocar_empresa') ? trocarEmpresaAtiva : undefined} />

      {/* Dia + turno */}
      <div className="rounded-2xl border border-gray-200/60 bg-white p-3 shadow-sm sm:p-4">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setData(d => somarDias(d, -1))} aria-label="Dia anterior"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50">
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1">
            <InputData value={data} max={hoje} onChange={e => e.target.value && setData(e.target.value)} titulo="Dia do fechamento"
              className="h-11 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 text-sm" />
          </div>
          <button type="button" onClick={() => setData(d => (d < hoje ? somarDias(d, 1) : d))} disabled={data >= hoje} aria-label="Próximo dia"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-1.5 text-xs text-gray-600">{diaSemana(data)}{data === hoje ? ' · hoje (caixa pode estar aberto)' : ''}</p>

        {f?.turnos?.length > 0 && (
          <div className="relative -mx-3 mt-3 sm:-mx-4">
            <div role="radiogroup" aria-label="Turno"
              className="flex gap-1.5 overflow-x-auto px-3 sm:px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {[{ codigo: null, rotulo: 'Dia todo' }, ...f.turnos].map(x => {
                const on = (turno ?? null) === x.codigo;
                return (
                  <button key={x.codigo ?? 'dia'} type="button" role="radio" aria-checked={on} onClick={() => setTurno(x.codigo)}
                    className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium ring-1 ring-inset transition ${on ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-gray-700 ring-gray-200 hover:bg-gray-50'}`}>
                    {x.rotulo}
                    {x.aberto && <span className={`rounded-full px-1.5 text-[10px] font-bold ${on ? 'bg-white/25' : 'bg-amber-100 text-amber-800'}`}>aberto</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {erro && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{erro}</div>}

      {carregando && !f ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-gray-200/60 bg-white py-16 text-sm text-gray-600 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Buscando o fechamento no sistema…
        </div>
      ) : f && (
        <div className={`space-y-4 transition-opacity ${carregando ? 'opacity-60' : ''}`}>
          {f.avisos.map(a => (
            <p key={a} className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {a}
            </p>
          ))}

          {/* Resumo */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Resumo rotulo="Vendido" valor={f.vendas.total} Icone={ShoppingBag} tom="text-blue-700 bg-blue-50" />
            <Resumo rotulo="Recebido" valor={f.totalRecebido} Icone={Wallet} tom="text-emerald-700 bg-emerald-50" />
            <div className="col-span-2 rounded-2xl border border-gray-200/60 bg-white p-3 shadow-sm sm:col-span-1 sm:p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">Diferença</p>
              <p className={`mt-1 text-xl font-bold tabular-nums ${Math.abs(diferenca) < 0.01 ? 'text-gray-900' : diferenca > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {diferenca > 0 ? '+' : ''}{formatCurrency(diferenca)}
              </p>
              <p className="text-[11px] text-gray-500">recebido − vendido</p>
            </div>
          </div>

          {/* Vendas × Recebimentos */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Secao titulo="Vendas" total={f.vendas.total} Icone={ShoppingBag}
              nota={f.porTurnoParcial ? 'Dia todo (sem separação por turno no Autosystem)' : null}>
              {f.vendas.categorias.length === 0 ? <Vazio texto="Nenhuma venda neste período." /> : (
                <ul className="divide-y divide-gray-100">
                  {f.vendas.categorias.map(c => <CategoriaVenda key={c.chave} c={c} total={f.vendas.total} />)}
                </ul>
              )}
            </Secao>

            <Secao titulo="Formas de recebimento" total={f.totalRecebido} Icone={Wallet}>
              {f.recebimentos.length === 0 ? <Vazio texto="Nenhum recebimento neste período." /> : (
                <ul className="divide-y divide-gray-100">
                  {f.recebimentos.map(r => {
                    const pct = f.totalRecebido ? (r.valor / f.totalRecebido) * 100 : 0;
                    return (
                      <li key={r.chave} className="px-4 py-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="flex min-w-0 items-center gap-2 text-sm text-gray-800">
                            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${COR_FORMA[r.tipo] || COR_FORMA.outros}`} aria-hidden="true" />
                            <span className="truncate">{r.rotulo}</span>
                          </span>
                          <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">{formatCurrency(r.valor)}</span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                            <div className={`h-full rounded-full ${COR_FORMA[r.tipo] || COR_FORMA.outros}`} style={{ width: `${Math.max(1, Math.min(100, pct))}%` }} />
                          </div>
                          <span className="w-10 text-right text-[11px] tabular-nums text-gray-500">{fmtQtd(pct, 1)}%</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {(f.sobra > 0 || f.falta > 0) && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-gray-100 px-4 py-2.5 text-xs text-gray-600">
                  {f.sobra > 0 && <span>Sobra de caixa: <strong className="text-emerald-700">{formatCurrency(f.sobra)}</strong></span>}
                  {f.falta > 0 && <span>Falta de caixa: <strong className="text-red-700">{formatCurrency(f.falta)}</strong></span>}
                </div>
              )}
            </Secao>
          </div>

          {/* Acréscimos e descontos */}
          <div className="grid grid-cols-2 gap-2">
            <Resumo rotulo="Acréscimos" valor={f.acrescimos} Icone={PlusCircle} tom="text-emerald-700 bg-emerald-50" pequeno />
            <Resumo rotulo="Descontos" valor={f.descontos} Icone={MinusCircle} tom="text-red-700 bg-red-50" pequeno />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Devoluções / vendas canceladas */}
            <Secao titulo={f.devolucoes.titulo} total={f.devolucoes.total} Icone={f.tipo === 'autosystem' ? RotateCcw : XCircle}
              nota={`${f.devolucoes.qtd} ${f.tipo === 'autosystem' ? 'produto(s)' : 'venda(s)'}`}>
              {f.devolucoes.itens.length === 0 ? <Vazio texto={f.tipo === 'autosystem' ? 'Nenhuma devolução.' : 'Nenhuma venda cancelada.'} /> : (
                <ul className="divide-y divide-gray-100">
                  {f.devolucoes.itens.map((d, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate text-gray-800">{d.descricao}</span>
                        <span className="text-[11px] text-gray-500">{[d.hora, d.qtd ? `${fmtQtd(d.qtd, 3)} un/L` : null].filter(Boolean).join(' · ')}</span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-red-700">{formatCurrency(d.valor)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Secao>

            {/* Aferições */}
            <Secao titulo="Aferições" Icone={Droplet}
              total={f.afericoes.temValor ? f.afericoes.valor : null}
              nota={`${f.afericoes.itens.length} aferição(ões) · ${fmtQtd(f.afericoes.litros, 3)} L`}>
              {f.afericoes.itens.length === 0 ? <Vazio texto="Nenhuma aferição registrada." /> : (
                <ul className="divide-y divide-gray-100">
                  {f.afericoes.itens.map((a, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <Fuel className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                        <span className="min-w-0">
                          <span className="block truncate text-gray-800">{a.produto}</span>
                          <span className="text-[11px] text-gray-500">{[a.bico != null ? `Bico ${a.bico}` : null, a.hora].filter(Boolean).join(' · ')}</span>
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-semibold tabular-nums text-gray-900">{fmtQtd(a.litros, 3)} L</span>
                        {f.afericoes.temValor && <span className="text-[11px] tabular-nums text-gray-500">{formatCurrency(a.valor)}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {!f.afericoes.temValor && f.afericoes.itens.length > 0 && (
                <p className="border-t border-gray-100 px-4 py-2 text-[11px] text-gray-500">O Autosystem registra a aferição em litros, sem valor.</p>
              )}
            </Secao>
          </div>
        </div>
      )}
    </div>
  );
}

function Resumo({ rotulo, valor, Icone, tom, pequeno = false }) {
  return (
    <div className="rounded-2xl border border-gray-200/60 bg-white p-3 shadow-sm sm:p-4">
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${tom}`}><Icone className="h-4 w-4" aria-hidden="true" /></span>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">{rotulo}</p>
      </div>
      <p className={`mt-1.5 font-bold tabular-nums text-gray-900 ${pequeno ? 'text-base' : 'text-xl'}`}>{formatCurrency(valor)}</p>
    </div>
  );
}

function Secao({ titulo, total, Icone, nota, children }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200/60 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icone className="h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-gray-900">{titulo}</h2>
            {nota && <p className="truncate text-[11px] text-gray-500">{nota}</p>}
          </div>
        </div>
        {total != null && <p className="shrink-0 text-sm font-bold tabular-nums text-gray-900">{formatCurrency(total)}</p>}
      </header>
      {children}
    </section>
  );
}

function Vazio({ texto }) {
  return <p className="px-4 py-8 text-center text-sm text-gray-500">{texto}</p>;
}

// Categoria de venda com os produtos (toque para abrir)
function CategoriaVenda({ c, total }) {
  const [aberto, setAberto] = useState(false);
  const pct = total ? (c.valor / total) * 100 : 0;
  const combustivel = c.chave === 'combustivel';
  return (
    <li>
      <button type="button" onClick={() => setAberto(a => !a)} aria-expanded={aberto}
        className="w-full px-4 py-3 text-left hover:bg-gray-50">
        <div className="flex items-baseline justify-between gap-3">
          <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-gray-900">
            <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${aberto ? 'rotate-180' : ''}`} aria-hidden="true" />
            <span className="truncate">{c.rotulo}</span>
          </span>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">{formatCurrency(c.valor)}</span>
        </div>
        <p className="ml-5.5 mt-0.5 pl-0.5 text-[11px] text-gray-500">
          {combustivel ? `${fmtQtd(c.qtd, 3)} L` : `${fmtQtd(c.qtd, 0)} item(ns)`} · {fmtQtd(pct, 1)}% do vendido · {c.produtos.length} produto(s)
        </p>
      </button>
      {aberto && (
        <ul className="bg-gray-50/70 pb-1">
          {c.produtos.map((p, i) => (
            <li key={i} className="flex items-center justify-between gap-3 px-4 py-2 pl-10 text-[13px]">
              <span className="min-w-0">
                <span className="block truncate text-gray-800">{p.nome}</span>
                <span className="text-[11px] text-gray-500">{fmtQtd(p.qtd, 3)} {combustivel ? 'L' : (p.unidade || 'un')}</span>
              </span>
              <span className="shrink-0 tabular-nums text-gray-900">{formatCurrency(p.valor)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
