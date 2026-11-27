-- Aba "Conciliação de caixas" (admin) e "Serviços BPO" (cliente) descontinuadas na
-- 1.27.0: o Relatório geral substitui. A tabela só guardava o "Marcar como concluído"
-- que liberava o dia para o cliente; sem dependentes (FK/view/função).
drop table if exists public.bpo_conciliacoes_caixas;
