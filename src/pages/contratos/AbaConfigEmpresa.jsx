// Aba "Empresa" — dados da CONTRATADA (CCI) + regras gerais do contrato.
// É a fonte de verdade que substitui a constante hard-coded CONTRATADA e
// destrava a validação de emissão (vigência, reajuste, rescisão, pagamento, foro).
//
// Nada é inventado: os campos começam vazios e o admin preenche.

import { useEffect, useState } from 'react';
import { Loader2, Save, Building2, MapPin, UserCheck, Scale } from 'lucide-react';
import { obterConfigEmpresa, salvarConfigEmpresa } from '../../services/configEmpresaService';

function Campo({ label, value, onChange, placeholder, className = '', type = 'text' }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
      />
    </div>
  );
}

function Secao({ icon: Icon, titulo, children }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-800">
        <Icon className="h-4 w-4 text-blue-600" /> {titulo}
      </h3>
      {children}
    </div>
  );
}

export default function AbaConfigEmpresa({ showToast }) {
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const c = await obterConfigEmpresa();
        setCfg({ ...c, regras: { vigencia: {}, reajuste: {}, rescisao: {}, pagamento: {}, foro: {}, lgpd: {}, ...(c.regras || {}) } });
      } catch (e) {
        showToast?.('error', 'Erro ao carregar config: ' + e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [showToast]);

  const set = (campo, val) => setCfg(c => ({ ...c, [campo]: val }));
  const setRegra = (grupo, campo, val) =>
    setCfg(c => ({ ...c, regras: { ...c.regras, [grupo]: { ...c.regras[grupo], [campo]: val } } }));

  const salvar = async () => {
    setSalvando(true);
    try {
      const salvo = await salvarConfigEmpresa(cfg);
      setCfg({ ...salvo, regras: { vigencia: {}, reajuste: {}, rescisao: {}, pagamento: {}, foro: {}, lgpd: {}, ...(salvo.regras || {}) } });
      showToast?.('success', 'Configuração salva.');
    } catch (e) {
      showToast?.('error', 'Erro ao salvar: ' + e.message);
    } finally {
      setSalvando(false);
    }
  };

  if (loading || !cfg) {
    return <div className="flex items-center gap-2 p-8 text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>;
  }

  const r = cfg.regras;

  return (
    <div className="space-y-5 pb-24">
      <p className="text-sm text-gray-500">
        Dados da <strong>CONTRATADA</strong> e regras gerais que alimentam a geração dos contratos.
        Campos em branco são apontados pela validação antes da emissão — nada é preenchido automaticamente.
      </p>

      {/* ── Identificação ── */}
      <Secao icon={Building2} titulo="Identificação da CONTRATADA">
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Razão social" value={cfg.razao_social} onChange={v => set('razao_social', v)} placeholder="CCI Consultoria Inteligente LTDA" />
          <Campo label="Nome fantasia" value={cfg.nome_fantasia} onChange={v => set('nome_fantasia', v)} placeholder="CCI" />
          <Campo label="CNPJ" value={cfg.cnpj} onChange={v => set('cnpj', v)} placeholder="00.000.000/0001-00" />
          <Campo label="Inscrição estadual" value={cfg.inscricao_estadual} onChange={v => set('inscricao_estadual', v)} />
          <Campo label="Inscrição municipal" value={cfg.inscricao_municipal} onChange={v => set('inscricao_municipal', v)} />
          <Campo label="E-mail" value={cfg.email} onChange={v => set('email', v)} type="email" />
          <Campo label="Telefone" value={cfg.telefone} onChange={v => set('telefone', v)} />
        </div>
      </Secao>

      {/* ── Endereço ── */}
      <Secao icon={MapPin} titulo="Endereço">
        <div className="grid grid-cols-6 gap-3">
          <Campo className="col-span-4" label="Logradouro" value={cfg.endereco} onChange={v => set('endereco', v)} />
          <Campo className="col-span-1" label="Número" value={cfg.numero} onChange={v => set('numero', v)} />
          <Campo className="col-span-1" label="CEP" value={cfg.cep} onChange={v => set('cep', v)} />
          <Campo className="col-span-2" label="Complemento" value={cfg.complemento} onChange={v => set('complemento', v)} />
          <Campo className="col-span-2" label="Bairro" value={cfg.bairro} onChange={v => set('bairro', v)} />
          <Campo className="col-span-1" label="Cidade" value={cfg.cidade} onChange={v => set('cidade', v)} />
          <Campo className="col-span-1" label="UF" value={cfg.estado} onChange={v => set('estado', v)} />
        </div>
      </Secao>

      {/* ── Representante legal ── */}
      <Secao icon={UserCheck} titulo="Representante legal (assina pela CONTRATADA)">
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Nome" value={cfg.representante_nome} onChange={v => set('representante_nome', v)} />
          <Campo label="CPF" value={cfg.representante_cpf} onChange={v => set('representante_cpf', v)} placeholder="000.000.000-00" />
          <Campo label="Cargo" value={cfg.representante_cargo} onChange={v => set('representante_cargo', v)} placeholder="Sócio-administrador" />
          <Campo label="E-mail" value={cfg.representante_email} onChange={v => set('representante_email', v)} type="email" />
        </div>
      </Secao>

      {/* ── Regras gerais ── */}
      <Secao icon={Scale} titulo="Regras gerais do contrato">
        <div className="space-y-4">
          {/* Vigência */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Vigência</p>
            <div className="grid grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Tipo</label>
                <select value={r.vigencia.tipo ?? ''} onChange={e => setRegra('vigencia', 'tipo', e.target.value || undefined)}
                  className="w-full h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
                  <option value="">— definir —</option>
                  <option value="determinado">Prazo determinado</option>
                  <option value="indeterminado">Prazo indeterminado</option>
                </select>
              </div>
              {r.vigencia.tipo === 'determinado' && (
                <>
                  <Campo label="Meses" value={r.vigencia.meses} onChange={v => setRegra('vigencia', 'meses', v)} type="number" />
                  <label className="flex items-center gap-2 text-sm text-gray-700 h-10">
                    <input type="checkbox" checked={!!r.vigencia.renovacao_automatica} onChange={e => setRegra('vigencia', 'renovacao_automatica', e.target.checked)} />
                    Renovação automática
                  </label>
                </>
              )}
            </div>
          </div>

          {/* Reajuste */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Reajuste</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Índice</label>
                <select value={r.reajuste.indice ?? ''} onChange={e => setRegra('reajuste', 'indice', e.target.value || undefined)}
                  className="w-full h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
                  <option value="">— definir —</option>
                  <option value="IPCA">IPCA</option>
                  <option value="IGP-M">IGP-M</option>
                  <option value="INPC">INPC</option>
                </select>
              </div>
              <Campo label="Periodicidade (meses)" value={r.reajuste.periodicidade_meses} onChange={v => setRegra('reajuste', 'periodicidade_meses', v)} type="number" placeholder="12" />
            </div>
          </div>

          {/* Rescisão */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Cancelamento / Rescisão</p>
            <div className="grid grid-cols-3 gap-3">
              <Campo label="Aviso prévio (dias)" value={r.rescisao.aviso_previo_dias} onChange={v => setRegra('rescisao', 'aviso_previo_dias', v)} type="number" placeholder="30" />
              <div className="col-span-3">
                <label className="block text-xs font-medium text-gray-700 mb-1">Multa por rescisão antecipada <span className="text-amber-600">(revisar com jurídico)</span></label>
                <textarea rows={2} value={r.rescisao.multa_descricao ?? ''} onChange={e => setRegra('rescisao', 'multa_descricao', e.target.value)}
                  placeholder="Ex.: Na rescisão antecipada e imotivada, a parte que der causa pagará multa equivalente a uma mensalidade."
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
              </div>
            </div>
          </div>

          {/* Pagamento */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Pagamento</p>
            <div className="grid grid-cols-3 gap-3">
              <Campo label="Dia de vencimento" value={r.pagamento.vencimento_dia} onChange={v => setRegra('pagamento', 'vencimento_dia', v)} type="number" placeholder="10" />
              <Campo label="Forma" value={r.pagamento.forma} onChange={v => setRegra('pagamento', 'forma', v)} placeholder="boleto bancário" />
              <Campo label="Encargos de atraso" value={r.pagamento.encargos_atraso} onChange={v => setRegra('pagamento', 'encargos_atraso', v)} placeholder="multa de 2% e juros de 1% ao mês" />
            </div>
          </div>

          {/* Foro */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Foro</p>
            <div className="grid grid-cols-3 gap-3">
              <Campo className="col-span-2" label="Comarca" value={r.foro.comarca} onChange={v => setRegra('foro', 'comarca', v)} placeholder="Vila Velha" />
              <Campo label="UF" value={r.foro.uf} onChange={v => setRegra('foro', 'uf', v)} placeholder="ES" />
            </div>
          </div>

          {/* LGPD */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">LGPD</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Papel da CONTRATADA</label>
                <select value={r.lgpd.papel_contratada ?? ''} onChange={e => setRegra('lgpd', 'papel_contratada', e.target.value || undefined)}
                  className="w-full h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
                  <option value="">— definir —</option>
                  <option value="operadora">Operadora</option>
                  <option value="controladora">Controladora</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </Secao>

      {/* Barra de ação fixa */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-gray-200 bg-white/95 backdrop-blur px-6 py-3 flex justify-end z-10">
        <button onClick={salvar} disabled={salvando}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50">
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar configuração
        </button>
      </div>
    </div>
  );
}
