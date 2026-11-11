import type { FastifyReply, FastifyRequest } from "fastify";

const METODOS_SEGUROS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Proteção contra CSRF (ADR-005) para a sessão em cookie: toda requisição que altera dados
 * e traz o cabeçalho Origin precisa vir do front configurado. Navegadores sempre enviam Origin
 * em requisições de outro site, então um site malicioso é barrado. Clientes sem Origin
 * (curl, testes) passam: eles não carregam o cookie de ninguém.
 */
export function exigirOrigemConfiavel(origemPermitida: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (METODOS_SEGUROS.has(request.method)) return;
    const origem = request.headers.origin;
    if (origem !== undefined && origem !== origemPermitida) {
      return reply.code(403).send({ mensagem: "Origem não permitida." });
    }
  };
}
