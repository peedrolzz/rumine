import type { FastifyInstance } from "fastify";
import { exigirPerfil } from "../../shared/auth.js";
import { validar } from "../../shared/validacao.js";
import { decodificarCursor } from "./cursor.js";
import { consultaHistorico } from "./esquemas.js";
import type { ServicoHistorico } from "./servico.js";

export function rotasHistorico(servico: ServicoHistorico) {
  return async (app: FastifyInstance) => {
    // Histórico do próprio usuário logado (HU-09). O histórico geral do Admin é outra história (HU-10).
    app.get(
      "/historico",
      { preHandler: exigirPerfil("USUARIO", "OPERADOR", "ADMIN", "MESTRE") },
      async (request, reply) => {
        const consulta = validar(consultaHistorico, request.query, reply);
        if (!consulta) return;

        const usuario = request.usuario!;
        if (consulta.usuarioId !== undefined && consulta.usuarioId !== usuario.id) {
          return reply.code(403).send({ mensagem: "Você só pode ver o seu próprio histórico." });
        }

        let depois;
        if (consulta.cursor !== undefined) {
          depois = decodificarCursor(consulta.cursor);
          if (!depois) return reply.code(400).send({ campo: "cursor", mensagem: "Cursor inválido." });
        }

        return servico.listar(usuario.id, consulta.tipo, consulta.limite, depois ?? undefined);
      },
    );
  };
}
