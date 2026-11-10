import Fastify from "fastify";
import cors from "@fastify/cors";
import type { Identificador } from "./shared/auth.js";
import { hojeNoBrasil } from "./shared/data.js";
import { rotasCardapio } from "./modules/cardapio/rotas.js";
import { criarServicoCardapio } from "./modules/cardapio/servico.js";
import type { CardapioRepositorio } from "./modules/cardapio/repositorio.js";

export type Dependencias = {
  cardapioRepo: CardapioRepositorio;
  /** Descobre o usuário da requisição. Sem ele, toda rota privada responde 401. */
  identificar?: Identificador | undefined;
  /** Data de hoje (aaaa-mm-dd). Injetável para os testes. */
  hoje?: () => string;
  logger?: boolean;
};

export async function buildApp({ cardapioRepo, identificar, hoje = hojeNoBrasil, logger = false }: Dependencias) {
  const app = Fastify({ logger });
  await app.register(cors, {
    origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  app.decorateRequest("usuario");
  if (identificar) {
    app.addHook("onRequest", async (request) => {
      await identificar(request);
    });
  }

  app.get("/health", async () => ({ status: "ok" }));
  await app.register(rotasCardapio(criarServicoCardapio(cardapioRepo), hoje));
  return app;
}
