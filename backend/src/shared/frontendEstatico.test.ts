import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import type { Identificador } from "./auth.js";
import type { CardapioRepositorio } from "../modules/cardapio/repositorio.js";

const HTML = "<!doctype html><title>RU Mine</title><div id=root></div>";
let pasta: string;
let segredo: string;

beforeAll(() => {
  const base = mkdtempSync(path.join(tmpdir(), "rumine-front-"));
  pasta = path.join(base, "dist");
  mkdirSync(path.join(pasta, "assets"), { recursive: true });
  writeFileSync(path.join(pasta, "index.html"), HTML);
  writeFileSync(path.join(pasta, "assets", "app-abc123.js"), "console.log('app')");
  writeFileSync(path.join(pasta, "favicon.svg"), "<svg/>");
  segredo = path.join(base, "segredo.txt"); // fora da pasta servida
  writeFileSync(segredo, "SEGREDO");
});
afterAll(() => rmSync(path.dirname(pasta), { recursive: true, force: true }));

const cardapioRepo: CardapioRepositorio = { salvar: async (data) => ({ data, itens: [] }), buscar: async () => null };
const identificar: Identificador = (request) => {
  if (request.headers["x-perfil"]) request.usuario = { id: "00000000-0000-4000-8000-000000000003", perfil: "USUARIO" };
};
const montar = () =>
  buildApp({
    cardapioRepo,
    historicoRepo: { transacoes: async () => [], refeicoesIsentas: async () => [] },
    frontendDist: pasta,
    identificar,
  });
const NAVEGADOR = { accept: "text/html,application/xhtml+xml,*/*;q=0.8" };

describe("frontend servido pela API", () => {
  it("a raiz e as telas do app devolvem o index.html quando o navegador navega", async () => {
    const app = await montar();
    for (const url of ["/", "/entrar", "/cadastro", "/recarga", "/qr", "/operador/leitura", "/historico"]) {
      const r = await app.inject({ method: "GET", url, headers: NAVEGADOR });
      expect(r.statusCode, url).toBe(200);
      expect(r.body, url).toBe(HTML);
      expect(r.headers["content-type"], url).toMatch(/text\/html/);
      expect(r.headers["cache-control"], url).toBe("no-cache");
    }
  });

  it("a mesma rota /historico, chamada pelo app (fetch), continua sendo a API", async () => {
    const app = await montar();
    const sem = await app.inject({ method: "GET", url: "/historico", headers: { accept: "*/*" } });
    expect(sem.statusCode).toBe(401);
    expect(sem.json().mensagem).toBe("Faça login para continuar.");
    const com = await app.inject({ method: "GET", url: "/historico", headers: { accept: "*/*", "x-perfil": "USUARIO" } });
    expect(com.statusCode).toBe(200);
    expect(com.json().itens).toEqual([]);
  });

  it("/qr: navegar (GET html) mostra o app; a API é POST e continua exigindo login", async () => {
    const app = await montar();
    expect((await app.inject({ method: "GET", url: "/qr", headers: NAVEGADOR })).body).toBe(HTML);
    expect((await app.inject({ method: "POST", url: "/qr" })).statusCode).not.toBe(200);
  });

  it("/health responde JSON para quem não pede HTML (checagem de saúde do Fly)", async () => {
    const app = await montar();
    const r = await app.inject({ method: "GET", url: "/health" });
    expect(r.json()).toEqual({ status: "ok" });
  });

  it("arquivos estáticos: assets com cache longo e hash; os demais sem cache", async () => {
    const app = await montar();
    const js = await app.inject({ method: "GET", url: "/assets/app-abc123.js" });
    expect(js.statusCode).toBe(200);
    expect(js.body).toBe("console.log('app')");
    expect(js.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(js.headers["x-content-type-options"]).toBe("nosniff");
    const ico = await app.inject({ method: "GET", url: "/favicon.svg" });
    expect(ico.statusCode).toBe(200);
    expect(ico.headers["cache-control"]).toBe("no-cache");
  });

  it("arquivo inexistente: 404 (não devolve o index no lugar de um asset)", async () => {
    const app = await montar();
    expect((await app.inject({ method: "GET", url: "/assets/nao-existe.js" })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/assets/nao-existe.js", headers: NAVEGADOR })).statusCode).toBe(404);
  });

  it.each(["/../segredo.txt", "/%2e%2e/segredo.txt", "/assets/../../segredo.txt", "/..%2fsegredo.txt"])(
    "não vaza arquivos fora da pasta (%s)",
    async (url) => {
      const app = await montar();
      const r = await app.inject({ method: "GET", url });
      expect(r.body).not.toContain("SEGREDO");
    },
  );

  it("POST em rota de tela não vira o app (só GET e HEAD)", async () => {
    const app = await montar();
    const r = await app.inject({ method: "POST", url: "/entrar", headers: NAVEGADOR });
    expect(r.body).not.toBe(HTML);
  });

  it("sem frontendDist (desenvolvimento e testes) nada muda: tela desconhecida é 404 JSON", async () => {
    const app = await buildApp({ cardapioRepo, identificar });
    const r = await app.inject({ method: "GET", url: "/entrar", headers: NAVEGADOR });
    expect(r.statusCode).toBe(404);
  });

  it("pasta sem index.html: o servidor não sobe e explica", async () => {
    await expect(buildApp({ cardapioRepo, frontendDist: path.join(pasta, "assets") })).rejects.toThrow(/Frontend não encontrado/);
  });
});
