// Modo demonstracao — mascara dados sensiveis (nome empresa/rede, CNPJ)
// preservando valores monetarios/operacionais. Estado global via localStorage
// + useSyncExternalStore para reatividade.

import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'cci_modo_demo';

function getAtivo() {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch (_) { return false; }
}

function setAtivo(v) {
  try {
    if (v) localStorage.setItem(STORAGE_KEY, '1');
    else localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event('cci-modo-demo-changed'));
  } catch (_) { /* noop */ }
}

function subscribe(cb) {
  const handler = () => cb();
  window.addEventListener('cci-modo-demo-changed', handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener('cci-modo-demo-changed', handler);
    window.removeEventListener('storage', handler);
  };
}

// Hash determinístico simples (djb2-like)
function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Anonimizadores (stateless — retornam string quando ativo, senao valor original)
function mascararEmpresa(cliente, ativo) {
  if (!ativo || !cliente) return cliente?.nome || '';
  const id = cliente.id || cliente.empresa_codigo || cliente.nome || '';
  if (!id) return 'Empresa N/D';
  const n = hashStr(String(id)) % 1000;
  return `Empresa N${String(n).padStart(3, '0')}`;
}

function mascararRede(redeOuNome, id, ativo) {
  if (!ativo) return typeof redeOuNome === 'string' ? redeOuNome : (redeOuNome?.nome || '');
  const rid = id || redeOuNome?.id || (typeof redeOuNome === 'string' ? redeOuNome : redeOuNome?.nome || '');
  if (!rid) return 'Rede N/D';
  const n = hashStr(String(rid)) % 100;
  return `Rede R${String(n).padStart(2, '0')}`;
}

function mascararCnpj(cnpj, ativo) {
  if (!ativo) return cnpj || '';
  if (!cnpj) return '';
  return '**.***.***/****-**';
}

// Hook principal: retorna helpers ja bindados ao estado atual
export function useAnonimizador() {
  const ativo = useSyncExternalStore(subscribe, getAtivo, () => false);
  return {
    ativo,
    setAtivo,
    labelEmpresa: (cliente) => mascararEmpresa(cliente, ativo),
    labelRede: (redeOuNome, id) => mascararRede(redeOuNome, id, ativo),
    labelCnpj: (cnpj) => mascararCnpj(cnpj, ativo),
    // Versao que aceita um objeto cliente completo e retorna string de identificacao:
    // em modo normal: "Nome (CNPJ)"; em modo demo: "Empresa NXXX"
    identificacao: (cliente) => {
      if (ativo) return mascararEmpresa(cliente, true);
      const nome = cliente?.nome || '';
      const cnpj = cliente?.cnpj ? ` (${cliente.cnpj})` : '';
      return `${nome}${cnpj}`;
    },
  };
}

// Para uso fora de componentes React (ex: servicos), expoe o estado e as funcoes puras
export { getAtivo, setAtivo, mascararEmpresa, mascararRede, mascararCnpj };
