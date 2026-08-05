// Nome de exibição de uma empresa (linha de `clientes`).
//
// Ponto único usado em todo o portal do cliente. Quando o usuário liga o toggle
// "Apelido" (preferência global — ver src/lib/apelidoPref.js) e a empresa tem um
// apelido cadastrado, exibe o apelido; senão cai no nome/fantasia/razão social.
export function nomeEmpresa(emp, usarApelido = false) {
  if (!emp) return '—';
  if (usarApelido) {
    const ap = (emp.apelido ?? '').toString().trim();
    if (ap) return ap;
  }
  return emp.fantasia || emp.nome || emp.razao_social || '—';
}
