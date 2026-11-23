// Botão "Instalar app" do portal do cliente (cabeçalho). Só aparece quando faz
// sentido — ver src/lib/instalacaoPwa.js:
//  - Chrome/Edge: abre a janela nativa de instalação;
//  - iPhone/iPad: abre o passo a passo (Compartilhar → Adicionar à Tela de Início);
//  - já instalado / rodando como app: não aparece.
import { useState } from 'react';
import { Download, Share, SquarePlus, Check } from 'lucide-react';
import Modal from '../ui/Modal';
import LogoCCI from '../ui/LogoCCI';
import { useInstalacaoPwa, instalarNativo, marcarIosInstalado } from '../../lib/instalacaoPwa';

export default function BotaoInstalarApp() {
  const { modo } = useInstalacaoPwa();
  const [passoAPasso, setPassoAPasso] = useState(false);
  if (!modo && !passoAPasso) return null;

  const clicar = () => (modo === 'nativo' ? instalarNativo() : setPassoAPasso(true));

  return (
    <>
      {modo && (
        <button type="button" onClick={clicar}
          title="Instalar o Portal CCI no seu aparelho — abre como um aplicativo"
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#10766e] px-3 text-[13px] font-semibold text-[#ffffff] shadow-sm hover:bg-[#0d6159] flex-shrink-0">
          <Download className="h-4 w-4" aria-hidden="true" />
          Instalar<span className="hidden sm:inline">&nbsp;app</span>
        </button>
      )}

      <Modal open={passoAPasso} onClose={() => setPassoAPasso(false)} size="sm"
        title="Instalar o app no iPhone"
        footer={(
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button type="button" onClick={() => { marcarIosInstalado(); setPassoAPasso(false); }}
              className="inline-flex h-11 sm:h-auto items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">
              <Check className="h-4 w-4" aria-hidden="true" /> Já instalei
            </button>
            <button type="button" onClick={() => setPassoAPasso(false)}
              className="h-12 sm:h-auto rounded-lg bg-blue-700 px-5 py-2 text-base sm:text-sm font-semibold text-white hover:bg-blue-800">
              Entendi
            </button>
          </div>
        )}>
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-gray-100 bg-gray-50">
            <LogoCCI className="h-7 w-7" title="" />
          </span>
          <p className="text-sm text-gray-700">
            Com o app na tela de início, o portal abre direto, em tela cheia, como um aplicativo.
          </p>
        </div>
        <ol className="mt-4 space-y-3">
          <Passo n={1} icone={Share}>
            No <strong>Safari</strong>, toque em <strong>Compartilhar</strong> (o quadrado com a seta para cima, na barra de baixo).
          </Passo>
          <Passo n={2} icone={SquarePlus}>
            Role a lista e toque em <strong>Adicionar à Tela de Início</strong>.
          </Passo>
          <Passo n={3} icone={Check}>
            Toque em <strong>Adicionar</strong>. O ícone da CCI aparece na tela de início.
          </Passo>
        </ol>
        <p className="mt-4 text-xs text-gray-600">
          Usa outro navegador no iPhone? Abra este endereço no Safari para instalar.
        </p>
      </Modal>
    </>
  );
}

function Passo({ n, icone: Icone, children }) {
  return (
    <li className="flex gap-3 rounded-xl border border-gray-100 bg-gray-50/60 p-3">
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-700 text-xs font-bold text-white" aria-hidden="true">{n}</span>
      <p className="min-w-0 flex-1 text-sm leading-relaxed text-gray-800">{children}</p>
      <Icone className="mt-0.5 h-5 w-5 flex-shrink-0 text-gray-500" aria-hidden="true" />
    </li>
  );
}
