// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { criarBackendFalso, SENHA, USUARIO_ATIVO, type BackendFalso } from "../../testes/backendFalso";
import { renderApp } from "../../testes/renderApp";

let backend: BackendFalso;
beforeEach(() => {
  backend = criarBackendFalso();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const abrir = async () => {
  renderApp("/entrar");
  await screen.findByRole("heading", { name: "Entrar" });
  return userEvent.setup();
};
const campoEmail = () => screen.getByLabelText("E-mail") as HTMLInputElement;
const campoSenha = () => screen.getByLabelText("Senha") as HTMLInputElement;
const botaoEntrar = () => screen.getByRole("button", { name: /^Entr(ar|ando\.\.\.)$/ }) as HTMLButtonElement;
const preencher = async (u: ReturnType<typeof userEvent.setup>, email = USUARIO_ATIVO.email, senha = SENHA) => {
  await u.type(campoEmail(), email);
  await u.type(campoSenha(), senha);
};

describe("Entrar (T01)", () => {
  it("mostra título, e-mail, senha, botão Entrar e o link Criar conta", async () => {
    await abrir();
    expect(screen.getByText("RU Mine")).toBeTruthy();
    expect(campoEmail()).toBeTruthy();
    expect(campoSenha()).toBeTruthy();
    expect(botaoEntrar()).toBeTruthy();
    expect(screen.getByRole("link", { name: "Criar conta" }).getAttribute("href")).toBe("/cadastro");
  });

  it("os campos ajudam o gerenciador de senhas e o teclado do celular", async () => {
    await abrir();
    expect(campoEmail().type).toBe("email");
    expect(campoEmail().getAttribute("autocomplete")).toBe("username");
    expect(campoEmail().getAttribute("inputmode")).toBe("email");
    expect(campoSenha().getAttribute("autocomplete")).toBe("current-password");
  });

  it("não mostra aviso de sessão expirada em uma visita comum", async () => {
    await abrir();
    expect(screen.queryByText(/sessão expirou/)).toBeNull();
  });

  it("entra com e-mail e senha corretos e vai para o início", async () => {
    const u = await abrir();
    await preencher(u);
    await u.click(botaoEntrar());
    expect(await screen.findByRole("heading", { name: "Início" })).toBeTruthy();
    expect(backend.sessao.logado).toBe(true);
  });

  it("envia o e-mail sem espaços nas pontas e a senha exatamente como digitada", async () => {
    const u = await abrir();
    await u.type(campoEmail(), "  maria@alunos.utfpr.edu.br  ");
    await u.type(campoSenha(), SENHA);
    await u.click(botaoEntrar());
    await waitFor(() => expect(backend.vezes("POST", "/auth/login")).toBe(1));
    expect(backend.chamadas.find((c) => c.caminho === "/auth/login")!.corpo).toEqual({ email: "maria@alunos.utfpr.edu.br", senha: SENHA });
  });

  it("a tecla Enter envia o formulário", async () => {
    const u = await abrir();
    await u.type(campoEmail(), USUARIO_ATIVO.email);
    await u.type(campoSenha(), `${SENHA}{Enter}`);
    expect(await screen.findByRole("heading", { name: "Início" })).toBeTruthy();
  });

  describe("erros", () => {
    it.each([
      ["e-mail e senha em branco", "", ""],
      ["só o e-mail", "maria@alunos.utfpr.edu.br", ""],
      ["só a senha", "", "Senha@123"],
      ["e-mail só com espaços", "   ", "Senha@123"],
    ])("%s: avisa e nem chama o servidor", async (_nome, email, senha) => {
      const u = await abrir();
      if (email) await u.type(campoEmail(), email);
      if (senha) await u.type(campoSenha(), senha);
      await u.click(botaoEntrar());
      expect(await screen.findByText("Informe e-mail e senha.")).toBeTruthy();
      expect(backend.vezes("POST", "/auth/login")).toBe(0);
    });

    it("credenciais erradas: mostra a mensagem genérica do servidor e mantém os dados digitados", async () => {
      const u = await abrir();
      await preencher(u, USUARIO_ATIVO.email, "Errada@123");
      await u.click(botaoEntrar());
      expect(await screen.findByText("E-mail ou senha incorretos.")).toBeTruthy();
      expect(campoEmail().value).toBe(USUARIO_ATIVO.email);
      expect(campoSenha().value).toBe("Errada@123");
      expect(screen.getByRole("heading", { name: "Entrar" })).toBeTruthy(); // continua no login
      expect(botaoEntrar().disabled).toBe(false);
    });

    it("e-mail que não existe recebe exatamente a mesma mensagem (não revela qual campo errou)", async () => {
      const u = await abrir();
      await preencher(u, "ninguem@alunos.utfpr.edu.br", SENHA);
      await u.click(botaoEntrar());
      expect(await screen.findByText("E-mail ou senha incorretos.")).toBeTruthy();
    });

    it.each([
      [403, "Confirme seu e-mail antes de entrar. Procure o link na sua caixa de entrada."],
      [403, "Sua conta está desativada. Fale com o RU."],
      [429, "Muitas tentativas de entrada. Aguarde alguns minutos e tente de novo."],
      [500, "Erro interno. Tente novamente em instantes."],
    ])("resposta %i do servidor mostra a mensagem dele", async (status, mensagem) => {
      backend.rota("POST", "/auth/login", { status, corpo: { mensagem } });
      const u = await abrir();
      await preencher(u);
      await u.click(botaoEntrar());
      expect(await screen.findByText(mensagem)).toBeTruthy();
    });

    it("sem conexão: mensagem em português, sem texto técnico", async () => {
      backend.rota("POST", "/auth/login", new TypeError("Failed to fetch"));
      const u = await abrir();
      await preencher(u);
      await u.click(botaoEntrar());
      expect(await screen.findByText(/Não foi possível conectar ao servidor/)).toBeTruthy();
      expect(screen.queryByText(/Failed to fetch/)).toBeNull();
    });

    it("o erro some quando a pessoa tenta de novo e acerta", async () => {
      const u = await abrir();
      await preencher(u, USUARIO_ATIVO.email, "Errada@123");
      await u.click(botaoEntrar());
      await screen.findByText("E-mail ou senha incorretos.");
      await u.clear(campoSenha());
      await u.type(campoSenha(), SENHA);
      await u.click(botaoEntrar());
      expect(await screen.findByRole("heading", { name: "Início" })).toBeTruthy();
    });
  });

  describe("envio", () => {
    it("o botão fica desabilitado com 'Entrando...' e o campos travados enquanto envia", async () => {
      const lento = backend.adiar("POST", "/auth/login");
      const u = await abrir();
      await preencher(u);
      await u.click(botaoEntrar());

      expect(botaoEntrar().textContent).toBe("Entrando...");
      expect(botaoEntrar().disabled).toBe(true);
      expect(campoEmail().disabled).toBe(true);
      expect(campoSenha().disabled).toBe(true);

      lento.resolver({ status: 200, corpo: { usuario: USUARIO_ATIVO } });
      backend.sessao.logado = true;
      expect(await screen.findByRole("heading", { name: "Início" })).toBeTruthy();
    });

    it("Enter repetido e novo envio com o pedido em andamento mandam um pedido só", async () => {
      const lento = backend.adiar("POST", "/auth/login");
      const u = await abrir();
      await u.type(campoEmail(), USUARIO_ATIVO.email);
      await u.type(campoSenha(), `${SENHA}{Enter}{Enter}`);
      fireEvent.submit(botaoEntrar().closest("form")!); // o botão já está travado: força outro envio
      expect(backend.vezes("POST", "/auth/login")).toBe(1);
      lento.resolver({ status: 401, corpo: { mensagem: "E-mail ou senha incorretos." } });
      await screen.findByText("E-mail ou senha incorretos.");
    });
  });

  describe("mostrar e ocultar a senha", () => {
    it("começa oculta; o botão alterna e informa o estado", async () => {
      const u = await abrir();
      await u.type(campoSenha(), "segredo");
      expect(campoSenha().type).toBe("password");

      const mostrar = screen.getByRole("button", { name: "Mostrar senha" });
      expect(mostrar.getAttribute("aria-pressed")).toBe("false");
      await u.click(mostrar);
      expect(campoSenha().type).toBe("text");
      expect(campoSenha().value).toBe("segredo");

      const ocultar = screen.getByRole("button", { name: "Ocultar senha" });
      expect(ocultar.getAttribute("aria-pressed")).toBe("true");
      await u.click(ocultar);
      expect(campoSenha().type).toBe("password");
    });

    it("o botão não envia o formulário", async () => {
      const u = await abrir();
      await u.click(screen.getByRole("button", { name: "Mostrar senha" }));
      expect(backend.vezes("POST", "/auth/login")).toBe(0);
    });

    it("o botão tem alvo de toque de 44 px", async () => {
      await abrir();
      const b = screen.getByRole("button", { name: "Mostrar senha" });
      expect(getComputedStyle(b).width).toBe("44px");
      expect(getComputedStyle(b).height).toBe("44px");
    });
  });

  it("o link Criar conta leva ao cadastro", async () => {
    const u = await abrir();
    await u.click(screen.getByRole("link", { name: "Criar conta" }));
    expect(await screen.findByRole("heading", { name: "Criar conta" })).toBeTruthy();
  });
});
