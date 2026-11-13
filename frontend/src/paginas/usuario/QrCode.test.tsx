// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { criarBackendFalso, type BackendFalso } from "../../testes/backendFalso";
import { renderApp } from "../../testes/renderApp";
import { RENOVAR_ANTES_MS, REPETIR_APOS_ERRO_MS } from "./QrCode";

let backend: BackendFalso;
let contador: number;

const emitir = () => ({
  status: 200,
  corpo: { token: `token-${++contador}`, expiraEm: "2026-11-12T12:00:30.000Z", validadeSegundos: 30 },
});
const passar = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const pedidos = () => backend.vezes("POST", "/qr");
/** O QR mostrado carrega o token no atributo de dados do SVG? Não: lemos o que foi pedido. */
const svg = () => document.querySelector("svg[role='img']");

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  contador = 0;
  backend = criarBackendFalso({ logado: true });
  backend.rota("POST", "/qr", emitir, { protegida: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const abrir = async () => {
  renderApp("/qr");
  await screen.findByRole("heading", { name: "QR Code" });
};

describe("exibir o QR", () => {
  it("mostra o QR, a contagem regressiva e a orientação", async () => {
    await abrir();
    expect(await screen.findByText(/Expira em \d+ s/)).toBeTruthy();
    expect(svg()).not.toBeNull();
    expect(screen.getByText(/não tire print/)).toBeTruthy();
    expect(pedidos()).toBe(1);
  });

  it("enquanto gera, mostra o carregando", async () => {
    const lento = backend.adiar("POST", "/qr");
    await abrir();
    expect(screen.getByRole("status", { name: "Gerando QR Code" })).toBeTruthy();
    lento.resolver(emitir());
    expect(await screen.findByText(/Expira em (29|30) s/)).toBeTruthy();
  });

  it("a contagem regressiva desce a cada segundo", async () => {
    await abrir();
    await screen.findByText(/Expira em (29|30) s/);
    await passar(10_000);
    expect(screen.getByText(/Expira em (19|20|21) s/)).toBeTruthy();
  });

  it("o QR usa o token recebido e não mostra o RA", async () => {
    await abrir();
    await screen.findByText(/Expira em (29|30) s/);
    expect(document.body.textContent).not.toContain("a2345678");
    // O SVG tem título acessível para leitor de tela.
    expect(screen.getByTitle("QR Code de acesso ao RU")).toBeTruthy();
  });
});

describe("renovação automática", () => {
  it("renova 5 s antes de vencer, sem trocar a tela por carregando", async () => {
    await abrir();
    await screen.findByText(/Expira em (29|30) s/);
    await passar(30_000 - RENOVAR_ANTES_MS - 1500); // ainda antes da janela de renovação
    expect(pedidos()).toBe(1);
    await passar(2500);
    expect(pedidos()).toBe(2);
    expect(screen.getByText(/Expira em (29|30) s/)).toBeTruthy();
    expect(screen.queryByRole("status", { name: "Gerando QR Code" })).toBeNull();
  });

  it("continua renovando ciclo após ciclo", async () => {
    await abrir();
    await screen.findByText(/Expira em (29|30) s/);
    await passar(26_000 * 3);
    expect(pedidos()).toBeGreaterThanOrEqual(4);
    expect(screen.queryByText("QR Code expirado.")).toBeNull();
  });

  it("não consulta com a aba escondida e renova ao voltar", async () => {
    await abrir();
    await screen.findByText(/Expira em (29|30) s/);
    const visibilidade = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await passar(40_000);
    expect(pedidos()).toBe(1); // nada de consultar escondida
    visibilidade.mockReturnValue("visible");
    await passar(1000);
    expect(pedidos()).toBeGreaterThanOrEqual(2);
    expect(await screen.findByText(/Expira em \d+ s/)).toBeTruthy();
    visibilidade.mockRestore();
  });

  it("se a renovação falha, o QR atual continua visível e tenta de novo", async () => {
    await abrir();
    await screen.findByText(/Expira em (29|30) s/);
    backend.rota("POST", "/qr", new Error("sem rede"), { protegida: true });
    await passar(26_000);
    expect(screen.getByText(/Não foi possível renovar agora/)).toBeTruthy();
    expect(svg()).not.toBeNull(); // ainda vale por alguns segundos
    const antes = pedidos();
    await passar(REPETIR_APOS_ERRO_MS + 1000);
    expect(pedidos()).toBeGreaterThan(antes);
    // Voltou a rede: renova e o aviso some.
    backend.rota("POST", "/qr", emitir, { protegida: true });
    await passar(REPETIR_APOS_ERRO_MS + 1000);
    expect(screen.queryByText(/Não foi possível renovar agora/)).toBeNull();
  });

  it("sem rede até vencer: mostra 'QR Code expirado' e esconde o QR", async () => {
    await abrir();
    await screen.findByText(/Expira em (29|30) s/);
    backend.rota("POST", "/qr", new Error("sem rede"), { protegida: true });
    await passar(32_000);
    expect(screen.getByText(/QR Code expirado/)).toBeTruthy();
    expect(svg()).toBeNull(); // um QR vencido nunca fica na tela
    expect(screen.getByRole("button", { name: "Gerar de novo" })).toBeTruthy();
  });

  it("'Gerar de novo' traz um QR novo depois de vencer", async () => {
    await abrir();
    await screen.findByText(/Expira em (29|30) s/);
    backend.rota("POST", "/qr", new Error("sem rede"), { protegida: true });
    await passar(32_000);
    backend.rota("POST", "/qr", emitir, { protegida: true });
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await u.click(screen.getByRole("button", { name: "Gerar de novo" }));
    expect(await screen.findByText(/Expira em \d+ s/)).toBeTruthy();
    expect(svg()).not.toBeNull();
  });

  it("ao sair da tela, para de consultar", async () => {
    await abrir();
    await screen.findByText(/Expira em (29|30) s/);
    cleanup();
    const antes = pedidos();
    await passar(120_000);
    expect(pedidos()).toBe(antes);
  });
});

describe("erros e cadastro pendente", () => {
  it("falha na primeira busca: mostra o erro e 'Tentar de novo'", async () => {
    backend.rota("POST", "/qr", new Error("sem rede"), { protegida: true });
    await abrir();
    expect(await screen.findByRole("button", { name: "Tentar de novo" })).toBeTruthy();
    expect(screen.getByText(/Não foi possível conectar ao servidor/)).toBeTruthy();
    expect(svg()).toBeNull();
    backend.rota("POST", "/qr", emitir, { protegida: true });
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await u.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText(/Expira em (29|30) s/)).toBeTruthy();
  });

  it("cadastro em análise: mostra o motivo, sem QR, e leva ao status", async () => {
    backend.rota(
      "POST",
      "/qr",
      { status: 403, corpo: { codigo: "CADASTRO_PENDENTE", mensagem: "Seu cadastro está em análise. Aguarde a aprovação do Admin." } },
      { protegida: true },
    );
    await abrir();
    expect(await screen.findByText(/Seu cadastro está em análise/)).toBeTruthy();
    expect(svg()).toBeNull();
    expect(screen.getByRole("link", { name: "Ver situação do cadastro" }).getAttribute("href")).toBe("/status-cadastro");
    await passar(60_000);
    expect(pedidos()).toBe(1); // não insiste enquanto não for aprovado
  });

  it("cadastro rejeitado: mostra o motivo da API", async () => {
    backend.rota(
      "POST",
      "/qr",
      { status: 403, corpo: { codigo: "CADASTRO_PENDENTE", mensagem: "Seu cadastro não foi aprovado. Reenvie sua declaração para uma nova análise." } },
      { protegida: true },
    );
    await abrir();
    expect(await screen.findByText(/não foi aprovado/)).toBeTruthy();
    expect(svg()).toBeNull();
  });
});

describe("manter a tela acesa", () => {
  it("pede o bloqueio de tela e solta ao sair", async () => {
    const liberar = vi.fn(async () => undefined);
    const pedir = vi.fn(async () => ({ release: liberar }));
    Object.defineProperty(navigator, "wakeLock", { value: { request: pedir }, configurable: true });
    await abrir();
    await screen.findByText(/Expira em (29|30) s/);
    expect(pedir).toHaveBeenCalledWith("screen");
    cleanup();
    expect(liberar).toHaveBeenCalled();
    Object.defineProperty(navigator, "wakeLock", { value: undefined, configurable: true });
  });

  it("sem suporte ou com recusa, o QR funciona do mesmo jeito", async () => {
    Object.defineProperty(navigator, "wakeLock", {
      value: { request: vi.fn(async () => { throw new Error("negado"); }) },
      configurable: true,
    });
    await abrir();
    expect(await screen.findByText(/Expira em (29|30) s/)).toBeTruthy();
    Object.defineProperty(navigator, "wakeLock", { value: undefined, configurable: true });
  });
});

describe("entrada pelo Início", () => {
  it("o Início tem o botão 'Mostrar QR Code' que leva a /qr", async () => {
    renderApp("/");
    const link = await screen.findByRole("link", { name: "Mostrar QR Code" });
    expect(link.getAttribute("href")).toBe("/qr");
  });
});
