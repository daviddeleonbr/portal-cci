import { supabase } from '../lib/supabase';
import * as autosystemService from './autosystemService';
import * as contasBancariasService from './clienteContasBancariasService';
import * as qualityApi from './qualityApiService';

// ============================================================
// Precificação — busca best-effort de dados operacionais de um
// cliente já cadastrado, pra pré-preencher a calculadora.
//
// SEMPRE do MÊS ANTERIOR completo. Cada métrica é buscada isolada:
// se a fonte falhar ou não existir, aquele campo fica manual (null).
//
// Fontes por tipo de cliente:
//   Webposto (chave_api_id): litros + notas via RPC cci_webposto_kpis_periodo
//                            (cache sincronizado); contas via cliente_contas_bancarias.
//   Autosystem (as_rede_id): litros + bicos via edge autosystem-bombas;
//                            contas via as_rede_conta_caixa_banco.
//
// Nunca disponíveis no portal (seguem manuais): funcionários internos,
// custo por funcionário, caixas/turnos, transações de cartão frota.
// ============================================================

// ─── Vínculo item da composição → serviço oferecido ─────────
// Retorna um mapa { item_key: servico_id }.
export async function listarVinculos() {
  const { data, error } = await supabase
    .from('cci_precificacao_vinculo')
    .select('item_key, servico_id');
  if (error) throw error;
  const mapa = {};
  (data || []).forEach(r => { mapa[r.item_key] = r.servico_id; });
  return mapa;
}

// Salva (ou limpa, se servicoId nulo) o vínculo de um item.
export async function salvarVinculo(itemKey, servicoId) {
  const { error } = await supabase
    .from('cci_precificacao_vinculo')
    .upsert(
      { item_key: itemKey, servico_id: servicoId || null, updated_at: new Date().toISOString() },
      { onConflict: 'item_key' },
    );
  if (error) throw error;
}

// Primeiro e último dia do mês anterior (YYYY-MM-DD) + rótulo amigável.
export function periodoMesAnterior() {
  const hoje = new Date();
  const de  = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1); // 1º dia do mês passado
  const ate = new Date(hoje.getFullYear(), hoje.getMonth(), 0);     // dia 0 = último dia do mês passado
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const mesLabel = de.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return { data_de: fmt(de), data_ate: fmt(ate), label: mesLabel };
}

