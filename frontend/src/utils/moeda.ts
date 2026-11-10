// Valores monetários chegam da API em centavos inteiros e aparecem como "R$ 1.234,50".

/** Formata centavos (inteiro) como "R$ 1.234,50". Valor que não é número devolve "—". */
export function formatarReais(centavos: number): string {
  if (!Number.isFinite(centavos)) return "—";
  const total = Math.abs(Math.round(centavos));
  const reais = String(Math.trunc(total / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const cents = String(total % 100).padStart(2, "0");
  return `${centavos < 0 ? "-" : ""}R$ ${reais},${cents}`;
}
