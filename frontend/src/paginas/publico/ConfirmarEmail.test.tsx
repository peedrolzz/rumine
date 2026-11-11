// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { criarBackendFalso, USUARIO_ATIVO, type BackendFalso } from "../../testes/backendFalso";
import { renderApp } from "../../testes/renderApp";

let backend: BackendFalso;
beforeEach(() => {
  backend = criarBackendFalso();
  backend.rota("POST", "/auth/confirmar-email", {
    status: 200,
    corpo: { mensagem: "E-mail confirmado! Seu cadastro agora aguarda a aprovação do Admin." },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const botao = () => screen.getByRole("button", { name: /^(Confirmar e-mail|Confirmando\.\.\.)$/ }) as HTMLButtonElement;
const abrir = async (rota = "/confirmar-email?token=abc123", opcoes: { estrito?: boolean } = {}) => {
  renderApp(rota, opcoes);
  await screen.findByRole("heading", { name: /Confirmar e-mail|E-mail confirmado/ });
  return userEvent.setup();
};

describe("Confirmar e-mail", () => {
  it("abre com o botão e NÃO confirma sozinho (o link é de uso único)", async () => {
    await abrir();
    expect(botao()).toBeTruthy();
    expect(backend.vezes("POST", "/auth/confirmar-email")).toBe(0);
  });

  it("não confirma sozinho nem no modo estrito do React (que roda os efeitos duas vezes)", async () => {
    await abrir("/confirmar-email?token=abc123", { estrito: true });
    expect(backend.vezes("POST", "/auth/confirmar-email")).toBe(0);
  });

  it("ao tocar no botão, envia o token do link e mostra a mensagem de sucesso", async () => {
    const u = await abrir("/confirmar-email?token=meu-token_123");
    await u.click(botao());

    expect(await screen.findByRole("heading", { name: "E-mail confirmado" })).toBeTruthy();
    expect(screen.getByText("E-mail confirmado! Seu cadastro agora aguarda a aprovação do Admin.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ir para o login" }).getAttribute("href")).toBe("/entrar");
    expect(backend.chamadas.find((c) => c.caminho === "/auth/confirmar-email")!.corpo).toEqual({ token: "meu-token_123" });
  });

  it("o token vai exatamente como veio no link, inclusive com caracteres especiais", async () => {
    const u = await abrir("/confirmar-email?token=a-b_c%2Bd");
    await u.click(botao());
    await screen.findByRole("heading", { name: "E-mail confirmado" });
    expect(backend.chamadas.find((c) => c.caminho === "/auth/confirmar-email")!.corpo).toEqual({ token: "a-b_c+d" });
  });

  it("clique duplo e novo clique com o pedido em andamento enviam um só", async () => {
    const lento = backend.adiar("POST", "/auth/confirmar-email");
    const u = await abrir();
    await u.click(botao());
    expect(botao().textContent).toBe("Confirmando...");
    expect(botao().disabled).toBe(true);
    fireEvent.click(botao());
    expect(backend.vezes("POST", "/auth/confirmar-email")).toBe(1);

    lento.resolver({ status: 200, corpo: { mensagem: "E-mail confirmado!" } });
    await screen.findByRole("heading", { name: "E-mail confirmado" });
    expect(backend.vezes("POST", "/auth/confirmar-email")).toBe(1);
  });

  describe("link inválido", () => {
    it.each(["/confirmar-email", "/confirmar-email?token=", "/confirmar-email?outro=1"])(
      "%s: avisa e leva ao cadastro, sem chamar o servidor",
      async (rota) => {
        renderApp(rota);
        expect(await screen.findByText(/Link de confirmação inválido/)).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Confirmar e-mail" })).toBeNull();
        expect(screen.getByRole("link", { name: "Fazer cadastro" }).getAttribute("href")).toBe("/cadastro");
        expect(backend.vezes("POST", "/auth/confirmar-email")).toBe(0);
      },
    );

    it("servidor recusa (expirado, usado ou inventado): mostra a mensagem dele e a saída", async () => {
      backend.rota("POST", "/auth/confirmar-email", {
        status: 400,
        corpo: { mensagem: "Este link é inválido ou expirou. Faça o cadastro novamente para receber um novo e-mail." },
      });
      const u = await abrir();
      await u.click(botao());

      expect(await screen.findByText(/Este link é inválido ou expirou/)).toBeTruthy();
      expect(screen.getByRole("link", { name: "Fazer cadastro de novo" }).getAttribute("href")).toBe("/cadastro");
      expect(screen.queryByRole("heading", { name: "E-mail confirmado" })).toBeNull();
    });

    it("depois de um erro do servidor a pessoa ainda pode tentar o botão de novo", async () => {
      backend.rota("POST", "/auth/confirmar-email", { status: 400, corpo: { mensagem: "Este link é inválido ou expirou." } });
      const u = await abrir();
      await u.click(botao());
      await screen.findByText(/inválido ou expirou/);
      expect(botao().disabled).toBe(false);
    });
  });

  it("sem conexão: mensagem em português e permite tentar de novo", async () => {
    backend.rota("POST", "/auth/confirmar-email", new TypeError("Failed to fetch"));
    const u = await abrir();
    await u.click(botao());
    expect(await screen.findByText(/Não foi possível conectar ao servidor/)).toBeTruthy();

    backend.rota("POST", "/auth/confirmar-email", { status: 200, corpo: { mensagem: "E-mail confirmado!" } });
    await u.click(botao());
    expect(await screen.findByRole("heading", { name: "E-mail confirmado" })).toBeTruthy();
    expect(backend.vezes("POST", "/auth/confirmar-email")).toBe(2);
  });

  it("abre normalmente mesmo com outra conta logada neste aparelho (não redireciona)", async () => {
    backend.sessao.logado = true;
    backend.sessao.usuario = USUARIO_ATIVO;
    const u = await abrir();
    expect(botao()).toBeTruthy();
    await u.click(botao());
    expect(await screen.findByRole("heading", { name: "E-mail confirmado" })).toBeTruthy();
  });
});
