-- 205_sangrias_consultar
-- Permissão "Consultar sangrias" (sangrias_consultar): só visualiza os
-- fechamentos enviados, sem lançar contagem. Lançar/alterar exige 'sangrias'.
-- Antes: qualquer usuário da rede com acesso à empresa podia ler e gravar.
drop policy if exists "sangrias_tenant" on cliente_sangrias_fechamento;
drop policy if exists sangrias_sel on cliente_sangrias_fechamento;
drop policy if exists sangrias_ins on cliente_sangrias_fechamento;
drop policy if exists sangrias_upd on cliente_sangrias_fechamento;
drop policy if exists sangrias_del on cliente_sangrias_fechamento;

create policy sangrias_sel on cliente_sangrias_fechamento for select
  using (cci_pode_ver_cliente(cliente_id)
         and (cci_tem_permissao('sangrias') or cci_tem_permissao('sangrias_consultar')));
create policy sangrias_ins on cliente_sangrias_fechamento for insert
  with check (cci_pode_ver_cliente(cliente_id) and cci_tem_permissao('sangrias'));
create policy sangrias_upd on cliente_sangrias_fechamento for update
  using (cci_pode_ver_cliente(cliente_id) and cci_tem_permissao('sangrias'))
  with check (cci_pode_ver_cliente(cliente_id) and cci_tem_permissao('sangrias'));
create policy sangrias_del on cliente_sangrias_fechamento for delete
  using (cci_pode_ver_cliente(cliente_id) and cci_tem_permissao('sangrias'));
