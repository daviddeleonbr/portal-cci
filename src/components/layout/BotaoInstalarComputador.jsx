// Botão "Instalar no computador" do cabeçalho do admin. Só aparece quando o
// navegador (Chrome/Edge) avisa que o portal pode ser instalado, ou seja, ainda
// não está. Some depois de instalar e dentro do próprio app. Ver instalacaoPwa.js.
import { MonitorDown } from 'lucide-react';
import { useInstalacaoPwa, instalarNativo } from '../../lib/instalacaoPwa';

export default function BotaoInstalarComputador() {
  const { modo } = useInstalacaoPwa();
  if (modo !== 'nativo') return null;
  return (
    <button type="button" onClick={instalarNativo}
      title="Instalar o portal da CCI neste computador. Ele abre em janela própria, como um programa"
      className="hidden md:inline-flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100">
      <MonitorDown className="h-4 w-4" aria-hidden="true" />
      Instalar no computador
    </button>
  );
}
