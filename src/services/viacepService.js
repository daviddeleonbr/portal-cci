// ─── ViaCEP — consulta gratuita de endereço por CEP ─────────────
// Sem autenticação, sem rate limit publicado. Doc: https://viacep.com.br

export async function buscarCep(cep) {
  const limpo = String(cep || '').replace(/\D/g, '');
  if (limpo.length !== 8) return null;
  const res = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
  if (!res.ok) throw new Error('CEP inválido');
  const data = await res.json();
  if (data?.erro) return null;
  return {
    cep:      data.cep,
    endereco: data.logradouro,
    bairro:   data.bairro,
    cidade:   data.localidade,
    estado:   data.uf,
  };
}
