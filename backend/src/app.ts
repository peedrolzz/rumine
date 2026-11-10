import Fastify, { type FastifyError } from "fastify";
import cors from "@fastify/cors";
import type { Identificador } from "./shared/auth.js";
import { hojeNoBrasil } from "./shared/data.js";
import { rotasCardapio } from "./modules/cardapio/rotas.js";
import { criarServicoCardapio } from "./modules/cardapio/servico.js";
import type { CardapioRepositorio } from "./modules/cardapio/repositorio.js";
import { rotasHistorico } from "./modules/historico/rotas.js";
import { criarServicoHistorico } from "./modules/historico/servico.js";
import type { HistoricoRepositorio } from "./modules/historico/repositorio.js";

export type Dependencias = {
  cardapioRepo: CardapioRepositorio;
  historicoRepo?: HistoricoRepositorio | undefined;
  /** Descobre o usuário da requisição. Sem ele, toda rota privada responde 401. */
  identificar?: Identificador | undefined;
  /** Data de hoje (aaaa-mm-dd). Injetável para os testes. */
  hoje?: () => string;
  logger?: boolean;
};

export async function buildApp({
  cardapioRepo,
  historicoRepo,
  identificar,
  hoje = hojeNoBrasil,
  logger = false,
}: Dependencias) {
  const app = Fastify({ logger });
  await app.register(cors, {
    origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  // Erros sempre no formato { mensagem } em português; detalhes internos só no log.
  app.setErrorHandler((erro: FastifyError, request, reply) => {
    const status = erro.statusCode && erro.statusCode >= 400 ? erro.statusCode : 500;
    if (status >= 500) {
      request.log.error(erro);
      return reply.code(500).send({ mensagem: "Erro interno. Tente novamente em instantes." });
    }
    return reply.code(status).send({ mensagem: "Requisição inválida." });
  });

  app.decorateRequest("usuario");
  if (identificar) {
    app.addHook("onRequest", async (request) => {
      await identificar(request);
    });
  }

  app.get("/health", async () => ({ status: "ok" }));
  await app.register(rotasCardapio(criarServicoCardapio(cardapioRepo), hoje));
  if (historicoRepo) await app.register(rotasHistorico(criarServicoHistorico(historicoRepo)));
  return app;
}
