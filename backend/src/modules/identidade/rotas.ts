import type { FastifyInstance } from "fastify";
import type { ZodType } from "zod";
import { exigirPerfil } from "../../shared/auth.js";
import { validar } from "../../shared/validacao.js";
import { esquemaConfirmacao, esquemaLogin, type DadosCadastro } from "./esquemas.js";
import { VALIDADE_SESSAO_MS, type ServicoIdentidade } from "./servico.js";

export const NOME_COOKIE_SESSAO = "rumine_sessao";

type Opcoes = {
  esquemaCadastro: ZodType<DadosCadastro>;
  /** Em produção o cookie só trafega por HTTPS (Secure). */
  producao: boolean;
};

export function rotasIdentidade(servico: ServicoIdentidade, { esquemaCadastro, producao }: Opcoes) {
  // Cookie da sessão: inacessível ao JavaScript (HttpOnly) e não enviado em requisições de outros sites (SameSite=Lax).
  const opcoesCookie = { httpOnly: true, sameSite: "lax", secure: producao, path: "/" } as const;

  return async (app: FastifyInstance) => {
    app.post("/auth/cadastro", async (request, reply) => {
      const dados = validar(esquemaCadastro, request.body ?? {}, reply);
      if (!dados) return;
      await servico.cadastrar(dados);
      // Resposta única, exista ou não conta com este e-mail.
      return reply.code(201).send({
        mensagem: "Enviamos um e-mail para confirmar seu cadastro. Abra o link da mensagem para continuar.",
      });
    });

    app.post("/auth/confirmar-email", async (request, reply) => {
      const dados = validar(esquemaConfirmacao, request.body ?? {}, reply);
      if (!dados) return;
      if (!(await servico.confirmarEmail(dados.token))) {
        return reply.code(400).send({
          mensagem: "Este link é inválido ou expirou. Faça o cadastro novamente para receber um novo e-mail.",
        });
      }
      return { mensagem: "E-mail confirmado! Seu cadastro agora aguarda a aprovação do Admin." };
    });

    app.post("/auth/login", async (request, reply) => {
      const dados = validar(esquemaLogin, request.body ?? {}, reply);
      if (!dados) return;

      const resultado = await servico.login({ ...dados, ip: request.ip });
      switch (resultado.tipo) {
        case "BLOQUEADO":
          return reply
            .code(429)
            .header("Retry-After", "900")
            .send({ mensagem: "Muitas tentativas de entrada. Aguarde alguns minutos e tente de novo." });
        case "CREDENCIAIS":
          // Mesma mensagem para e-mail inexistente e senha errada.
          return reply.code(401).send({ mensagem: "E-mail ou senha incorretos." });
        case "DESATIVADO":
          return reply.code(403).send({ mensagem: "Sua conta está desativada. Fale com o RU." });
        case "EMAIL_NAO_CONFIRMADO":
          return reply
            .code(403)
            .send({ mensagem: "Confirme seu e-mail antes de entrar. Procure o link na sua caixa de entrada." });
        case "OK":
          reply.setCookie(NOME_COOKIE_SESSAO, resultado.token, { ...opcoesCookie, maxAge: VALIDADE_SESSAO_MS / 1000 });
          return { usuario: resultado.usuario };
      }
    });

    // Sair é idempotente: sem sessão, apenas limpa o cookie.
    app.post("/auth/logout", async (request, reply) => {
      const token = request.cookies[NOME_COOKIE_SESSAO];
      if (token) await servico.sair(token);
      reply.clearCookie(NOME_COOKIE_SESSAO, opcoesCookie);
      return reply.code(204).send();
    });

    // Quem sou eu: o front usa para saber se há sessão e qual o status do cadastro.
    app.get("/auth/me", { preHandler: exigirPerfil("USUARIO", "OPERADOR", "ADMIN", "MESTRE") }, async (request, reply) => {
      const usuario = await servico.dadosDoUsuario(request.usuario!.id);
      if (!usuario) return reply.code(401).send({ mensagem: "Faça login para continuar." });
      return { usuario };
    });
  };
}
