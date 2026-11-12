// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { criarBackendFalso, type BackendFalso } from "../../testes/backendFalso";
import { renderApp } from "../../testes/renderApp";

let backend: BackendFalso;

beforeEach(() => {
  backend = criarBackendFalso({ logado: true });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const abrir = async () => {
  renderApp("/");
  await screen.findByRole("heading", { name: "Início" });
  await waitFor(() => expect(screen.queryByRole("status", { name: "Carregando saldo" })).toBeNull());
  return userEvent.setup();
};
const saldos = () => backend.vezes("GET", "/carteira");
/** Simula o app voltando a ficar visível (outra aba, tela desbloqueada). */
const voltarParaOApp = () => {
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  fireEvent(document, new Event("visibilitychange"));
};

describe("saldo na tela inicial", () => {
  it("mostra o saldo em reais no formato brasileiro e a data da atualização", async () => {
    backend.sessao.carteira = { saldoCentavos: 123450, atualizadoEm: "2026-11-10T15:30:00.000Z" };
    await abrir();
    expect(await screen.findByText("R$ 1.234,50")).toBeTruthy();
    expect(screen.getByText(/Atualizado em 10\/11\/2026 \d{2}:\d{2}/)).toBeTruthy();
    expect(screen.queryByText(/saldo está zerado/)).toBeNull();
  });

  it("mostra carregando enquanto espera", async () => {
    const lenta = backend.adiar("GET", "/carteira");
    renderApp("/");
    expect(await screen.findByRole("status", { name: "Carregando saldo" })).toBeTruthy();
    lenta.resolver({ status: 200, corpo: { saldoCentavos: 500, atualizadoEm: null } });
    expect(await screen.findByText("R$ 5,00")).toBeTruthy();
    expect(screen.queryByRole("status", { name: "Carregando saldo" })).toBeNull();
  });

  it("saldo zero: R$ 0,00, aviso para recarregar e o atalho", async () => {
    backend.sessao.carteira = { saldoCentavos: 0, atualizadoEm: null };
    await abrir();
    expect(await screen.findByText("R$ 0,00")).toBeTruthy();
    expect(screen.getByText("Seu saldo está zerado. Recarregue para entrar no RU.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Recarregar" }).getAttribute("href")).toBe("/recarga");
  });

  it("com saldo, o atalho de recarga continua disponível", async () => {
    await abrir();
    expect(screen.getByRole("link", { name: "Recarregar" }).getAttribute("href")).toBe("/recarga");
  });

  it("sem data de atualização (conta sem carteira), não mostra 'Atualizado em'", async () => {
    backend.sessao.carteira = { saldoCentavos: 0, atualizadoEm: null };
    await abrir();
    expect(screen.queryByText(/Atualizado em/)).toBeNull();
  });

  it.each([
    [5, "R$ 0,05"],
    [99, "R$ 0,99"],
    [100, "R$ 1,00"],
    [999999, "R$ 9.999,99"],
    [100000000, "R$ 1.000.000,00"],
  ])("%d centavos aparece como %s", async (centavos, texto) => {
    backend.sessao.carteira = { saldoCentavos: centavos, atualizadoEm: null };
    await abrir();
    expect(await screen.findByText(texto)).toBeTruthy();
  });
});

describe("erros", () => {
  it("falha do servidor: mensagem e Tentar de novo, que busca de novo", async () => {
    let n = 0;
    backend.rota(
      "GET",
      "/carteira",
      () => (++n === 1 ? { status: 500, corpo: { mensagem: "Erro interno. Tente novamente em instantes." } } : { status: 200, corpo: { saldoCentavos: 700, atualizadoEm: null } }),
      { protegida: true },
    );
    renderApp("/");
    expect(await screen.findByText("Erro interno. Tente novamente em instantes.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Recarregar" })).toBeNull(); // sem saldo, sem tela "meio pronta"
    await userEvent.setup().click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText("R$ 7,00")).toBeTruthy();
    expect(screen.queryByText("Erro interno. Tente novamente em instantes.")).toBeNull();
  });

  it("sem conexão: mensagem em português", async () => {
    backend.rota("GET", "/carteira", new Error("rede"), { protegida: true });
    renderApp("/");
    expect(await screen.findByText(/Não foi possível conectar ao servidor/)).toBeTruthy();
  });

  it("conta em análise (403 do servidor): mostra a mensagem dele", async () => {
    backend.rota(
      "GET",
      "/carteira",
      { status: 403, corpo: { codigo: "CADASTRO_PENDENTE", mensagem: "Seu cadastro está em análise. Aguarde a aprovação do Admin." } },
      { protegida: true },
    );
    renderApp("/");
    expect(await screen.findByText("Seu cadastro está em análise. Aguarde a aprovação do Admin.")).toBeTruthy();
  });

  it("sessão vencida (401): vai para o login", async () => {
    backend.rota(
      "GET",
      "/carteira",
      () => {
        backend.sessao.logado = false;
        backend.sessao.expirada = true;
        return { status: 401, corpo: { codigo: "SESSAO_EXPIRADA", mensagem: "Sua sessão expirou. Entre novamente." } };
      },
      { protegida: true },
    );
    renderApp("/");
    expect(await screen.findByRole("heading", { name: "Entrar" })).toBeTruthy();
  });
});

