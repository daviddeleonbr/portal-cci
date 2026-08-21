-- ============================================================
-- Notas explicativas POR ITEM (além da nota geral do topo)
-- ============================================================
--
-- O consultor pode clicar num item problemático específico (um gargalo, uma
-- conta crítica, uma concentração de risco, um produto em queda...) e escrever
-- o "porquê" daquele item. Guardamos um mapa { chaveDoItem: texto } por
-- (escopo, aba, ano, mes) — a mesma linha que já tem o cache e a nota geral.
--
-- A chave do item é derivada do texto que identifica o item (ver
-- src/components/ia/notasItens.jsx → chaveNota), o que faz a mesma nota casar
-- na tela (AnaliseIaView) e no PDF (Relatorio*), que renderizam de formas
-- diferentes o mesmo insight.

alter table analise_ia_relatorios
  add column if not exists notas_itens jsonb not null default '{}'::jsonb;
