// Timbrado CCI DEITADO (A4 2970x2100, 1 unidade = 0,1 mm): as mesmas peças do
// PapelTimbrado (em pé), rearranjadas, para relatórios largos. Fica fixo atrás do
// conteúdo e repete em cada página impressa (.rg-timbrado no CSS de quem usa).
// O rodapé fica livre: só a numeração de página (@bottom-right de quem usa).
// TimbradoCabecalho: a mesma identidade, para a tela.
import { EstilosTimbrado, MarcaTopo } from './PapelTimbrado';

const CNPJ = 'CNPJ 57.268.175/0001-00';
const RUA = 'Rua Humaitá, Divino Espírito Santo';
const CIDADE = 'Vila Velha · ES · 29.107-250';

export default function TimbradoPaisagem() {
  return (
    <div className="rg-timbrado" aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2970 2100">
        <EstilosTimbrado />
        <rect className="st3" width="2970" height="2100" />
        <text className="st4" x="2850" y="118" textAnchor="end">{CNPJ}</text>
        <text className="st7" x="2850" y="147" textAnchor="end">{RUA}</text>
        <text className="st7" x="2850" y="174" textAnchor="end">{CIDADE}</text>
        <line className="st1" x1="120" y1="240" x2="2850" y2="240" />
        <line className="st0" x1="120" y1="240" x2="230" y2="240" />
        <line className="st2" x1="66" y1="320" x2="66" y2="1960" />
      </svg>
      {/* A marca é um svg próprio, posicionado em mm: ao repetir o fixo em cada página,
          o Chrome perde transform e svg aninhado (a marca sairia no lugar da arte original). */}
      <svg className="rg-marca" style={{ left: '12mm', top: '8.4mm', width: '32mm', height: '12.2mm' }} viewBox="158 160 390 149"><MarcaTopo /></svg>
    </div>
  );
}

export function TimbradoCabecalho() {
  return (
    <div className="rg-tb rg-tb-topo">
      <svg viewBox="150 152 404 160" role="img" aria-label="CCI Consultoria Inteligente"><EstilosTimbrado /><MarcaTopo /></svg>
      <p><strong>{CNPJ}</strong><br />{RUA}<br />{CIDADE}</p>
    </div>
  );
}

