// Ponte entre os dados persistidos e o motor puro: carrega config da empresa,
// catálogo de cláusulas, serviços (para metadados) e o cliente, e chama
// montarDocumento(). Usado pela pré-visualização e pelo bloqueio de emissão.

import { montarDocumento } from './motor';
import { obterConfigEmpresa } from '../../services/configEmpresaService';
import { listarClausulas } from '../../services/clausulasService';
import { listarServicos } from '../../services/servicosOferecidosService';
import { buscarCliente } from '../../services/clientesService';

export async function montarDocumentoDeContrato(contrato) {
  const [config, clausulas, servicos] = await Promise.all([
    obterConfigEmpresa(),
    listarClausulas({ apenasAtivas: true }),
    listarServicos(),
  ]);

  // Cliente completo (representante legal + endereço) quando houver vínculo.
  let cliente = null;
  if (contrato.cliente_id) {
    try { cliente = await buscarCliente(contrato.cliente_id); } catch { /* usa o snapshot */ }
  }

  const servicosMeta = new Map(
    (servicos || []).map(s => [s.id, { categoria: s.categoria, contrato_meta: s.contrato_meta || {} }]),
  );

  // CONTRATANTE: cadastro do cliente, sobreposto pelos dados informados no
  // próprio contrato (conteudo.contratante — editáveis no rascunho), com
  // fallback no snapshot do contrato.
  const doContrato = Object.fromEntries(
    Object.entries(contrato.conteudo?.contratante || {}).filter(([, v]) => v != null && String(v).trim() !== ''),
  );
  const contratante = {
    ...(cliente || {}),
    ...doContrato,
    cliente_nome: contrato.cliente_nome,
    cliente_cnpj: contrato.cliente_cnpj,
  };

  const dataExtenso = contrato.conteudo?.geradoEm
    ? new Date(contrato.conteudo.geradoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : '';

  return montarDocumento({
    catalogoClausulas: clausulas,
    contratada: config,
    contratante,
    contrato: {
      numero: contrato.numero || contrato.id?.slice(0, 8) || '',
      data: dataExtenso,
      valorTotal: contrato.valor_total,
      tipo: contrato.conteudo?.tipo_contrato || null,   // 'bpo' | 'consultoria' (null = sugerido)
    },
    itens: contrato.conteudo?.itens || [],
    regras: config.regras || {},
    servicosMeta,
  });
}
