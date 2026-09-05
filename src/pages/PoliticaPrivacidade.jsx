// Política de Privacidade da CCI (pública).
// Documento LGPD (Lei 13.709/2018) específico do produto: Portal CCI / Visor360,
// site cci.app.br e serviços de BPO contábil-financeiro para redes de postos.
// Design alinhado à landing (tema escuro #070912 + acentos azul), porém com
// tipografia de leitura (largura de linha confortável, hierarquia clara).
//
// Ponto jurídico central: nos dados contábeis/ERP das redes de clientes a CCI
// atua como OPERADORA (a rede é a Controladora); nos dados de conta/site a CCI
// é a Controladora. A política deixa isso explícito.

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck, ArrowLeft, ArrowUpRight, ChevronRight,
} from 'lucide-react';

const ATUALIZADO_EM = '5 de setembro de 2026';

// Estrutura do documento — usada tanto no índice quanto na renderização.
const SECOES = [
  { id: 'quem-somos', titulo: 'Quem somos e a quem esta política se aplica' },
  { id: 'papeis', titulo: 'A CCI como Controladora e como Operadora' },
  { id: 'dados', titulo: 'Dados que coletamos' },
  { id: 'finalidades', titulo: 'Como e por que usamos seus dados' },
  { id: 'compartilhamento', titulo: 'Compartilhamento e operadores' },
  { id: 'ia', titulo: 'Análises com Inteligência Artificial' },
  { id: 'transferencia', titulo: 'Transferência internacional de dados' },
  { id: 'cookies', titulo: 'Cookies e armazenamento local' },
  { id: 'seguranca', titulo: 'Segurança da informação' },
  { id: 'retencao', titulo: 'Retenção e descarte' },
  { id: 'direitos', titulo: 'Seus direitos como titular' },
  { id: 'menores', titulo: 'Menores de idade' },
  { id: 'alteracoes', titulo: 'Alterações desta política' },
  { id: 'contato', titulo: 'Contato' },
];