describe("saldo atualizado depois de recarregar ou consumir", () => {
  it("o botão Atualizar saldo busca de novo e troca o valor sem mostrar o carregando", async () => {
    const u = await abrir();
    expect(await screen.findByText("R$ 12,50")).toBeTruthy();
    backend.sessao.carteira = { saldoCentavos: 3250, atualizadoEm: "2026-11-12T13:00:00.000Z" }; // recarga de R$ 20,00
    await u.click(screen.getByRole("button", { name: "Atualizar saldo" }));
    expect(await screen.findByText("R$ 32,50")).toBeTruthy();
    expect(screen.queryByText("R$ 12,50")).toBeNull();
    expect(screen.queryByRole("status", { name: "Carregando saldo" })).toBeNull();
    expect(saldos()).toBe(2);
  });

  it("ao voltar para o app, busca o saldo sozinho (ex.: depois de consumir uma refeição)", async () => {
    await abrir();
    await screen.findByText("R$ 12,50");
    backend.sessao.carteira = { saldoCentavos: 900, atualizadoEm: "2026-11-12T14:00:00.000Z" }; // refeição de R$ 3,50
    voltarParaOApp();
    expect(await screen.findByText("R$ 9,00")).toBeTruthy();
  });

  it("só atualiza quando a tela fica visível, não quando fica escondida", async () => {
    await abrir();
    await screen.findByText("R$ 12,50");
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    fireEvent(document, new Event("visibilitychange"));
    expect(saldos()).toBe(1);
    voltarParaOApp(); // restaura o estado visível para os outros testes
    await waitFor(() => expect(saldos()).toBe(2));
  });

  it("durante a atualização o saldo antigo continua na tela e o botão trava", async () => {
    const u = await abrir();
    await screen.findByText("R$ 12,50");
    const lenta = backend.adiar("GET", "/carteira");
    await u.click(screen.getByRole("button", { name: "Atualizar saldo" }));
    const botao = (await screen.findByRole("button", { name: "Atualizando..." })) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    expect(screen.getByText("R$ 12,50")).toBeTruthy();
    lenta.resolver({ status: 200, corpo: { saldoCentavos: 2000, atualizadoEm: null } });
    expect(await screen.findByText("R$ 20,00")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Atualizar saldo" })).toBeTruthy();
  });

  it("falha ao atualizar: mantém o saldo que já tinha e avisa que não atualizou", async () => {
    const u = await abrir();
    await screen.findByText("R$ 12,50");
    backend.rota("GET", "/carteira", new Error("rede"), { protegida: true });
    await u.click(screen.getByRole("button", { name: "Atualizar saldo" }));
    expect(await screen.findByText(/Não foi possível atualizar o saldo: Não foi possível conectar/)).toBeTruthy();
    expect(screen.getByText("R$ 12,50")).toBeTruthy();
    // Voltando a funcionar, o aviso some.
    backend.rota("GET", "/carteira", { status: 200, corpo: { saldoCentavos: 1300, atualizadoEm: null } }, { protegida: true });
    await u.click(screen.getByRole("button", { name: "Atualizar saldo" }));
    expect(await screen.findByText("R$ 13,00")).toBeTruthy();
    expect(screen.queryByText(/Não foi possível atualizar o saldo/)).toBeNull();
  });

  it("resposta atrasada de uma consulta antiga não sobrescreve a mais nova", async () => {
    const u = await abrir();
    await screen.findByText("R$ 12,50");
    const antiga = backend.adiar("GET", "/carteira");
    await u.click(screen.getByRole("button", { name: "Atualizar saldo" })); // consulta 1 (fica pendente)
    backend.rota("GET", "/carteira", { status: 200, corpo: { saldoCentavos: 5000, atualizadoEm: null } }, { protegida: true });
    voltarParaOApp(); // consulta 2 (responde logo)
    expect(await screen.findByText("R$ 50,00")).toBeTruthy();
    antiga.resolver({ status: 200, corpo: { saldoCentavos: 100, atualizadoEm: null } });
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getByText("R$ 50,00")).toBeTruthy();
    expect(screen.queryByText("R$ 1,00")).toBeNull();
  });

  it("depois de sair da tela, o app não escuta mais o retorno à aba", async () => {
    const { unmount } = (await (async () => {
      const r = renderApp("/");
      await screen.findByText("R$ 12,50");
      return r;
    })());
    unmount();
    const antes = saldos();
    voltarParaOApp();
    await new Promise((r) => setTimeout(r, 30));
    expect(saldos()).toBe(antes);
  });
});

describe("acesso", () => {
  it.each(["OPERADOR", "ADMIN", "MESTRE"] as const)("%s não vê o saldo: vai para a tela dele", async (perfil) => {
    backend.sessao.usuario = { ...backend.sessao.usuario, perfil };
    renderApp("/");
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Início" })).toBeNull());
    expect(saldos()).toBe(0);
  });
});
