import { describe, expect, it } from 'vitest';
import {
  alternarRede, alternarEmpresa, estadoRede, contarAcesso, diffAcesso, acessoTodasRedes, acessoIgual,
} from './acessoRedes';

const wp = { id: 'w1', tipo: 'wp', nome: 'Dona Rosa', empresas: [{ id: 'e1', nome: 'Posto 1' }, { id: 'e2', nome: 'Posto 2' }] };
const as = { id: 'a1', tipo: 'as', nome: 'Rede AS', empresas: [{ id: 'e3', nome: 'Posto 3' }] };
const redes = [wp, as];
const vazio = { chaves_api: [], as_redes: [], empresas: [] };

describe('acesso de redes do admin N1', () => {
  it('marcar a rede inteira cobre as avulsas dela', () => {
    const a = alternarRede({ ...vazio, empresas: ['e1'] }, wp);
    expect(a).toEqual({ chaves_api: [], as_redes: [], empresas: [] }); // parcial → desmarca
    const b = alternarRede(vazio, wp);
    expect(b.chaves_api).toEqual(['w1']);
    expect(estadoRede(b, wp)).toBe('inteira');
  });

  it('desmarcar uma empresa de rede inteira vira as demais avulsas', () => {
    const a = alternarEmpresa({ ...vazio, chaves_api: ['w1'] }, wp, 'e1');
    expect(a).toEqual({ chaves_api: [], as_redes: [], empresas: ['e2'] });
    expect(estadoRede(a, wp)).toBe('parcial');
  });

  it('marcar todas à mão não promove a rede inteira', () => {
    let a = alternarEmpresa(vazio, wp, 'e1');
    a = alternarEmpresa(a, wp, 'e2');
    expect(estadoRede(a, wp)).toBe('parcial');
    expect(contarAcesso(a, redes)).toEqual({ inteiras: 0, avulsas: 2, total: 2 });
  });

  it('diff: sair de "todas" avisa a perda e lista o que muda', () => {
    const depois = { ...vazio, as_redes: ['a1'], empresas: ['e1'] };
    const d = diffAcesso(null, depois, redes);
    expect(d.removidas[0]).toMatch(/Todas as redes/);
    expect(d.removidas).toContain('Dona Rosa (rede inteira)');
    expect(d.removidas).toContain('Empresa Posto 2');
    expect(d.adicionadas).toEqual([]);
  });

  it('diff: rede inteira desmarcada toda não lista empresa por empresa', () => {
    const d = diffAcesso(acessoTodasRedes(redes), { ...vazio, as_redes: ['a1'] }, redes);
    expect(d.removidas).toEqual(['Dona Rosa (rede inteira)']);
    expect(diffAcesso({ ...vazio, as_redes: ['a1'] }, null, redes).adicionadas[0]).toMatch(/Todas/);
    expect(acessoIgual({ ...vazio, empresas: ['e2', 'e1'] }, { chaves_api: [], as_redes: [], empresas: ['e1', 'e2'] })).toBe(true);
  });
});
