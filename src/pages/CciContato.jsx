// Admin: configura os canais de contato exibidos na landing page CCI
// (e-mail e WhatsApp). Singleton — uma única linha na tabela cci_contato.

import { useEffect, useState } from 'react';
import { Loader2, Save, MessageCircle, Mail, Info } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Toast from '../components/ui/Toast';
import * as cciContatoService from '../services/cciContatoService';

export default function CciContato() {
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({
    email_contato: '',
    whatsapp_numero: '',
    whatsapp_mensagem: '',
  });
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });

  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 2500);
  };

  useEffect(() => {
    (async () => {
      try {
        const data = await cciContatoService.obterContato();
        setForm({
          email_contato: data.email_contato || '',
          whatsapp_numero: data.whatsapp_numero || '',
          whatsapp_mensagem: data.whatsapp_mensagem || '',
        });
      } catch (e) { showToast('error', e.message); }
      finally { setCarregando(false); }
    })();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setSalvando(true);
    try {
      const r = await cciContatoService.salvarContato(form);
      setForm({
        email_contato: r.email_contato || '',
        whatsapp_numero: r.whatsapp_numero || '',
        whatsapp_mensagem: r.whatsapp_mensagem || '',
      });
      showToast('success', 'Contato atualizado.');
    } catch (e) { showToast('error', e.message); }
    finally { setSalvando(false); }
  };

  const previewTelefone = form.whatsapp_numero
    ? cciContatoService.formatarTelefoneBr(form.whatsapp_numero)
    : '';

  return (
    <div>
      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />
      <PageHeader
        title="Contato da CCI"
        description="Canais públicos exibidos na landing page para agendamento de diagnóstico."
      />

      {carregando ? (
        <div className="flex items-center gap-2 py-12 justify-center text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Carregando...</span>
        </div>
      ) : (
        <form onSubmit={submit} className="max-w-2xl space-y-5">
          {/* Email */}
          <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="rounded-lg bg-blue-50 p-2">
                <Mail className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">E-mail</h3>
                <p className="text-[11.5px] text-gray-500">Usado em links "mailto:" da landing page.</p>
              </div>
            </div>
            <input type="email"
              value={form.email_contato}
              onChange={(e) => setForm(f => ({ ...f, email_contato: e.target.value }))}
              placeholder="contato@ccinteligente.com.br"
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-[13px] text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {/* WhatsApp */}
          <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="rounded-lg bg-emerald-50 p-2">
                <MessageCircle className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">WhatsApp</h3>
                <p className="text-[11.5px] text-gray-500">Número e mensagem inicial sugerida.</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                  Número (com DDI)
                </label>
                <input type="tel"
                  value={form.whatsapp_numero}
                  onChange={(e) => setForm(f => ({ ...f, whatsapp_numero: e.target.value }))}
                  placeholder="5511999998888"
                  className="w-full h-10 rounded-lg border border-gray-200 px-3 text-[13px] text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 font-mono"
                />
                <div className="flex items-center gap-1.5 mt-1.5 text-[10.5px] text-gray-500">
                  <Info className="h-3 w-3 flex-shrink-0" />
                  <span>Apenas dígitos (DDI + DDD + número). Ex: <span className="font-mono">5511999998888</span></span>
                </div>
                {previewTelefone && (
                  <p className="mt-2 text-[12px] text-emerald-700">
                    Pré-visualização: <strong className="font-mono">{previewTelefone}</strong>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                  Mensagem inicial (opcional)
                </label>
                <textarea rows={3}
                  value={form.whatsapp_mensagem}
                  onChange={(e) => setForm(f => ({ ...f, whatsapp_mensagem: e.target.value }))}
                  placeholder="Olá! Gostaria de agendar um diagnóstico gratuito do meu posto."
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 resize-none"
                />
                <p className="mt-1 text-[10.5px] text-gray-400">
                  Preenche automaticamente o texto da conversa ao abrir o WhatsApp.
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={salvando}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-[13px] font-semibold transition-colors shadow-sm disabled:opacity-70">
              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Salvar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
