// Redes (Webposto = chave_api, Autosystem = as_rede) a partir das empresas —
// para filtros "Rede → Empresa" das telas da CCI (Tarefas, Acessos).
// Chave da rede: 'w:<chave_api_id>' | 'a:<as_rede_id>'.

import { useEffect, useMemo, useState } from 'react';
import * as autosystemService from '../services/autosystemService';

export const redeDe = (c) => (c?.chave_api_id ? `w:${c.chave_api_id}` : c?.as_rede_id ? `a:${c.as_rede_id}` : '');

// `ativo`: false = não busca os nomes das redes Autosystem (ex.: portal do cliente).
export function useRedesClientes(clientes, ativo = true) {
  const [nomesAs, setNomesAs] = useState({});
  useEffect(() => {
    if (!ativo) return;
    autosystemService.listarRedes()
      .then(rs => setNomesAs(Object.fromEntries((rs || []).map(r => [r.id, r.nome]))))
      .catch(() => {});
  }, [ativo]);

  // [{ value, label }] ordenado pelo nome
  return useMemo(() => {
    const m = new Map();
    clientes.forEach(c => {
      const k = redeDe(c); if (!k || m.has(k)) return;
      m.set(k, c.chave_api_id ? (c.chaves_api?.nome || 'Rede Webposto') : (nomesAs[c.as_rede_id] || 'Rede Autosystem'));
    });
    return [...m.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [clientes, nomesAs]);
}
