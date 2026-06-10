// Logo oficial CCI — usa o arquivo `public/logo-cci.png` (ou .svg).
// Fundo transparente, escala via className.
//
// USO:
//   <LogoCCI className="h-10 w-10" />

export default function LogoCCI({ className = 'h-10 w-10', title = 'CCI' }) {
  return (
    <img
      src="/logo-cci.png"
      alt={title}
      className={`object-contain ${className}`}
      draggable={false}
    />
  );
}
