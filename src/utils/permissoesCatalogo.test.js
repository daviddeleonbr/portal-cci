import { describe, expect, it } from 'vitest';
import { PERMISSOES_ADMIN, PERMISSOES_CLIENTE } from '../services/usuariosSistemaService';
import { organizarCatalogo, alternarPermissao, diffPermissoes, metaPermissao, rotuloPermissao, MODULOS_ADMIN, MODULOS_CLIENTE } from './permissoesCatalogo';

describe('catálogo de permissões organizado', () => {
  it.each([['cliente', PERMISSOES_CLIENTE, MODULOS_CLIENTE], ['admin', PERMISSOES_ADMIN, MODULOS_ADMIN]])(
    '%s: toda chave tem módulo conhecido e descrição (nada cai em "Outras")', (tipo, cat, modulos) => {
      cat.forEach(p => {
        const m = metaPermissao(tipo, p.key);
        expect(modulos, `${p.key} sem módulo`).toContain(m.modulo);
        expect(m.desc, `${p.key} sem descrição`).toBeTruthy();
      });
      const grupos = organizarCatalogo(cat, tipo);
      expect(grupos.map(g => g.modulo)).not.toContain('Outras');
      expect(grupos.flatMap(g => g.itens).length).toBe(cat.length);
    });

  it.each([['cliente', PERMISSOES_CLIENTE], ['admin', PERMISSOES_ADMIN]])(
    '%s: dependências apontam para chaves que existem', (tipo, cat) => {
      const chaves = new Set(cat.map(p => p.key));
      cat.forEach(p => (metaPermissao(tipo, p.key).depende || []).forEach(d => expect(chaves.has(d), `${p.key} → ${d}`).toBe(true)));
    });

  it('marcar dependente marca a base; desmarcar a base tira o dependente', () => {
    let sel = alternarPermissao([], 'sangrias_tarefa_deposito', true, PERMISSOES_CLIENTE, 'cliente');
    expect(sel.sort()).toEqual(['sangrias', 'sangrias_tarefa_deposito']);
    sel = alternarPermissao(sel, 'sangrias', false, PERMISSOES_CLIENTE, 'cliente');
    expect(sel).toEqual([]);
  });

  it('desmarcar a página tira as abas dela', () => {
    const sel = alternarPermissao(['comercial_produtividade', 'produtividade_rank', 'dre'], 'comercial_produtividade', false, PERMISSOES_CLIENTE, 'cliente');
    expect(sel).toEqual(['dre']);
  });

  it('diff e rótulos', () => {
    expect(diffPermissoes(['dre', 'lmc'], ['dre', 'fluxo_caixa'])).toEqual({ adicionadas: ['fluxo_caixa'], removidas: ['lmc'] });
    expect(rotuloPermissao(PERMISSOES_CLIENTE, 'produtividade_rank')).toBe('Comercial · Produtividade › Rank');
  });
});
