// Troca direta do <input type="date"> — mesmas props (value, onChange(e),
// min, max, disabled, className, id, aria-label).
//  - Desktop: o próprio <input type="date"> nativo, sem mudança nenhuma.
//  - Celular (<768px): CampoData — digitar com máscara (dd/mm/aaaa, teclado
//    numérico) OU escolher no calendário grande em gaveta.
// onChange recebe { target: { value } } nos dois casos, então quem já fazia
// `e => setX(e.target.value)` não precisa mudar.
import CampoData from './CampoData';
import { useEhCelular } from '../../hooks/useEhCelular';

// Do className do input, só o que define largura/posição vale para o campo do
// celular (o visual do campo é o do CampoData: 44px de altura, fonte 16px).
const LAYOUT = /^(?:[a-z]+:)*(?:w-|min-w-|max-w-|flex-|basis-|col-span|grow|shrink|self-|order-)/;

export default function InputData({ value, onChange, min, max, disabled, className = '', titulo, id, 'aria-label': ariaLabel, ...resto }) {
  const celular = useEhCelular();

  if (!celular) {
    return <input type="date" value={value ?? ''} onChange={onChange} min={min} max={max} disabled={disabled}
      className={className} id={id} aria-label={ariaLabel} {...resto} />;
  }

  const layout = className.split(/\s+/).filter(c => LAYOUT.test(c)).join(' ');
  return (
    <div className={`min-w-0 ${layout || 'w-full'}`}>
      <CampoData value={value ?? ''} onChange={(v) => onChange?.({ target: { value: v } })}
        min={min} max={max} disabled={disabled} id={id} aria-label={ariaLabel}
        titulo={titulo || ariaLabel || 'Selecionar data'}
        className="!mt-0 !text-base" />
    </div>
  );
}
