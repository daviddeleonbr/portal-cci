// Seleção de empresas persistente entre páginas via localStorage.
//
// COMPORTAMENTO:
//   - Ao montar: lê do localStorage; se nunca salvou, marca todas
//   - Ao usuário alterar: salva no localStorage
//   - Entre abas: storage event nativo do browser propaga em tempo real
//   - Mesma aba / outra página: a próxima navegação lê do localStorage
//
// USO:
//   const [empresasSelIds, setEmpresasSelIds] = useEmpresasSelecionadas(
//     empresasDisponiveis, chaveApiId
//   );

import { useState, useEffect, useRef } from 'react';

const PREFIX = 'cliente-empresas-sel:';

function chaveLs(chaveApiId) {
  return chaveApiId ? `${PREFIX}${chaveApiId}` : null;
}

function lerLs(chaveApiId) {
  const k = chaveLs(chaveApiId);
  if (!k) return null;
  try {
    const raw = localStorage.getItem(k);
    if (raw === null) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : null;
  } catch { return null; }
}

function salvarLs(chaveApiId, idsArr) {
  const k = chaveLs(chaveApiId);
  if (!k) return;
  try { localStorage.setItem(k, JSON.stringify(idsArr)); } catch { /* noop */ }
}

function calcInicial(empresasDisponiveis, chaveApiId) {
  const lido = lerLs(chaveApiId);
  if (lido !== null && Array.isArray(lido)) {
    // Respeita seleção salva (mesmo vazia). Filtra IDs que ainda existem.
    const disponiveis = new Set(empresasDisponiveis.map(e => e.id));
    return new Set(lido.filter(id => disponiveis.has(id)));
  }
  // Primeira vez nessa rede: começa com TODAS marcadas
  return new Set(empresasDisponiveis.map(e => e.id));
}

export function useEmpresasSelecionadas(empresasDisponiveis = [], chaveApiId = null) {
  const [ids, setIds] = useState(() => calcInicial(empresasDisponiveis, chaveApiId));

  // Se a lista de empresas chegou DEPOIS do useState (session async), inicializa
  // UMA ÚNICA VEZ quando as empresas aparecerem. Após isso, NÃO toca mais no
  // state — o usuário tem controle total.
  const inicializadoRef = useRef(false);
  useEffect(() => {
    if (inicializadoRef.current) return;
    if (empresasDisponiveis.length === 0) return;
    inicializadoRef.current = true;
    setIds(prev => prev.size > 0 ? prev : calcInicial(empresasDisponiveis, chaveApiId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresasDisponiveis]);

  // Persiste no localStorage SEMPRE que ids muda (após init). Outras abas
  // detectam via storage event nativo.
  const primeiraExecucaoRef = useRef(true);
  useEffect(() => {
    if (!chaveApiId) return;
    // Pula a 1ª execução (que é o init) pra não salvar sem o user ter tocado
    if (primeiraExecucaoRef.current) {
      primeiraExecucaoRef.current = false;
      return;
    }
    salvarLs(chaveApiId, Array.from(ids));
  }, [ids, chaveApiId]);

  // Listener pra storage event ENTRE abas (browser nativo, não dispara
  // na mesma aba — evita loops com a aba que originou a mudança)
  useEffect(() => {
    if (!chaveApiId) return;
    const k = chaveLs(chaveApiId);
    const onStorage = (e) => {
      if (e.key !== k || !e.newValue) return;
      try {
        const arr = JSON.parse(e.newValue);
        if (Array.isArray(arr)) setIds(new Set(arr));
      } catch { /* noop */ }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [chaveApiId]);

  return [ids, setIds];
}
