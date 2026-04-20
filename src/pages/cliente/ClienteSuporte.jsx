import { useState } from 'react';
import { motion } from 'framer-motion';
import { MessageCircle, Phone, Mail, Send, Clock, CheckCircle } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Toast from '../../components/ui/Toast';

const chamados = [
  { id: 1, titulo: 'Duvida sobre DRE de Fevereiro', status: 'respondido', data: '2026-03-15', resposta: 'O valor foi ajustado conforme conciliacao bancaria.' },
  { id: 2, titulo: 'Solicitar certidao negativa atualizada', status: 'em_atendimento', data: '2026-03-22', resposta: null },
  { id: 3, titulo: 'Inclusao de novo colaborador', status: 'concluido', data: '2026-03-10', resposta: 'Admissao processada com sucesso no eSocial.' },
];

export default function ClienteSuporte() {
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });

  const handleSubmit = (e) => {
    e.preventDefault();
    setToast({ show: true, type: 'success', message: 'Mensagem enviada! Retornaremos em breve.' });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3000);
    e.target.reset();
  };

  return (
    <div>
      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />
      <PageHeader title="Suporte" description="Fale com a equipe CCI Consultoria" />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Contact Info */}
        <div className="space-y-4">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Seu Contador</h3>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-700 text-white font-bold">
                AP
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Ana Paula Santos</p>
                <p className="text-xs text-gray-500">Contadora Senior</p>
              </div>
            </div>
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5 text-sm text-gray-600">
                <Mail className="h-4 w-4 text-gray-400" />
                ana.paula@cciconsultoria.com.br
              </div>
              <div className="flex items-center gap-2.5 text-sm text-gray-600">
                <Phone className="h-4 w-4 text-gray-400" />
                (11) 99999-0002
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Escritorio</h3>
            <div className="space-y-2.5 text-sm text-gray-600">
              <div className="flex items-center gap-2.5">
                <Phone className="h-4 w-4 text-gray-400" />
                (11) 3456-7890
              </div>
              <div className="flex items-center gap-2.5">
                <Mail className="h-4 w-4 text-gray-400" />
                contato@cciconsultoria.com.br
              </div>
              <div className="flex items-center gap-2.5">
                <Clock className="h-4 w-4 text-gray-400" />
                Seg - Sex: 8h as 18h
              </div>
            </div>
          </motion.div>
        </div>

        {/* Message Form + History */}
        <div className="xl:col-span-2 space-y-6">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-xl border border-gray-100 p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-emerald-600" />
              Enviar Mensagem
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Assunto</label>
                <input type="text" className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100" placeholder="Resumo da sua duvida" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Mensagem</label>
                <textarea rows={4} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 resize-none" placeholder="Descreva sua duvida ou solicitacao..." />
              </div>
              <div className="flex justify-end">
                <button type="submit" className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 transition-colors">
                  <Send className="h-4 w-4" />
                  Enviar
                </button>
              </div>
            </form>
          </motion.div>

          {/* History */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Historico de Chamados</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {chamados.map((ch, i) => (
                <div key={ch.id} className="px-6 py-4 hover:bg-gray-50/50 transition-colors">
                  <div className="flex items-start justify-between mb-1">
                    <p className="text-sm font-medium text-gray-900">{ch.titulo}</p>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      ch.status === 'concluido' ? 'bg-emerald-50 text-emerald-700' :
                      ch.status === 'respondido' ? 'bg-blue-50 text-blue-700' :
                      'bg-amber-50 text-amber-700'
                    }`}>
                      {ch.status === 'concluido' ? 'Concluido' : ch.status === 'respondido' ? 'Respondido' : 'Em Atendimento'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mb-1">{ch.data}</p>
                  {ch.resposta && (
                    <div className="mt-2 p-2.5 bg-gray-50 rounded-lg text-xs text-gray-600">
                      <span className="font-medium text-gray-700">CCI:</span> {ch.resposta}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
