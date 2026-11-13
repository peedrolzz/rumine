// Serve o frontend compilado (PWA) pela própria API, na MESMA origem: assim o cookie de sessão
// (SameSite=Lax) e a proteção CSRF por Origin funcionam sem CORS. Usado na publicação (Fly.io).
import { existsSync } from "node:fs";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";

/**
 * Registra os arquivos do frontend e o "fallback de SPA".
 *
 * Algumas telas têm o mesmo caminho de uma rota da API (ex.: /historico). Quem decide é o
 * cabeçalho Accept: o navegador navegando pede `text/html` e recebe o `index.html` (o React
 * Router cuida do resto); as chamadas do app (`fetch`, `*\/*`) continuam indo para a API.
 */
export async function registrarFrontend(app: FastifyInstance, pasta: string) {
  const raiz = path.resolve(pasta);
  if (!existsSync(path.join(raiz, "index.html"))) {
    throw new Error(`Frontend não encontrado em ${raiz}. Rode "npm run build" em frontend/.`);
  }

  await app.register(fastifyStatic, {
    root: raiz,
    index: false, // "/" é tratado pelo fallback abaixo
    setHeaders(res, arquivo) {
      // Os arquivos de /assets têm hash no nome: podem ser guardados por muito tempo.
      const emAssets = arquivo.includes(`${path.sep}assets${path.sep}`);
      res.header("Cache-Control", emAssets ? "public, max-age=31536000, immutable" : "no-cache");
      res.header("X-Content-Type-Options", "nosniff");
    },
  });

  app.addHook("onRequest", async (request, reply) => {
    if (request.method !== "GET" && request.method !== "HEAD") return;
    if (!(request.headers.accept ?? "").includes("text/html")) return;
    const caminho = (request.raw.url ?? "/").split("?")[0] ?? "/";
    // Pedido de arquivo (tem extensão): deixa o servidor de estáticos responder (ou dar 404).
    if ((caminho.split("/").pop() ?? "").includes(".")) return;
    return reply.header("Cache-Control", "no-cache").header("X-Content-Type-Options", "nosniff").sendFile("index.html");
  });
}
