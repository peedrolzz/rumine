import Fastify, { type FastifyError } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import type { Identificador } from "./shared/auth.js";
import { exigirOrigemConfiavel } from "./shared/csrf.js";
import { hojeNoBrasil } from "./shared/data.js";
import { rotasCardapio } from "./modules/cardapio/rotas.js";
import { criarServicoCardapio } from "./modules/cardapio/servico.js";
import type { CardapioRepositorio } from "./modules/cardapio/repositorio.js";
import { rotasHistorico } from "./modules/historico/rotas.js";
import { criarServicoHistorico } from "./modules/historico/servico.js";
import type { HistoricoRepositorio } from "./modules/historico/repositorio.js";
import { criarEsquemaCadastro, lerDominios } from "./modules/identidade/esquemas.js";
import { criarLimitador, type Limitador } from "./modules/identidade/limitador.js";
import type { IdentidadeRepositorio } from "./modules/identidade/repositorio.js";
import { NOME_COOKIE_SESSAO, rotasIdentidade } from "./modules/identidade/rotas.js";
import { hasherArgon2, type Hasher } from "./modules/identidade/senha.js";
import { criarServicoEmailConsole, type ServicoEmail } from "./modules/identidade/servicoEmail.js";
import { criarServicoIdentidade } from "./modules/identidade/servico.js";

/** Login, cadastro e sessão (HU-01). Só o repositório é obrigatório; o resto tem padrão. */
export type ConfigIdentidade = {
  repo: IdentidadeRepositorio;
  /** Padrão: escreve o e-mail no log (versão de desenvolvimento). */
  email?: ServicoEmail;
  hasher?: Hasher;
  limitador?: Limitador;
  agora?: () => Date;
  /** Padrão: variável DOMINIOS_EMAIL_PERMITIDOS, ou @alunos.utfpr.edu.br. */
  dominios?: string[];
};

export type Dependencias = {
  cardapioRepo: CardapioRepositorio;
  historicoRepo?: HistoricoRepositorio | undefined;
  identidade?: ConfigIdentidade | undefined;
  /**
   * Identificador explícito (DEV_USUARIO ou os testes). Roda depois do cookie de sessão
   * e, se definir o usuário, tem precedência sobre ele.
   */
  identificar?: Identificador | undefined;
  /** Endereço do front: origem aceita no CORS e no CSRF, e base do link do e-mail. */
  origemFrontend?: string;
  /** Data de hoje (aaaa-mm-dd). Injetável para os testes. */
  hoje?: () => string;
  producao?: boolean;
  logger?: boolean;
};

export async function buildApp({
  cardapioRepo,
  historicoRepo,
  identidade,
  identificar,
  origemFrontend = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
  hoje = hojeNoBrasil,
  producao = process.env.NODE_ENV === "production",
  logger = false,
}: Dependencias) {
  // Em produção a API fica atrás do proxy do Fly.io: só aí o IP real vem do cabeçalho do proxy.
  const app = Fastify({ logger, trustProxy: producao });
  await app.register(cors, {
    origin: origemFrontend,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  await app.register(cookie);

  // Erros sempre no formato { mensagem } em português; detalhes internos só no log.
  app.setErrorHandler((erro: FastifyError, request, reply) => {
    const status = erro.statusCode && erro.statusCode >= 400 ? erro.statusCode : 500;
    if (status >= 500) {
      request.log.error(erro);
      return reply.code(500).send({ mensagem: "Erro interno. Tente novamente em instantes." });
    }
    return reply.code(status).send({ mensagem: "Requisição inválida." });
  });

  app.addHook("onRequest", exigirOrigemConfiavel(origemFrontend));

  app.decorateRequest("usuario");
  app.decorateRequest("sessaoExpirada");

  const servicoIdentidade = identidade && montarIdentidade(app, identidade, origemFrontend);
  if (servicoIdentidade) {
    // Descobre o usuário pelo cookie de sessão.
    app.addHook("onRequest", async (request) => {
      const token = request.cookies[NOME_COOKIE_SESSAO];
      if (!token) return;
      const sessao = await servicoIdentidade.servico.identificar(token);
      if (sessao.tipo === "OK") request.usuario = sessao.usuario;
      else if (sessao.tipo === "EXPIRADA") request.sessaoExpirada = true;
    });
  }
  if (identificar) {
    app.addHook("onRequest", async (request) => {
      await identificar(request);
    });
  }

  app.get("/health", async () => ({ status: "ok" }));
  if (servicoIdentidade) {
    await app.register(
      rotasIdentidade(servicoIdentidade.servico, {
        esquemaCadastro: servicoIdentidade.esquemaCadastro,
        producao,
      }),
    );
  }
  await app.register(rotasCardapio(criarServicoCardapio(cardapioRepo), hoje));
  if (historicoRepo) await app.register(rotasHistorico(criarServicoHistorico(historicoRepo)));
  return app;
}

function montarIdentidade(app: { log: { info(msg: string): void } }, config: ConfigIdentidade, urlFrontend: string) {
  const agora = config.agora ?? (() => new Date());
  const dominios = config.dominios ?? lerDominios(process.env.DOMINIOS_EMAIL_PERMITIDOS);
  const servico = criarServicoIdentidade({
    repo: config.repo,
    hasher: config.hasher ?? hasherArgon2,
    email: config.email ?? criarServicoEmailConsole((texto) => app.log.info(texto)),
    limitador: config.limitador ?? criarLimitador({ agora: () => agora().getTime() }),
    urlFrontend,
    agora,
  });
  return { servico, esquemaCadastro: criarEsquemaCadastro(dominios) };
}
