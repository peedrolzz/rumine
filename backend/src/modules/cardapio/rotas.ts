import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodType } from "zod";
import { exigirPerfil } from "../../shared/auth.js";
import { corpoCardapio, paramsData } from "./esquemas.js";
import type { ServicoCardapio } from "./servico.js";

// Valida a entrada; em caso de erro responde 400 indicando o campo.
function validar<T>(esquema: ZodType<T>, dado: unknown, reply: FastifyReply): T | undefined {
  const r = esquema.safeParse(dado);
  if (r.success) return r.data;
  const erro = r.error.issues[0];
  reply.code(400).send({ campo: String(erro?.path[0] ?? ""), mensagem: erro?.message ?? "Dados inválidos." });
  return undefined;
}

export function rotasCardapio(servico: ServicoCardapio) {
  return async (app: FastifyInstance) => {
    // Qualquer usuário logado consulta o cardápio de uma data (HU-12).
    app.get(
      "/cardapios/:data",
      { preHandler: exigirPerfil("USUARIO", "OPERADOR", "ADMIN", "MESTRE") },
      async (request, reply) => {
        const params = validar(paramsData, request.params, reply);
        if (!params) return;
        const cardapio = await servico.consultar(params.data);
        if (!cardapio) {
          return reply.code(404).send({ mensagem: "O cardápio desta data ainda não foi publicado." });
        }
        return cardapio;
      },
    );

    // Só o Admin cadastra ou edita; a nova versão substitui a anterior (HU-11).
    app.put("/cardapios/:data", { preHandler: exigirPerfil("ADMIN") }, async (request, reply) => {
      const params = validar(paramsData, request.params, reply);
      if (!params) return;
      const corpo = validar(corpoCardapio, request.body ?? {}, reply);
      if (!corpo) return;
      return servico.salvar(params.data, request.usuario!.id, corpo);
    });
  };
}
