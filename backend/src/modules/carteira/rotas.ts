import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { exigirCadastroAtivo, exigirPerfil } from "../../shared/auth.js";
import { validar } from "../../shared/validacao.js";
import type { ServicoCarteira } from "./servico.js";

// Aceito só para negar: o saldo é sempre o do usuário logado (mesmo padrão do histórico).
const consulta = z.object({ usuarioId: z.string().optional() });

export function rotasCarteira(servico: ServicoCarteira) {
  return async (app: FastifyInstance) => {
    // Só o perfil Usuário tem carteira, e só com o cadastro aprovado (conta em análise recebe 403).
    app.get(
      "/carteira",
      { preHandler: [exigirPerfil("USUARIO"), exigirCadastroAtivo()] },
      async (request, reply) => {
        const dados = validar(consulta, request.query, reply);
        if (!dados) return;
        const usuario = request.usuario!;
        if (dados.usuarioId !== undefined && dados.usuarioId !== usuario.id) {
          return reply.code(403).send({ mensagem: "Você só pode ver o seu próprio saldo." });
        }
        // Saldo muda a cada recarga e consumo: nunca guardar em cache.
        return reply.header("Cache-Control", "no-store").send(await servico.saldo(usuario.id));
      },
    );
  };
}
