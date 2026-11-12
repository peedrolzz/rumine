// Valores monetários chegam da API em centavos inteiros e aparecem como "R$ 1.234,50".

/** Formata centavos (inteiro) como "R$ 1.234,50". Valor que não é número devolve "—". */
export function formatarReais(centavos: number): string {
  if (!Number.isFinite(centavos)) return "—";
  const total = Math.abs(Math.round(centavos));
  const reais = String(Math.trunc(total / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const cents = String(total % 100).padStart(2, "0");
  return `${centavos < 0 ? "-" : ""}R$ ${reais},${cents}`;
}

/**
 * Lê o que a pessoa digitou ("20", "20,5", "R$ 1.234,50") e devolve centavos inteiros.
 * Devolve null se não for um valor válido (letras, mais de 2 casas decimais, vazio).
 */
export function lerReais(texto: string): number | null {
  const limpo = texto.replace(/R\$/gi, "").replace(/\s/g, "");
  if (!/^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/.test(limpo)) return null;
  const [inteiros = "", decimais = ""] = limpo.split(",");
  const centavos = Number(inteiros.replace(/\./g, "")) * 100 + Number(decimais.padEnd(2, "0"));
  return Number.isSafeInteger(centavos) ? centavos : null;
}
