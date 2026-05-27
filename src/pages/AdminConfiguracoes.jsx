import { useEffect, useState } from 'react';
import {
  Phone, Sparkles, Loader2, Save, Eye, EyeOff, AlertCircle, CheckCircle2, Key,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Toast from '../components/ui/Toast';
import { CciContatoView } from './CciContato';
import * as configuracoesIaService from '../services/configuracoesIaService';
import { useAdminSession } from '../hooks/useAuth';

const ABAS = [
  { key: 'contatos', label: 'Contatos',        icon: Phone,    descricao: 'Canais públicos da landing page' },
  { key: 'ia',       label: 'Análises de IA',  icon: Sparkles, descricao: 'Chave Claude e parâmetros da Análise IA' },
];

export default function AdminConfiguracoes() {
  const [aba, setAba] = useState('contatos');

  const abaAtiva = ABAS.find(a => a.key === aba) || ABAS[0];

  return (
    <div>
      <PageHeader title="Configurações" description={abaAtiva.descricao} />

      <div className="bg-white rounded-xl border border-gray-100 mb-4 overflow-hidden">
        <div className="flex items-center gap-1 px-2 border-b border-gray-100 overflow-x-auto">
          {ABAS.map(a => {
            const Icon = a.icon;
            const ativo = aba === a.key;
            return (
              <button key={a.key} onClick={() => setAba(a.key)}
                className={`flex items-start gap-2 px-4 py-3 text-[12.5px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                  ativo
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50/60'
                }`}>
                <Icon className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div className="text-left">
                  <p>{a.label}</p>
                  <p className="text-[10.5px] text-gray-400 font-normal">{a.descricao}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {aba === 'contatos' && <CciContatoView />}
      {aba === 'ia'       && <AbaAnalisesIa />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Aba: Análises de IA (configuração Claude)
// ═══════════════════════════════════════════════════════════
const MODELOS = [
  { value: 'claude-opus-4-7',           label: 'Claude Opus 4.7',        desc: 'Mais capaz, ideal para análises complexas' },
  { value: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6',      desc: 'Equilíbrio entre custo e qualidade' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5',       desc: 'Mais rápido e econômico' },
];

function AbaAnalisesIa() {
  const session = useAdminSession();
  const usuarioId = session?.usuario?.id || null;

  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mostrarChave, setMostrarChave] = useState(false);
  const [form, setForm] = useState({
    api_key: '',
    modelo: 'claude-opus-4-7',
    max_tokens: 20000,
    adaptive_thinking: true,
    ativo: true,
  });
  const [original, setOriginal] = useState(form);
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });

  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 2800);
  };

  useEffect(() => {
    (async () => {
      try {
        const data = await configuracoesIaService.obterConfiguracaoIa();
        const next = {
          api_key:           data.api_key || '',
          modelo:            data.modelo || 'claude-opus-4-7',
          max_tokens:        Number(data.max_tokens) || 20000,
          adaptive_thinking: data.adaptive_thinking !== false,
          ativo:             data.ativo !== false,
        };
        setForm(next);
        setOriginal(next);
      } catch (err) {
        showToast('error', err.message);
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  const isDirty = JSON.stringify(form) !== JSON.stringify(original);
  const chaveValida = !form.api_key || form.api_key.startsWith('sk-ant-');

  async function salvar() {
    if (!chaveValida) {
      showToast('error', 'A chave da Anthropic deve começar com "sk-ant-".');
      return;
    }
    setSalvando(true);
    try {
      const saved = await configuracoesIaService.salvarConfiguracaoIa(form, usuarioId);
      const next = {
        api_key:           saved.api_key || '',
        modelo:            saved.modelo,
        max_tokens:        Number(saved.max_tokens),
        adaptive_thinking: saved.adaptive_thinking !== false,
        ativo:             saved.ativo !== false,
      };
      setForm(next);
      setOriginal(next);
      showToast('success', 'Configurações salvas.');
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <div className="flex items-center gap-2 py-12 justify-center text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Carregando configurações...</span>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-5">
      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />

      {/* Card: Chave API */}
      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="rounded-lg bg-amber-50 p-2 flex-shrink-0">
            <Key className="h-4 w-4 text-amber-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-900">Chave de API Anthropic</h3>
            <p className="text-[11.5px] text-gray-500 mt-0.5">
              Obtenha em{' '}
              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer"
                className="text-blue-600 hover:underline">
                console.anthropic.com → API Keys
              </a>. Mantida criptografada no banco; usuários cliente leem para chamar a API.
            </p>
          </div>
        </div>

        <div className="relative">
          <input type={mostrarChave ? 'text' : 'password'}
            value={form.api_key}
            onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))}
            placeholder="sk-ant-api03-..."
            autoComplete="off"
            className="w-full h-10 rounded-lg border border-gray-200 px-3 pr-20 text-[13px] text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 font-mono" />
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center">
            <button type="button" onClick={() => setMostrarChave(s => !s)}
              className="rounded p-1.5 text-gray-400 hover:text-gray-700"
              title={mostrarChave ? 'Ocultar' : 'Mostrar'}>
              {mostrarChave ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        {form.api_key && !chaveValida && (
          <p className="mt-2 text-[11.5px] text-amber-700 flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" /> Formato inválido — deve começar com <code className="font-mono">sk-ant-</code>.
          </p>
        )}
      </div>

      {/* Card: Modelo + parâmetros */}
      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-blue-50 p-2 flex-shrink-0">
            <Sparkles className="h-4 w-4 text-blue-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-900">Modelo e parâmetros</h3>
            <p className="text-[11.5px] text-gray-500 mt-0.5">Controle o modelo usado e os limites da requisição.</p>
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
            Modelo
          </label>
          <select value={form.modelo}
            onChange={e => setForm(f => ({ ...f, modelo: e.target.value }))}
            className="w-full h-10 rounded-lg border border-gray-200 px-3 text-[13px] text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
            {MODELOS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <p className="mt-1 text-[10.5px] text-gray-400">
            {MODELOS.find(m => m.value === form.modelo)?.desc || ''}
          </p>
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
            Max tokens
          </label>
          <input type="number" min={1000} max={64000} step={1000}
            value={form.max_tokens}
            onChange={e => setForm(f => ({ ...f, max_tokens: Number(e.target.value) || 0 }))}
            className="w-full h-10 rounded-lg border border-gray-200 px-3 text-[13px] text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 font-mono" />
          <p className="mt-1 text-[10.5px] text-gray-400">
            Limite máximo de tokens na resposta. Recomendado: 20000 (inclui tokens de thinking).
          </p>
        </div>

        <label className="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" checked={form.adaptive_thinking}
            onChange={e => setForm(f => ({ ...f, adaptive_thinking: e.target.checked }))}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 mt-0.5" />
          <div>
            <p className="text-[13px] text-gray-800">Ativar adaptive thinking</p>
            <p className="text-[10.5px] text-gray-500">
              Permite ao modelo "raciocinar" antes da resposta — melhora análises complexas, consome mais tokens.
            </p>
          </div>
        </label>

        <label className="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" checked={form.ativo}
            onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))}
            className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 mt-0.5" />
          <div>
            <p className="text-[13px] text-gray-800">Integração ativa</p>
            <p className="text-[10.5px] text-gray-500">
              Quando desativada, a tela de Análise IA do cliente fica indisponível.
            </p>
          </div>
        </label>
      </div>

      <div className="flex items-center justify-between gap-3">
        {isDirty
          ? <span className="inline-flex items-center gap-1.5 text-[12px] text-amber-700">
              <AlertCircle className="h-4 w-4" /> Há alterações não salvas
            </span>
          : <span className="inline-flex items-center gap-1.5 text-[12px] text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> Configurações sincronizadas
            </span>}
        <button onClick={salvar} disabled={!isDirty || salvando}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            isDirty
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}>
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {salvando ? 'Salvando...' : 'Salvar alterações'}
        </button>
      </div>
    </div>
  );
}
