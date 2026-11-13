import type { FastifyInstance } from "fastify";
import { exigirCadastroAtivo, exigirPerfil } from "../../shared/auth.js";
import type { ServicoQr } from "./qrToken.js";

export function rotasAcesso(qr: ServicoQr) {
  return async (app: FastifyInstance) => {
    // Só o Usuário com cadastro aprovado recebe QR; conta em análise ou rejeitada leva 403 com o motivo.
    app.post(
      "/qr",
      { preHandler: [exigirPerfil("USUARIO"), exigirCadastroAtivo()] },
      async (request, reply) => {
        // Cada chamada gera um token novo (jti único). Nunca guardar em cache.
        return reply.header("Cache-Control", "no-store").send(await qr.gerar(request.usuario!.id));
      },
    );
  };
}
