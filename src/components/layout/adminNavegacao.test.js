import { describe, expect, it } from 'vitest';
import { adminAtendeRegra, primeiraPaginaAdmin, filtrarNavegacao } from './adminNavegacao';

// Perfis reais (26/11/2026) de admins N1 sem 'dashboard': o login manda para
// /admin/dashboard, então a guarda precisa levá-los à 1ª página permitida.
const n1 = (permissoes) => ({ tipo: 'admin', nivel_admin: 1, permissoes });

describe('guardas de rota do admin (mesma regra do menu)', () => {
  it('N1 só com Conciliação de Caixas vai direto para ela', () => {
    const u = n1(['conciliacao_caixas']);
    expect(adminAtendeRegra(u, { permissao: 'dashboard' })).toBe(false);
    expect(primeiraPaginaAdmin(u)).toBe('/admin/bpo/conciliacao-caixas'); // não Contratos (aberto a todos)
    expect(adminAtendeRegra(u, { permissao: 'conciliacao_caixas' })).toBe(true);
    expect(adminAtendeRegra(u, { permissao: 'acessos' })).toBe(false);
  });

  it('N1 com Caixa administrativo e Acessos: 1ª página segue a ordem do menu', () => {
    const u = n1(['caixa_administrativo', 'acessos', 'conciliacao_caixas']);
    expect(primeiraPaginaAdmin(u)).toBe('/admin/bpo/caixa-administrativo');
  });

  it('Cadastros abre com qualquer uma das abas', () => {
    const regra = { permissaoQualquer: ['clientes', 'colaboradores', 'usuarios', 'fornecedores', 'plano_contas', 'motivos'] };
    expect(adminAtendeRegra(n1(['motivos']), regra)).toBe(true);
    expect(adminAtendeRegra(n1(['acessos']), regra)).toBe(false);
  });

  it('Contratos exige a permissão; Pendências e Portal demo (sem chave) seguem visíveis a todos', () => {
    const nomes = filtrarNavegacao(n1([])).flatMap(s => s.items.map(i => i.name));
    expect(nomes).not.toContain('Contratos');
    expect(nomes).toEqual(expect.arrayContaining(['Pendências', 'Portal cliente · Demo']));
    expect(filtrarNavegacao(n1(['contratos'])).flatMap(s => s.items.map(i => i.name))).toContain('Contratos');
    expect(primeiraPaginaAdmin(n1([]))).toBe('/admin/pendencias');
  });

  it('nível mínimo: Exportação contábil só N3', () => {
    const regra = { nivelMinimo: 3 };
    expect(adminAtendeRegra(n1(['dashboard']), regra)).toBe(false);
    expect(adminAtendeRegra({ tipo: 'admin', nivel_admin: 3, permissoes: [] }, regra)).toBe(true);
  });
});
