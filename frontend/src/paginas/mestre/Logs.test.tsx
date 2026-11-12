// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { criarBackendFalso, USUARIO_ATIVO, type BackendFalso } from "../../testes/backendFalso";
import { renderApp } from "../../testes/renderApp";

let backend: BackendFalso;

const log = (n: number, extra: Record<string, unknown> = {}) => ({
  id: `id-${n}`,
  data: "2026-11-10T15:30:00.000Z",
  acao: "CRIAR_CONTA",
  entidade: "usuario",
  entidadeId: `u-${n}`,
  detalhes: { perfil: "ADMIN", email: `a${n}@utfpr.edu.br` },
  autor: { id: "m1", nome: "Mestre Teste" },
  ...extra,
});

beforeEach(() => {
  backend = criarBackendFalso({ usuario: { ...USUARIO_ATIVO, perfil: "MESTRE" }, logado: true });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const abrir = () => renderApp("/mestre/logs");

describe("Logs do Mestre", () => {
  it("mostra carregando enquanto espera", async () => {
    const lenta = backend.adiar("GET", "/mestre/logs");
    abrir();
    expect(await screen.findByRole("status", { name: "Carregando logs" })).toBeTruthy();
    lenta.resolver({ status: 200, corpo: { itens: [], proximoCursor: null } });
    expect(await screen.findByText("Ainda não há ações registradas.")).toBeTruthy();
    expect(screen.queryByRole("status", { name: "Carregando logs" })).toBeNull();
  });

  it("lista vazia: mensagem clara", async () => {
    backend.rota("GET", "/mestre/logs", { status: 200, corpo: { itens: [], proximoCursor: null } });
    abrir();
    expect(await screen.findByText("Ainda não há ações registradas.")).toBeTruthy();
  });

  it("mostra a ação, o autor e a data no formato brasileiro", async () => {
    backend.rota("GET", "/mestre/logs", { status: 200, corpo: { itens: [log(1)], proximoCursor: null } });
    abrir();
    expect(await screen.findByText("Conta criada: Admin a1@utfpr.edu.br")).toBeTruthy();
    expect(screen.getByText(/\d{2}\/\d{2}\/2026 \d{2}:\d{2} · por Mestre Teste/)).toBeTruthy();
    expect(screen.getByText("Você chegou ao fim dos registros.")).toBeTruthy();
  });

  it("criação do primeiro Mestre (sem autor) aparece como instalação do sistema", async () => {
    const item = log(2, { acao: "CRIAR_MESTRE", autor: null, detalhes: { perfil: "MESTRE", email: "m@utfpr.edu.br" } });
    backend.rota("GET", "/mestre/logs", { status: 200, corpo: { itens: [item], proximoCursor: null } });
    abrir();
    expect(await screen.findByText("Mestre criado: m@utfpr.edu.br")).toBeTruthy();
    expect(screen.getByText(/por instalação do sistema/)).toBeTruthy();
  });

  it("ação desconhecida aparece pelo código, sem esconder nada nem quebrar", async () => {
    const item = log(3, { acao: "ALGO_NOVO", detalhes: null });
    backend.rota("GET", "/mestre/logs", { status: 200, corpo: { itens: [item], proximoCursor: null } });
    abrir();
    expect(await screen.findByText("ALGO_NOVO")).toBeTruthy();
  });

  it("texto do log nunca é interpretado como HTML", async () => {
    const item = log(4, { detalhes: { perfil: "ADMIN", email: "<img src=x onerror=alert(1)>@x.com" }, autor: { id: "m", nome: "<b>Mau</b>" } });
    backend.rota("GET", "/mestre/logs", { status: 200, corpo: { itens: [item], proximoCursor: null } });
    const { container } = abrir();
    await screen.findByText(/Conta criada: Admin <img/);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });

  it("erro do servidor: mensagem e Tentar de novo, que busca de novo", async () => {
    let chamadas = 0;
    backend.rota("GET", "/mestre/logs", () => {
      chamadas++;
      return chamadas === 1
        ? { status: 500, corpo: { mensagem: "Erro interno. Tente novamente em instantes." } }
        : { status: 200, corpo: { itens: [log(1)], proximoCursor: null } };
    });
    abrir();
    expect(await screen.findByText("Erro interno. Tente novamente em instantes.")).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText("Conta criada: Admin a1@utfpr.edu.br")).toBeTruthy();
    expect(screen.queryByText("Erro interno. Tente novamente em instantes.")).toBeNull();
  });

  it("sem conexão: mensagem em português", async () => {
    backend.rota("GET", "/mestre/logs", new Error("rede"));
    abrir();
    expect(await screen.findByText(/Não foi possível conectar ao servidor/)).toBeTruthy();
  });

  it("carrega mais usando o cursor, sem repetir itens", async () => {
    backend.rota("GET", "/mestre/logs", (_c, q) =>
      q.get("cursor") === "c1"
        ? { status: 200, corpo: { itens: [log(2), log(1)], proximoCursor: null } } // log(1) repetido de propósito
        : { status: 200, corpo: { itens: [log(1)], proximoCursor: "c1" } },
    );
    abrir();
    await screen.findByText("Conta criada: Admin a1@utfpr.edu.br");
    await userEvent.setup().click(screen.getByRole("button", { name: "Carregar mais" }));
    await screen.findByText("Conta criada: Admin a2@utfpr.edu.br");
    expect(screen.getAllByText("Conta criada: Admin a1@utfpr.edu.br")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
    expect(screen.getByText("Você chegou ao fim dos registros.")).toBeTruthy();
  });

  it("falha ao carregar mais: avisa, mantém a lista e deixa tentar de novo", async () => {
    let falhar = true;
    backend.rota("GET", "/mestre/logs", (_c, q) => {
      if (q.get("cursor") !== "c1") return { status: 200, corpo: { itens: [log(1)], proximoCursor: "c1" } };
      return falhar
        ? { status: 500, corpo: { mensagem: "Erro interno. Tente novamente em instantes." } }
        : { status: 200, corpo: { itens: [log(2)], proximoCursor: null } };
    });
    abrir();
    await screen.findByText("Conta criada: Admin a1@utfpr.edu.br");
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: "Carregar mais" }));
    expect(await screen.findByText("Erro interno. Tente novamente em instantes.")).toBeTruthy();
    expect(screen.getByText("Conta criada: Admin a1@utfpr.edu.br")).toBeTruthy();
    falhar = false;
    await u.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText("Conta criada: Admin a2@utfpr.edu.br")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Erro interno. Tente novamente em instantes.")).toBeNull());
  });

  it("pede 30 itens por página", async () => {
    backend.rota("GET", "/mestre/logs", { status: 200, corpo: { itens: [], proximoCursor: null } });
    abrir();
    await screen.findByText("Ainda não há ações registradas.");
    expect(backend.chamadas.find((c) => c.caminho === "/mestre/logs")?.consulta).toBe("?limite=30");
  });

  it("sessão vencida (401) leva ao login", async () => {
    backend.rota("GET", "/mestre/logs", () => {
      backend.sessao.logado = false;
      backend.sessao.expirada = true;
      return { status: 401, corpo: { codigo: "SESSAO_EXPIRADA", mensagem: "Sua sessão expirou. Entre novamente." } };
    });
    abrir();
    expect(await screen.findByRole("heading", { name: "Entrar" })).toBeTruthy();
  });
});
