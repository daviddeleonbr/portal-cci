// Configuração singleton de contato CCI (landing page).
//
// A tabela cci_contato tem exatamente UMA linha (id=1). Esta API expõe
// helpers de obter/atualizar e utilitários pra formatar para URL.

import { supabase } from '../lib/supabase';

const ID = 1;

export async function obterContato() {
  const { data, error } = await supabase
    .from('cci_contato')
    .select('email_contato, whatsapp_numero, whatsapp_mensagem')
    .eq('id', ID)
    .maybeSingle();
  if (error) throw error;
  return data || { email_contato: '', whatsapp_numero: '', whatsapp_mensagem: '' };
}

export async function salvarContato({ email_contato, whatsapp_numero, whatsapp_mensagem }) {
  // Normaliza
  const patch = {
    email_contato: (email_contato || '').trim() || null,
    whatsapp_numero: digitsOnly(whatsapp_numero) || null,
    whatsapp_mensagem: (whatsapp_mensagem || '').trim() || null,
  };
  const { data, error } = await supabase
    .from('cci_contato')
    .upsert({ id: ID, ...patch }, { onConflict: 'id' })
    .select('email_contato, whatsapp_numero, whatsapp_mensagem')
    .single();
  if (error) throw error;
  return data;
}

export function digitsOnly(s) {
  return String(s || '').replace(/\D/g, '');
}

// Formata número telefônico para exibição: +55 (11) 99999-8888
export function formatarTelefoneBr(numero) {
  const d = digitsOnly(numero);
  if (!d) return '';
  // Esperado: 12 ou 13 dígitos (55 + DDD + numero)
  if (d.length >= 12) {
    const ddi = d.slice(0, 2);
    const ddd = d.slice(2, 4);
    const resto = d.slice(4);
    const meio = resto.length > 8 ? resto.slice(0, 5) : resto.slice(0, 4);
    const fim  = resto.length > 8 ? resto.slice(5)    : resto.slice(4);
    return `+${ddi} (${ddd}) ${meio}-${fim}`;
  }
  // Sem DDI: assume Brasil
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

export function urlWhatsApp(numero, mensagem) {
  const d = digitsOnly(numero);
  if (!d) return '';
  const m = (mensagem || '').trim();
  return `https://wa.me/${d}${m ? `?text=${encodeURIComponent(m)}` : ''}`;
}

export function urlMailto(email, assunto, corpo) {
  if (!email) return '';
  const qs = [];
  if (assunto) qs.push(`subject=${encodeURIComponent(assunto)}`);
  if (corpo)   qs.push(`body=${encodeURIComponent(corpo)}`);
  return `mailto:${email}${qs.length ? `?${qs.join('&')}` : ''}`;
}
