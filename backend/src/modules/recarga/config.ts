/**
 * Decide se o "simular pagamento" fica disponível (HU-05).
 *
 * - Fora de produção: sempre.
 * - Em produção: só com `PAGAMENTO_SIMULACAO_DEMO=true`, o interruptor de demonstração. Ele existe
 *   para publicar uma demonstração sem provedor real (o Mercado Pago está fora do MVP). Com ele
 *   ligado, QUALQUER conta aprovada consegue creditar saldo de mentira em si mesma: use só em um
 *   ambiente de demonstração, nunca com dinheiro real. Só o texto exato "true" liga.
 */
export function simulacaoHabilitada(env: Record<string, string | undefined>): boolean {
  return env["NODE_ENV"] !== "production" || env["PAGAMENTO_SIMULACAO_DEMO"] === "true";
}

/** Verdadeiro quando a simulação está ligada em produção: o servidor avisa isso no log ao subir. */
export function simulacaoDemoEmProducao(env: Record<string, string | undefined>): boolean {
  return env["NODE_ENV"] === "production" && env["PAGAMENTO_SIMULACAO_DEMO"] === "true";
}
