import type { FastifyInstance } from "fastify";
import { exigirPerfil } from "../../shared/auth.js";
import { validar } from "../../shared/validacao.js";
import { corpoCardapio, paramsData } from "./esquemas.js";
import type { ServicoCardapio } from "./servico.js";

export function rotasCardapio(servico: ServicoCardapio, hoje: () => string) {
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
      // Não há correção retroativa: só datas de hoje em diante podem ser cadastradas ou editadas.
      if (params.data < hoje()) {
        return reply.code(400).send({
          campo: "data",
          mensagem: "Não é possível cadastrar ou editar o cardápio de uma data que já passou.",
        });
      }
      const corpo = validar(corpoCardapio, request.body ?? {}, reply);
      if (!corpo) return;
      return servico.salvar(params.data, request.usuario!.id, corpo);
    });
  };
}
