// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { criarBackendFalso, SENHA, USUARIO_ATIVO, type BackendFalso } from "../testes/backendFalso";
import { renderApp } from "../testes/renderApp";
import type { Perfil } from "./perfis";

// A câmera não existe no jsdom: o leitor de QR vira um espaço vazio nestes testes de navegação.
vi.mock("@yudiel/react-qr-scanner", () => ({ Scanner: () => null }));

let backend: BackendFalso;

const comoPerfil = (perfil: Perfil) => {
  backend.sessao.usuario = { ...USUARIO_ATIVO, perfil };
  backend.sessao.logado = true;
};
const titulo = (nome: string | RegExp) => screen.findByRole("heading", { name: nome });
const abasDoMenu = () =>
  within(screen.getByRole("navigation", { name: "Navegação principal" }))
    .getAllByRole("link")
    .map((a) => [a.textContent, a.getAttribute("href")]);

beforeEach(() => {
  backend = criarBackendFalso();
  backend.rota("GET", "/historico", { status: 200, corpo: { itens: [], proximoCursor: null } }, { protegida: true });
  backend.rota("GET", "/mestre/logs", { status: 200, corpo: { itens: [], proximoCursor: null } }, { protegida: true });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("menu por perfil", () => {
  it("Usuário: Início, Recarga, Histórico, Cardápio e Perfil", async () => {
    comoPerfil("USUARIO");
    renderApp("/");
    await titulo("Início");
    expect(abasDoMenu()).toEqual([
      ["Início", "/"],
      ["Recarga", "/recarga"],
      ["Histórico", "/historico"],
      ["Cardápio", "/cardapio"],
      ["Perfil", "/perfil"],
    ]);
  });

  it("Operador: só a leitura do QR Code e o Perfil", async () => {
    comoPerfil("OPERADOR");
    renderApp("/");
    await titulo("Ler QR Code");
    expect(abasDoMenu()).toEqual([
      ["Ler QR", "/operador/leitura"],
      ["Perfil", "/perfil"],
    ]);
  });

  it("Admin: cardápio, cadastros e histórico geral", async () => {
    comoPerfil("ADMIN");
    renderApp("/");
    await titulo(/Cardápio do dia/i);
    expect(abasDoMenu()).toEqual([
      ["Cardápio", "/admin/cardapio"],
      ["Cadastros", "/admin/cadastros"],
      ["Histórico", "/admin/historico"],
      ["Perfil", "/perfil"],
    ]);
  });

  it("Mestre: contas e logs", async () => {
    comoPerfil("MESTRE");
    renderApp("/");
    await titulo("Logs");
    expect(abasDoMenu()).toEqual([
      ["Contas", "/mestre/contas"],
      ["Logs", "/mestre/logs"],
      ["Perfil", "/perfil"],
    ]);
  });
});

describe("a raiz leva cada perfil à sua tela inicial", () => {
  it.each([
    ["OPERADOR", "Ler QR Code"],
    ["MESTRE", "Logs"],
  ] as const)("%s cai em %s", async (perfil, tela) => {
    comoPerfil(perfil);
    renderApp("/");
    expect(await titulo(tela)).toBeTruthy();
  });
});

// Telas que cada perfil NÃO pode abrir: volta para a inicial dele, com aviso.
const PROIBIDAS: [Perfil, string, string][] = [
  ["USUARIO", "/admin/cardapio", "Início"],
  ["USUARIO", "/admin/cadastros", "Início"],
  ["USUARIO", "/mestre/logs", "Início"],
  ["USUARIO", "/mestre/contas", "Início"],
  ["USUARIO", "/operador/leitura", "Início"],
  ["OPERADOR", "/historico", "Ler QR Code"],
  ["OPERADOR", "/cardapio", "Ler QR Code"],
  ["OPERADOR", "/recarga", "Ler QR Code"],
  ["OPERADOR", "/admin/cardapio", "Ler QR Code"],
  ["OPERADOR", "/mestre/logs", "Ler QR Code"],
  ["ADMIN", "/mestre/logs", "Cardápio do dia"],
  ["ADMIN", "/mestre/contas", "Cardápio do dia"],
  ["ADMIN", "/historico", "Cardápio do dia"],
  ["ADMIN", "/operador/leitura", "Cardápio do dia"],
  ["MESTRE", "/admin/cardapio", "Logs"],
  ["MESTRE", "/historico", "Logs"],
  ["MESTRE", "/operador/leitura", "Logs"],
];

describe("guarda por perfil", () => {
  it.each(PROIBIDAS)("%s abrindo %s volta para a tela dele, com aviso", async (perfil, rota, destino) => {
    comoPerfil(perfil);
    renderApp(rota);
    expect(await titulo(new RegExp(destino, "i"))).toBeTruthy();
    expect(screen.getByText("Você não tem acesso a essa tela.")).toBeTruthy();
  });

  it("a tela proibida nunca chega a pedir dados ao servidor", async () => {
    comoPerfil("USUARIO");
    renderApp("/mestre/logs");
    await titulo("Início");
    expect(backend.vezes("GET", "/mestre/logs")).toBe(0);
  });

  it("o aviso pode ser fechado", async () => {
    comoPerfil("USUARIO");
    renderApp("/mestre/logs");
    await titulo("Início");
    const alerta = screen.getByText("Você não tem acesso a essa tela.").closest<HTMLElement>('[role="alert"]')!;
    await userEvent.setup().click(within(alerta).getByRole("button", { name: /fechar|close/i }));
    expect(screen.queryByText("Você não tem acesso a essa tela.")).toBeNull();
  });

  it("sem aviso quando a pessoa abre a própria tela", async () => {
    comoPerfil("MESTRE");
    renderApp("/mestre/logs");
    await titulo("Logs");
    expect(screen.queryByText("Você não tem acesso a essa tela.")).toBeNull();
  });

  it("o Perfil abre para todos os perfis", async () => {
    for (const perfil of ["USUARIO", "OPERADOR", "ADMIN", "MESTRE"] as const) {
      backend = criarBackendFalso();
      comoPerfil(perfil);
      renderApp("/perfil");
      expect(await titulo("Perfil")).toBeTruthy();
      expect(screen.queryByText("Você não tem acesso a essa tela.")).toBeNull();
      cleanup();
    }
  });

  it("o Perfil mostra o perfil de acesso", async () => {
    comoPerfil("OPERADOR");
    renderApp("/perfil");
    await titulo("Perfil");
    expect(screen.getByText("Operador")).toBeTruthy();
  });

  it("conta pendente de aprovação continua indo para o status do cadastro, qualquer que seja a rota", async () => {
    backend.sessao.usuario = { ...USUARIO_ATIVO, perfil: "ADMIN", status: "PENDENTE_APROVACAO" };
    backend.sessao.logado = true;
    renderApp("/admin/cardapio");
    expect(await titulo(/em análise/i)).toBeTruthy();
  });
});

describe("login de cada perfil", () => {
  it.each([
    ["OPERADOR", "Ler QR Code"],
    ["MESTRE", "Logs"],
  ] as const)("%s entra pela raiz e cai na tela dele", async (perfil, tela) => {
    backend.sessao.usuario = { ...USUARIO_ATIVO, perfil };
    renderApp("/");
    const u = userEvent.setup();
    await titulo("Entrar");
    await u.type(screen.getByLabelText("E-mail"), USUARIO_ATIVO.email);
    await u.type(screen.getByLabelText("Senha"), SENHA);
    await u.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await titulo(tela)).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Entrar" })).toBeNull());
  });
});