// Retorna { litros, notas, bicos, contas, fontes: {campo: origem}, avisos: [] }.
// Campos não encontrados vêm como null (mantêm o valor manual).
export async function buscarDadosOperacionaisCliente(cliente) {
  const { data_de, data_ate } = periodoMesAnterior();
  const empresaCodigo = cliente?.empresa_codigo;
  const out = { litros: null, notas: null, bicos: null, contas: null, fontes: {}, avisos: [] };

  const tipo = cliente?.as_rede_id ? 'autosystem' : (cliente?.chave_api_id ? 'webposto' : null);
  if (!tipo) {
    out.avisos.push('Cliente sem integração (Webposto/Autosystem) — preencha manualmente.');
    return out;
  }

  // ─── Webposto ────────────────────────────────────────────
  if (tipo === 'webposto') {
    if (empresaCodigo != null) {
      try {
        const { data, error } = await supabase.rpc('cci_webposto_kpis_periodo', {
          p_chave_api_id: cliente.chave_api_id,
          p_empresas_codigos: [Number(empresaCodigo)],
          p_data_de: data_de,
          p_data_ate: data_ate,
        });
        if (error) throw error;
        const k = Array.isArray(data) ? data[0] : data;
        if (k) {
          // Só litros. `qtd_vendas` é contagem de VENDAS (saídas) e NÃO
          // corresponde a "notas fiscais lançadas" (que no BPO são as notas
          // de ENTRADA/compras) — esse campo fica manual.
          const litros = Math.round(Number(k.quantidade_combustivel) || 0);
          if (litros > 0) { out.litros = litros; out.fontes.litros = 'Vendas Webposto'; }
        }
      } catch {
        out.avisos.push('Não foi possível buscar litros do Webposto.');
      }
    } else {
      out.avisos.push('Empresa sem código Webposto — litros/notas não buscados.');
    }

    try {
      // Contas bancárias DA EMPRESA. A classificação "Conta bancária"
      // (cliente_contas_bancarias, tipo='bancaria') diz QUAIS contas são
      // bancárias — é por rede. O endpoint CONTA da Quality, filtrado por
      // empresaCodigo, diz quais dessas pertencem a ESTA empresa. Contamos
      // a interseção. Sem empresaCodigo/Quality, cai pra contagem da rede.
      const classificadas = await contasBancariasService.listarPorRede(cliente.chave_api_id);
      const bancariaSet = new Set(
        (classificadas || [])
          .filter(c => c.ativo !== false && c.tipo === 'bancaria')
          .map(c => Number(c.conta_codigo)),
      );

      let contou = false;
      if (empresaCodigo != null && bancariaSet.size > 0) {
        try {
          const { data: chaveRow } = await supabase
            .from('chaves_api').select('chave').eq('id', cliente.chave_api_id).single();
          if (chaveRow?.chave) {
            const contasEmpresa = await qualityApi.buscarContas(
              chaveRow.chave, undefined, { empresaCodigo: Number(empresaCodigo) },
            );
            const codigosEmpresa = new Set(
              (contasEmpresa || [])
                .map(c => Number(c.contaCodigo ?? c.codigo))
                .filter(Number.isFinite),
            );
            const n = [...bancariaSet].filter(cod => codigosEmpresa.has(cod)).length;
            if (n > 0) { out.contas = n; out.fontes.contas = 'Contas bancárias da empresa (Webposto)'; }
            contou = true;
          }
        } catch { /* cai no fallback da rede */ }
      }

      if (!contou && bancariaSet.size > 0) {
        out.contas = bancariaSet.size;
        out.fontes.contas = 'Contas bancárias classificadas (rede)';
      }
    } catch { /* mantém manual */ }
  }

  // ─── Autosystem ──────────────────────────────────────────
  if (tipo === 'autosystem') {
    if (empresaCodigo != null) {
      try {
        const bombas = await autosystemService.buscarBombasAutosystem(
          cliente.as_rede_id, [Number(empresaCodigo)], { data_de, data_ate },
        );
        const litros = (bombas.litros_dia_semana || [])
          .reduce((s, r) => s + (Number(r?.litros ?? r?.total ?? 0) || 0), 0);
        if (litros > 0) { out.litros = Math.round(litros); out.fontes.litros = 'Bombas Autosystem'; }
        const bicos = (bombas.bicos || []).length;
        if (bicos > 0) { out.bicos = bicos; out.fontes.bicos = 'Bombas Autosystem'; }
      } catch {
        out.avisos.push('Não foi possível buscar litros/bicos do Autosystem.');
      }
    } else {
      out.avisos.push('Empresa sem código Autosystem — litros/bicos não buscados.');
    }

    try {
      const contas = await autosystemService.listarContasCaixaBancoRede(cliente.as_rede_id);
      const n = (contas || []).length;
      if (n > 0) { out.contas = n; out.fontes.contas = 'Contas da rede'; }
    } catch { /* mantém manual */ }
  }

  // ─── Notas fiscais de ENTRADA (endpoint COMPRA) ─────────────
  // Webposto: cada COMPRA é uma nota de entrada lançada. Conta as compras
  // com dataEntrada (fallback dataMovimento) no mês anterior.
  // Autosystem não tem COMPRA via Quality → fica em 0 (manual).
  if (tipo === 'webposto' && empresaCodigo != null) {
    try {
      const { data: chaveRow } = await supabase
        .from('chaves_api').select('chave').eq('id', cliente.chave_api_id).single();
      if (chaveRow?.chave) {
        const compras = await qualityApi.buscarCompras(chaveRow.chave, {
          empresaCodigo: Number(empresaCodigo),
          dataInicial: data_de,
          dataFinal: data_ate,
        });
        const dentroDoMes = (compras || []).filter(c => {
          const d = String(c.dataEntrada || c.dataMovimento || '').slice(0, 10);
          return d >= data_de && d <= data_ate;
        });
        if (dentroDoMes.length > 0) {
          out.notas = dentroDoMes.length;
          out.fontes.notas = 'Compras Webposto (notas de entrada)';
        }
      }
    } catch {
      out.avisos.push('Não foi possível buscar as compras (notas de entrada).');
    }
  }

  if (out.litros == null && out.notas == null && out.bicos == null && out.contas == null && out.avisos.length === 0) {
    out.avisos.push('Nenhum dado operacional encontrado para o mês anterior.');
  }
  return out;
}
