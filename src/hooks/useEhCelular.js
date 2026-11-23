// true abaixo de md (768px). useSyncExternalStore → acompanha giro/redimensionamento.
import { useSyncExternalStore } from 'react';

const MQ_CELULAR = '(max-width: 767px)';

function assinar(cb) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(MQ_CELULAR);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
const ler = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(MQ_CELULAR).matches : false);

export function useEhCelular() {
  return useSyncExternalStore(assinar, ler, () => false);
}