export default function PoliticaPrivacidade() {
  useEffect(() => {
    document.title = 'Política de Privacidade · CCI';
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-[#070912] text-slate-300 antialiased overflow-x-hidden selection:bg-blue-500/30 selection:text-white">
      {/* Fundo sutil */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[1100px] -translate-x-1/2 rounded-full bg-blue-600/20 blur-[150px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_transparent_0%,_rgba(7,9,18,0.7)_70%,_#070912_100%)]" />
      </div>

      <TopBar />

      <main className="relative px-6 pt-28 pb-20">
        <div className="mx-auto max-w-3xl">
          <Cabecalho />
          <Indice />
          <div className="mt-14 space-y-12">
            <Quem /> <Papeis /> <Dados /> <Finalidades /> <Compartilhamento />
            <IA /> <Transferencia /> <Cookies /> <Seguranca /> <Retencao />
            <Direitos /> <Menores /> <Alteracoes /> <Contato />
          </div>
        </div>
      </main>

      <Rodape />
    </div>
  );
}

// ─── Topo ───────────────────────────────────────────────────────────────
function TopBar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <header className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
      scrolled ? 'backdrop-blur-xl bg-[#070912]/70 border-b border-white/5 py-3' : 'bg-transparent py-5'
    }`}>
      <div className="max-w-3xl mx-auto px-6 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 group">
          <img src="/logo-cci-landing.png" alt="CCI" className="h-9 w-auto object-contain" draggable={false} />
          <span className="h-7 w-px bg-slate-600 self-center" />
          <div className="leading-tight text-slate-400 text-[10px] font-normal uppercase tracking-widest self-center">
            <p>Consultoria</p><p>Inteligente</p>
          </div>
        </Link>
        <Link to="/"
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-2 text-[12.5px] text-slate-300 hover:bg-white/[0.06] hover:border-white/20 transition-all">
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao site
        </Link>
      </div>
    </header>
  );
}

// ─── Cabeçalho do documento ─────────────────────────────────────────────
function Cabecalho() {
  return (
    <div>
      <span className="inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-500/10 px-3.5 py-1.5 text-[11px] font-medium text-blue-200">
        <ShieldCheck className="h-3.5 w-3.5" /> Privacidade &middot; LGPD (Lei nº 13.709/2018)
      </span>
      <h1 className="font-display mt-6 text-4xl sm:text-5xl font-semibold tracking-tight text-white leading-[1.08]">
        Política de Privacidade
      </h1>
      <p className="mt-5 text-[15px] leading-relaxed text-slate-400">
        Esta política explica como a <strong className="text-slate-200">CCI Assessoria e Consultoria
        Inteligente Ltda</strong> coleta, usa, compartilha e protege dados pessoais na plataforma
        Portal&nbsp;CCI / Visor360, no site <span className="text-slate-200">cci.app.br</span> e nos
        serviços de BPO contábil-financeiro que presta às redes de postos de combustível.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12.5px] text-slate-500">
        <span>Última atualização: <span className="text-slate-300">{ATUALIZADO_EM}</span></span>
        <span className="hidden sm:inline text-slate-700">·</span>
        <span>Vigente a partir da data de publicação</span>
      </div>
    </div>
  );
}

// ─── Índice ─────────────────────────────────────────────────────────────
function Indice() {
  return (
    <nav aria-label="Índice" className="mt-12 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 sm:p-6">
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-4">Nesta página</p>
      <ol className="grid sm:grid-cols-2 gap-x-8 gap-y-2.5">
        {SECOES.map((s, i) => (
          <li key={s.id}>
            <a href={`#${s.id}`}
              className="group flex items-baseline gap-2.5 text-[13.5px] text-slate-400 hover:text-white transition-colors">
              <span className="text-[12px] font-mono text-blue-400/70 tabular-nums w-5 shrink-0">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="group-hover:underline underline-offset-4 decoration-blue-400/40">{s.titulo}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

// ─── Blocos reutilizáveis ───────────────────────────────────────────────
function Secao({ id, n, titulo, children }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[13px] text-blue-400/70 tabular-nums pt-1">{String(n).padStart(2, '0')}</span>
        <h2 className="font-display text-[22px] sm:text-[25px] font-semibold text-white tracking-tight leading-snug">
          {titulo}
        </h2>
      </div>
      <div className="mt-4 pl-0 sm:pl-8 space-y-4 text-[14.5px] leading-relaxed text-slate-400">
        {children}
      </div>
    </section>
  );
}

// Lista com marcadores em acento azul.
function Lista({ children }) {
  return <ul className="space-y-2.5">{children}</ul>;
}
function Item({ children }) {
  return (
    <li className="flex gap-2.5">
      <ChevronRight className="h-4 w-4 mt-0.5 text-blue-400/60 shrink-0" />
      <span>{children}</span>
    </li>
  );
}
function Rotulo({ children }) {
  return <strong className="text-slate-200 font-semibold">{children}</strong>;
}

// ─── Seções ─────────────────────────────────────────────────────────────
function Quem() {
  return (
    <Secao id="quem-somos" n={1} titulo="Quem somos e a quem esta política se aplica">
      <p>
        A <Rotulo>CCI Assessoria e Consultoria Inteligente Ltda</Rotulo>, inscrita no CNPJ
        57.268.175/0001-00, com sede em Vila Velha/ES, é a responsável pelo tratamento dos dados
        descritos nesta política, nos limites detalhados no item&nbsp;2.
      </p>
      <p>Esta política se aplica a:</p>
      <Lista>
        <Item>visitantes do site <Rotulo>cci.app.br</Rotulo> e das nossas páginas de apresentação;</Item>
        <Item>usuários do <Rotulo>Portal CCI / Visor360</Rotulo> (administradores da CCI e usuários das redes de clientes);</Item>
        <Item>redes de postos de combustível que contratam nossos serviços de consultoria e de BPO contábil-financeiro;</Item>
        <Item>pessoas que entram em contato conosco por formulários, e-mail ou telefone.</Item>
      </Lista>
    </Secao>
  );
}

function Papeis() {
  return (
    <Secao id="papeis" n={2} titulo="A CCI como Controladora e como Operadora">
      <p>
        A Lei Geral de Proteção de Dados distingue quem <em>decide</em> sobre o tratamento
        (controlador) de quem <em>trata em nome de outro</em> (operador). No nosso caso, esses papéis
        variam conforme o dado:
      </p>
      <Lista>
        <Item>
          <Rotulo>CCI como Controladora:</Rotulo> dados de cadastro e de uso da plataforma e do site —
          nome, e-mail, telefone, credenciais de acesso, registros de navegação e de contato comercial.
          Aqui somos nós que definimos as finalidades e os meios do tratamento.
        </Item>
        <Item>
          <Rotulo>CCI como Operadora:</Rotulo> dados contábeis, financeiros e operacionais das redes de
          clientes — lançamentos, vendas, fluxo de caixa, contas, notas fiscais e informações extraídas
          dos ERPs (Webposto e Autosystem). Esses dados são tratados <em>por conta e ordem</em> da rede
          contratante, que é a <Rotulo>Controladora</Rotulo>. A CCI os utiliza exclusivamente para
          executar os serviços contratados e seguindo as instruções do cliente.
        </Item>
      </Lista>
      <p>
        Quando a CCI atua como operadora, o titular que quiser exercer direitos sobre esses dados deve,
        preferencialmente, procurar a rede controladora; ainda assim, podemos intermediar a solicitação.
      </p>
    </Secao>
  );
}

function Dados() {
  return (
    <Secao id="dados" n={3} titulo="Dados que coletamos">
      <p>Tratamos apenas os dados necessários para operar a plataforma e prestar os serviços:</p>
      <Lista>
        <Item><Rotulo>Dados de identificação e conta:</Rotulo> nome, e-mail, telefone, cargo/função, empresa vinculada e permissões de acesso.</Item>
        <Item><Rotulo>Dados de autenticação:</Rotulo> credenciais de login (as senhas são armazenadas apenas como <em>hash</em>, nunca em texto puro) e tokens de sessão.</Item>
        <Item><Rotulo>Dados contábeis e financeiros das redes:</Rotulo> lançamentos, movimentações de caixa e banco, vendas, formas de pagamento, contas a pagar/receber, planos de contas, notas fiscais e demais informações provenientes dos ERPs integrados — tratados na condição de operadora.</Item>
        <Item><Rotulo>Dados de contato comercial:</Rotulo> informações enviadas em formulários de diagnóstico, orçamento ou mensagens.</Item>
        <Item><Rotulo>Dados técnicos e de uso:</Rotulo> endereço IP, tipo de dispositivo e navegador, páginas acessadas, registros de acesso (logs) e identificadores armazenados no navegador para funcionamento e segurança.</Item>
      </Lista>
      <p>
        Não coletamos intencionalmente dados pessoais sensíveis dos usuários da plataforma. Caso um
        cliente insira dados dessa natureza em seus próprios registros, eles são tratados sob a
        responsabilidade da rede controladora.
      </p>
    </Secao>
  );
}

function Finalidades() {
  return (
    <Secao id="finalidades" n={4} titulo="Como e por que usamos seus dados">
      <p>Usamos os dados para finalidades específicas, cada uma amparada por uma base legal da LGPD:</p>
      <Lista>
        <Item><Rotulo>Prestar e operar os serviços</Rotulo> — autenticar acessos, gerar DRE, fluxo de caixa, relatórios e diagnósticos, conciliações e demais rotinas de BPO. <span className="text-slate-500">(execução de contrato)</span></Item>
        <Item><Rotulo>Suporte e relacionamento</Rotulo> — responder solicitações, atender e comunicar novidades relevantes do serviço. <span className="text-slate-500">(execução de contrato / legítimo interesse)</span></Item>
        <Item><Rotulo>Segurança e prevenção a fraudes</Rotulo> — registros de acesso, controle de permissões e monitoramento de integridade. <span className="text-slate-500">(legítimo interesse / cumprimento de obrigação legal)</span></Item>
        <Item><Rotulo>Melhoria do produto</Rotulo> — entender o uso de forma agregada para aprimorar funcionalidades. <span className="text-slate-500">(legítimo interesse)</span></Item>
        <Item><Rotulo>Obrigações legais e regulatórias</Rotulo> — cumprimento de deveres contábeis, fiscais e legais. <span className="text-slate-500">(cumprimento de obrigação legal)</span></Item>
        <Item><Rotulo>Contato comercial</Rotulo> — retorno a pedidos de diagnóstico e orçamento. <span className="text-slate-500">(consentimento / diligências pré-contratuais)</span></Item>
      </Lista>
    </Secao>
  );
}

function Compartilhamento() {
  return (
    <Secao id="compartilhamento" n={5} titulo="Compartilhamento e operadores">
      <p>
        Não vendemos dados pessoais. Compartilhamos informações apenas com fornecedores que nos apoiam
        na operação (operadores/sub-operadores), sempre limitados às finalidades desta política e sob
        obrigações de segurança e confidencialidade:
      </p>
      <Lista>
        <Item><Rotulo>Infraestrutura e banco de dados</Rotulo> — provedor de hospedagem e base de dados da plataforma (Supabase);</Item>
        <Item><Rotulo>Inteligência Artificial</Rotulo> — provedor de modelos de IA usado nas análises assistidas (Anthropic — Claude), conforme o item&nbsp;6;</Item>
        <Item><Rotulo>Meios de pagamento e cobrança</Rotulo> — emissão e gestão de boletos (Asaas);</Item>
        <Item><Rotulo>Integrações de ERP</Rotulo> — sistemas dos quais extraímos os dados operacionais das redes (Webposto/Quality e Autosystem), por instrução do cliente;</Item>
        <Item><Rotulo>Autoridades</Rotulo> — quando exigido por lei, ordem judicial ou requisição de autoridade competente.</Item>
      </Lista>
    </Secao>
  );
}

function IA() {
  return (
    <Secao id="ia" n={6} titulo="Análises com Inteligência Artificial">
      <p>
        Algumas funcionalidades oferecem análises assistidas por IA (por exemplo, insights sobre vendas,
        DRE e fluxo de caixa). Quando o usuário aciona esses recursos, dados necessários à análise —
        predominantemente números e indicadores financeiros — são enviados ao provedor de IA para gerar
        o resultado apresentado na tela.
      </p>
      <p>
        Esse processamento ocorre de forma pontual, para responder à solicitação, e não é utilizado por
        nós para decisões automatizadas com efeitos jurídicos sobre o titular. As análises têm caráter
        informativo e de apoio à gestão.
      </p>
    </Secao>
  );
}

function Transferencia() {
  return (
    <Secao id="transferencia" n={7} titulo="Transferência internacional de dados">
      <p>
        Parte dos nossos fornecedores de tecnologia (como hospedagem e IA) pode processar dados em
        servidores localizados fora do Brasil. Nesses casos, adotamos salvaguardas compatíveis com a
        LGPD — como cláusulas contratuais de proteção de dados e a seleção de fornecedores com padrões
        adequados de segurança — para garantir a proteção das informações durante a transferência.
      </p>
    </Secao>
  );
}

function Cookies() {
  return (
    <Secao id="cookies" n={8} titulo="Cookies e armazenamento local">
      <p>
        Utilizamos cookies e tecnologias equivalentes (como <em>localStorage</em> e <em>IndexedDB</em>)
        estritamente para o funcionamento da plataforma, principalmente:
      </p>
      <Lista>
        <Item>manter a sessão do usuário autenticado e proteger o acesso;</Item>
        <Item>guardar preferências de uso (como filtros e visualizações);</Item>
        <Item>armazenar em cache dados já carregados, para desempenho.</Item>
      </Lista>
      <p>
        Você pode limpar esses dados nas configurações do seu navegador; note que isso pode encerrar a
        sessão e exigir novo login.
      </p>
    </Secao>
  );
}

function Seguranca() {
  return (
    <Secao id="seguranca" n={9} titulo="Segurança da informação">
      <p>
        Adotamos medidas técnicas e organizacionais para proteger os dados contra acesso não autorizado,
        perda ou alteração indevida, entre elas:
      </p>
      <Lista>
        <Item>criptografia de credenciais sensíveis e das comunicações;</Item>
        <Item>senhas armazenadas com <em>hash</em> e autenticação por tokens assinados;</Item>
        <Item>isolamento de dados por locatário (cada rede acessa apenas os próprios dados);</Item>
        <Item>controle de acesso por permissões e registros de auditoria;</Item>
        <Item>chaves e segredos mantidos no servidor, nunca expostos ao navegador.</Item>
      </Lista>
      <p>
        Nenhum sistema é completamente imune a riscos, mas trabalhamos continuamente para reduzi-los. Em
        caso de incidente de segurança relevante, comunicaremos os titulares e a ANPD conforme a lei.
      </p>
    </Secao>
  );
}

function Retencao() {
  return (
    <Secao id="retencao" n={10} titulo="Retenção e descarte">
      <p>
        Mantemos os dados apenas pelo tempo necessário às finalidades desta política e ao cumprimento de
        obrigações legais, contábeis e regulatórias. Encerrada a relação contratual, os dados tratados
        como operadora são eliminados ou devolvidos ao cliente controlador conforme o contrato, salvo
        quando a guarda for exigida por lei. Após esses prazos, os dados são eliminados de forma segura
        ou anonimizados.
      </p>
    </Secao>
  );
}

function Direitos() {
  return (
    <Secao id="direitos" n={11} titulo="Seus direitos como titular">
      <p>A LGPD garante a você, a qualquer momento, os seguintes direitos:</p>
      <Lista>
        <Item>confirmação da existência de tratamento e acesso aos seus dados;</Item>
        <Item>correção de dados incompletos, inexatos ou desatualizados;</Item>
        <Item>anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade;</Item>
        <Item>portabilidade dos dados a outro fornecedor, mediante requisição;</Item>
        <Item>eliminação dos dados tratados com base no consentimento;</Item>
        <Item>informação sobre com quem compartilhamos seus dados;</Item>
        <Item>revogação do consentimento; e</Item>
        <Item>oposição a tratamentos feitos sem o seu consentimento, quando houver descumprimento da lei.</Item>
      </Lista>
    </Secao>
  );
}

function Menores() {
  return (
    <Secao id="menores" n={12} titulo="Menores de idade">
      <p>
        A plataforma é destinada a uso profissional por empresas e seus colaboradores. Não coletamos
        intencionalmente dados de menores de 18 anos. Caso identifiquemos esse tipo de dado sem a devida
        base legal, ele será eliminado.
      </p>
    </Secao>
  );
}

function Alteracoes() {
  return (
    <Secao id="alteracoes" n={13} titulo="Alterações desta política">
      <p>
        Podemos atualizar esta política para refletir mudanças em nossos serviços ou na legislação. A
        versão vigente é sempre a publicada nesta página, com a data de última atualização indicada no
        topo. Alterações relevantes poderão ser comunicadas pelos canais habituais.
      </p>
    </Secao>
  );
}

function Contato() {
  return (
    <Secao id="contato" n={14} titulo="Contato">
      <p>
        Ficou com dúvidas sobre esta Política de Privacidade ou sobre como tratamos seus dados? Fale com
        a gente pelo e-mail <a href="mailto:contato@cci.app.br" className="text-blue-300 hover:text-blue-200 underline underline-offset-4 decoration-blue-400/40">contato@cci.app.br</a> ou
        pelo telefone <span className="text-slate-200">+55 (27) 99925-0088</span>.
      </p>
    </Secao>
  );
}

// ─── Rodapé ─────────────────────────────────────────────────────────────
function Rodape() {
  return (
    <footer className="px-6 pt-12 pb-10 border-t border-white/[0.06]">
      <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <p className="text-[11.5px] text-slate-500">
          © {new Date().getFullYear()} CCI Assessoria e Consultoria Inteligente Ltda · CNPJ 57.268.175/0001-00
        </p>
        <Link to="/"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-slate-400 hover:text-white transition-colors">
          cci.app.br <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </footer>
  );
}
