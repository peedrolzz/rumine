import type { FastifyReply } from "fastify";
import type { ZodType } from "zod";

/** Valida a entrada; em caso de erro responde 400 indicando o campo e devolve undefined. */
export function validar<T>(esquema: ZodType<T>, dado: unknown, reply: FastifyReply): T | undefined {
  const r = esquema.safeParse(dado);
  if (r.success) return r.data;
  const erro = r.error.issues[0];
  reply.code(400).send({ campo: String(erro?.path[0] ?? ""), mensagem: erro?.message ?? "Dados inválidos." });
  return undefined;
}
