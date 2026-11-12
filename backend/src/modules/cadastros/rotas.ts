import type { FastifyInstance, FastifyReply } from "fastify";
import { exigirPerfil } from "../../shared/auth.js";
import { validar } from "../../shared/validacao.js";
import type { ResultadoDecisao } from "./repositorio.js";
import {
  CURSOR_INVALIDO,
  consultaCadastros,
  esquemaIdUsuario,
  esquemaRejeicao,
  type ServicoCadastros,
} from "./servico.js";

// Resposta de uma decisão que não foi gravada.
function recusar(resultado: Exclude<ResultadoDecisao, "OK">, reply: FastifyReply) {
  if (resultado === "NAO_ENCONTRADO") return reply.code(404).send({ mensagem: "Cadastro não encontrado." });
  if (resultado === "SEM_DECLARACAO") {
    return reply.code(409).send({ mensagem: "Este cadastro ainda não enviou a declaração." });
  }
  return reply.code(409).send({ codigo: "JA_DECIDIDO", mensagem: "Este cadastro já foi analisado." });
}

export function rotasCadastros(servico: ServicoCadastros) {
  return async (app: FastifyInstance) => {
    const soAdmin = { preHandler: exigirPerfil("ADMIN") };

    // Fila de cadastros aguardando análise: nome, e-mail, RA e a declaração enviada.
    app.get("/admin/cadastros", soAdmin, async (request, reply) => {
      const consulta = validar(consultaCadastros, request.query, reply);
      if (!consulta) return;
      const pagina = await servico.listar(consulta.limite, consulta.cursor);
      if (pagina === CURSOR_INVALIDO) return reply.code(400).send({ campo: "cursor", mensagem: "Cursor inválido." });
      return pagina;
    });

    app.post("/admin/cadastros/:usuarioId/aprovar", soAdmin, async (request, reply) => {
      const id = esquemaIdUsuario.safeParse((request.params as { usuarioId?: string }).usuarioId);
      if (!id.success) return reply.code(400).send({ campo: "usuarioId", mensagem: "Cadastro inválido." });
      const resultado = await servico.aprovar(id.data, request.usuario!.id);
      if (resultado !== "OK") return recusar(resultado, reply);
      return { status: "ATIVO" };
    });

    // O motivo é obrigatório e fica visível para o usuário (tela de cadastro não aprovado).
    app.post("/admin/cadastros/:usuarioId/rejeitar", soAdmin, async (request, reply) => {
      const id = esquemaIdUsuario.safeParse((request.params as { usuarioId?: string }).usuarioId);
      if (!id.success) return reply.code(400).send({ campo: "usuarioId", mensagem: "Cadastro inválido." });
      const dados = validar(esquemaRejeicao, request.body ?? {}, reply);
      if (!dados) return;
      const resultado = await servico.rejeitar(id.data, request.usuario!.id, dados.motivo);
      if (resultado !== "OK") return recusar(resultado, reply);
      return { status: "REJEITADO" };
    });
  };
}
