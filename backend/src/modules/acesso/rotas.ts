import type { FastifyInstance } from "fastify";
import { exigirCadastroAtivo, exigirPerfil } from "../../shared/auth.js";
import { validar } from "../../shared/validacao.js";
import { esquemaLeitura, type ServicoLeitura } from "./leitura.js";
import type { ServicoQr } from "./qrToken.js";

export function rotasAcesso(qr: ServicoQr, leitura?: ServicoLeitura) {
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

    if (!leitura) return;
    // Leitura do QR pelo Operador (HU-07) e débito da refeição (HU-08). Uma leitura negada é uma
    // resposta normal (200 com liberado=false); só entrada malformada é 400.
    app.post("/leituras", { preHandler: exigirPerfil("OPERADOR") }, async (request, reply) => {
      const dados = validar(esquemaLeitura, request.body ?? {}, reply);
      if (!dados) return;
      const r = await leitura.ler(request.usuario!.id, dados.token);
      if ("tipo" in r) {
        return reply.code(409).send({ mensagem: "O preço da refeição não está configurado. Avise o Admin." });
      }
      return reply.header("Cache-Control", "no-store").send(r);
    });
  };
}
