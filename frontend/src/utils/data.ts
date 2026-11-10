// Datas: a tela usa dd/mm/aaaa; a API usa aaaa-mm-dd.
const dois = (n: number) => String(n).padStart(2, "0");

/** Data de hoje (horário local) como "dd/mm/aaaa". */
export const hoje = (agora: Date = new Date()) =>
  `${dois(agora.getDate())}/${dois(agora.getMonth() + 1)}/${agora.getFullYear()}`;

/** Data de hoje (horário local) como "aaaa-mm-dd". */
export const hojeIso = (agora: Date = new Date()) =>
  `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}`;

/** Converte "dd/mm/aaaa" em "aaaa-mm-dd"; devolve null se incompleta ou inexistente (ex.: 31/02). */
export function paraIso(texto: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
  if (!m) return null;
  const [, dia, mes, ano] = m;
  const d = new Date(Number(ano), Number(mes) - 1, Number(dia));
  const valida = d.getFullYear() === Number(ano) && d.getMonth() === Number(mes) - 1 && d.getDate() === Number(dia);
  return valida ? `${ano}-${mes}-${dia}` : null;
}

/** Máscara: aceita só números e insere as barras (dd/mm/aaaa). */
export function aplicarMascara(texto: string): string {
  const n = texto.replace(/\D/g, "").slice(0, 8);
  if (n.length <= 2) return n;
  if (n.length <= 4) return `${n.slice(0, 2)}/${n.slice(2)}`;
  return `${n.slice(0, 2)}/${n.slice(2, 4)}/${n.slice(4)}`;
}
