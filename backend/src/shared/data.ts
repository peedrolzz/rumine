// "Hoje" no fuso do câmpus (Brasil), em aaaa-mm-dd. Não depende do fuso do servidor.
export function hojeNoBrasil(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}
