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

// Intervalo aceito pela API (o backend recusa datas fora dele).
export const ANO_MIN = 2000;
export const ANO_MAX = 2100;

const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;

/** "aaaa-mm-dd" -> "dd/mm/aaaa". */
export const paraBr = (iso: string) => {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
};

/** Soma (ou subtrai) dias de uma data "aaaa-mm-dd", sem depender de fuso nem de horário de verão. */
export function somarDias(iso: string, dias: number): string {
  const [ano, mes, dia] = iso.split("-").map(Number) as [number, number, number];
  const d = new Date(Date.UTC(ano, mes - 1, dia + dias));
  return `${d.getUTCFullYear()}-${dois(d.getUTCMonth() + 1)}-${dois(d.getUTCDate())}`;
}

/** Abreviação do dia da semana ("seg", "ter"...) de uma data "aaaa-mm-dd". */
export function diaDaSemana(iso: string): string {
  const [ano, mes, dia] = iso.split("-").map(Number) as [number, number, number];
  return DIAS_SEMANA[new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()]!;
}

/** Confere se a data "aaaa-mm-dd" está no intervalo que a API aceita. */
export const dentroDoIntervalo = (iso: string) => {
  const ano = Number(iso.slice(0, 4));
  return ano >= ANO_MIN && ano <= ANO_MAX;
};
