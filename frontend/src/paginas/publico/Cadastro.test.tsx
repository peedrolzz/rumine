// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { criarBackendFalso, type BackendFalso } from "../../testes/backendFalso";
import { renderApp } from "../../testes/renderApp";

let backend: BackendFalso;
beforeEach(() => {
  backend = criarBackendFalso();
  backend.rota("POST", "/auth/cadastro", {
    status: 201,
    corpo: { mensagem: "Enviamos um e-mail para confirmar seu cadastro. Abra o link da mensagem para continuar." },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const abrir = async () => {
  renderApp("/cadastro");
  await screen.findByRole("heading", { name: "Criar conta" });
  return userEvent.setup();
};
const campoNome = () => screen.getByLabelText(/^Nome completo/) as HTMLInputElement;
const campoEmail = () => screen.getByLabelText(/^E-mail institucional/) as HTMLInputElement;
const campoSenha = () => screen.getByLabelText(/^Senha/, { selector: "input" }) as HTMLInputElement;
const botao = () => screen.getByRole("button", { name: /^(Continuar|Enviando\.\.\.)$/ }) as HTMLButtonElement;
const regras = () =>
  within(screen.getByRole("list", { name: "Regras da senha" }))
    .getAllByRole("listitem")
    .map((l) => (l.textContent!.includes("(cumprida)") ? "ok" : "falta"));

const VALIDO = { nome: "Maria da Silva", email: "maria@alunos.utfpr.edu.br", senha: "Senha@123" };
const preencher = async (u: ReturnType<typeof userEvent.setup>, dados = VALIDO) => {
  await u.type(campoNome(), dados.nome);
  await u.type(campoEmail(), dados.email);
  await u.type(campoSenha(), dados.senha);
};

describe("Cadastro (T02)", () => {
  it("mostra os três campos, as regras da senha e os botões", async () => {
    await abrir();
    expect(campoNome()).toBeTruthy();
    expect(campoEmail()).toBeTruthy();
    expect(campoSenha()).toBeTruthy();
    expect(regras()).toEqual(["falta", "falta", "falta"]);
    expect(botao().textContent).toBe("Continuar");
    expect(screen.getByRole("link", { name: "Já tenho conta" }).getAttribute("href")).toBe("/entrar");
  });

  it("orienta sobre o e-mail institucional antes de errar", async () => {
    await abrir();
    expect(screen.getByText("Use seu e-mail @alunos.utfpr.edu.br")).toBeTruthy();
  });

  it("os campos ajudam o gerenciador de senhas e o teclado do celular", async () => {
    await abrir();
    expect(campoNome().getAttribute("autocomplete")).toBe("name");
    expect(campoEmail().getAttribute("autocomplete")).toBe("email");
    expect(campoEmail().getAttribute("inputmode")).toBe("email");
    expect(campoSenha().getAttribute("autocomplete")).toBe("new-password");
    expect(campoSenha().type).toBe("password");
  });

  describe("regras da senha ao vivo", () => {
    it.each([
      ["a", ["falta", "falta", "falta"]],
      ["abcdefgh", ["ok", "falta", "falta"]],
      ["abc1", ["falta", "ok", "falta"]],
      ["ab!", ["falta", "falta", "ok"]],
      ["abcdefg1", ["ok", "ok", "falta"]],
      ["Senha@123", ["ok", "ok", "ok"]],
    ])("digitando %j", async (senha, esperado) => {
      const u = await abrir();
      await u.type(campoSenha(), senha);
      expect(regras()).toEqual(esperado);
    });

    it("volta a pendente se a pessoa apagar", async () => {
      const u = await abrir();
      await u.type(campoSenha(), "Senha@123");
      expect(regras()).toEqual(["ok", "ok", "ok"]);
      await u.clear(campoSenha());
      expect(regras()).toEqual(["falta", "falta", "falta"]);
    });

    it("não aparece erro vermelho só por estar digitando (o aviso vem ao sair do campo)", async () => {
      const u = await abrir();
      await u.type(campoSenha(), "abc");
      expect(screen.queryByText(/A senha precisa ter/)).toBeNull();
    });
  });

  describe("conferência antes de enviar", () => {
    it("enviar em branco mostra o erro de cada campo e não chama o servidor", async () => {
      const u = await abrir();
      await u.click(botao());
      expect(await screen.findByText("Informe seu nome completo.")).toBeTruthy();
      expect(screen.getByText("Informe seu e-mail.")).toBeTruthy();
      expect(screen.getByText("A senha precisa ter pelo menos 8 caracteres.")).toBeTruthy();
      expect(backend.vezes("POST", "/auth/cadastro")).toBe(0);
      expect(campoNome().getAttribute("aria-invalid")).toBe("true");
    });

    it("sair de um campo mostra só o erro dele", async () => {
      const u = await abrir();
      await u.click(campoNome());
      await u.tab(); // sai do nome sem preencher
      expect(await screen.findByText("Informe seu nome completo.")).toBeTruthy();
      expect(screen.queryByText("Informe seu e-mail.")).toBeNull();
    });

    it("e-mail com formato errado", async () => {
      const u = await abrir();
      await u.type(campoEmail(), "maria@");
      await u.tab();
      expect(await screen.findByText("Informe um e-mail válido.")).toBeTruthy();
    });

    it.each([
      ["curta1!", "A senha precisa ter pelo menos 8 caracteres."],
      ["semnumero!", "A senha precisa ter pelo menos um número."],
      ["semespecial1", "A senha precisa ter pelo menos um caractere especial (por exemplo: ! @ # $ %)."],
    ])("senha fraca %j: indica a regra ao tentar enviar", async (senha, mensagem) => {
      const u = await abrir();
      await preencher(u, { ...VALIDO, senha });
      await u.click(botao());
      expect(await screen.findByText(mensagem)).toBeTruthy();
      expect(backend.vezes("POST", "/auth/cadastro")).toBe(0);
    });

    it("o erro do campo some quando a pessoa corrige", async () => {
      const u = await abrir();
      await u.type(campoEmail(), "maria@");
      await u.tab();
      await screen.findByText("Informe um e-mail válido.");
      await u.type(campoEmail(), "alunos.utfpr.edu.br");
      expect(screen.queryByText("Informe um e-mail válido.")).toBeNull();
    });
  });

  describe("envio", () => {
    it("envia nome, e-mail e senha; mostra 'Verifique seu e-mail' com o endereço", async () => {
      const u = await abrir();
      await preencher(u);
      await u.click(botao());

      expect(await screen.findByRole("heading", { name: "Verifique seu e-mail" })).toBeTruthy();
      expect(screen.getByText("maria@alunos.utfpr.edu.br")).toBeTruthy();
      expect(screen.getByRole("link", { name: "Ir para o login" }).getAttribute("href")).toBe("/entrar");
      expect(screen.queryByLabelText(/^Senha/)).toBeNull(); // o formulário some
      expect(backend.chamadas.find((c) => c.caminho === "/auth/cadastro")!.corpo).toEqual(VALIDO);
    });

    it("apara nome e e-mail, mas não mexe na senha", async () => {
      const u = await abrir();
      await u.type(campoNome(), "  Maria da Silva  ");
      await u.type(campoEmail(), "  maria@alunos.utfpr.edu.br ");
      await u.type(campoSenha(), "  Senha@123 ");
      await u.click(botao());
      await screen.findByRole("heading", { name: "Verifique seu e-mail" });
      expect(backend.chamadas.find((c) => c.caminho === "/auth/cadastro")!.corpo).toEqual({
        nome: "Maria da Silva",
        email: "maria@alunos.utfpr.edu.br",
        senha: "  Senha@123 ",
      });
    });

    it("mostra o e-mail em minúsculas na confirmação", async () => {
      const u = await abrir();
      await preencher(u, { ...VALIDO, email: "Maria@ALUNOS.utfpr.edu.br" });
      await u.click(botao());
      expect(await screen.findByText("maria@alunos.utfpr.edu.br")).toBeTruthy();
    });

    it("orienta quem não recebeu o e-mail", async () => {
      const u = await abrir();
      await preencher(u);
      await u.click(botao());
      expect(await screen.findByText(/Não chegou\?/)).toBeTruthy();
    });

    it("o botão fica desabilitado com 'Enviando...' e os campos travados; envio repetido vale um só", async () => {
      const lento = backend.adiar("POST", "/auth/cadastro");
      const u = await abrir();
      await preencher(u);
      await u.click(botao());

      expect(botao().textContent).toBe("Enviando...");
      expect(botao().disabled).toBe(true);
      expect(campoNome().disabled).toBe(true);
      fireEvent.submit(botao().closest("form")!);
      expect(backend.vezes("POST", "/auth/cadastro")).toBe(1);

      lento.resolver({ status: 201, corpo: { mensagem: "ok" } });
      expect(await screen.findByRole("heading", { name: "Verifique seu e-mail" })).toBeTruthy();
    });
  });

  describe("erros do servidor", () => {
    it("domínio fora do institucional: mensagem do servidor no campo e-mail, que some ao editar", async () => {
      backend.rota("POST", "/auth/cadastro", {
        status: 400,
        corpo: { campo: "email", mensagem: "Use seu e-mail institucional (@alunos.utfpr.edu.br)." },
      });
      const u = await abrir();
      await preencher(u, { ...VALIDO, email: "maria@gmail.com" });
      await u.click(botao());

      expect(await screen.findByText("Use seu e-mail institucional (@alunos.utfpr.edu.br).")).toBeTruthy();
      expect(campoEmail().getAttribute("aria-invalid")).toBe("true");
      expect(campoNome().getAttribute("aria-invalid")).toBe("false");
      expect(campoNome().value).toBe(VALIDO.nome); // não perde o que foi digitado

      await u.type(campoEmail(), "x");
      expect(screen.queryByText("Use seu e-mail institucional (@alunos.utfpr.edu.br).")).toBeNull();
    });

    it("erro de nome e de senha vindos do servidor também vão para o campo certo", async () => {
      backend.rota("POST", "/auth/cadastro", { status: 400, corpo: { campo: "senha", mensagem: "A senha precisa ter pelo menos um número." } });
      const u = await abrir();
      await preencher(u);
      await u.click(botao());
      await screen.findByText("A senha precisa ter pelo menos um número.");
      expect(campoSenha().getAttribute("aria-invalid")).toBe("true");
    });

    it("erro sem campo (ex.: servidor) aparece como aviso geral", async () => {
      backend.rota("POST", "/auth/cadastro", { status: 500, corpo: { mensagem: "Erro interno. Tente novamente em instantes." } });
      const u = await abrir();
      await preencher(u);
      await u.click(botao());
      expect(await screen.findByText("Erro interno. Tente novamente em instantes.")).toBeTruthy();
      expect(botao().disabled).toBe(false); // pode tentar de novo
    });

    it("um campo desconhecido no erro não quebra a tela: vira aviso geral", async () => {
      backend.rota("POST", "/auth/cadastro", { status: 400, corpo: { campo: "perfil", mensagem: "Campo estranho." } });
      const u = await abrir();
      await preencher(u);
      await u.click(botao());
      expect(await screen.findByText("Campo estranho.")).toBeTruthy();
    });

    it("sem conexão: mensagem em português e os dados continuam lá", async () => {
      backend.rota("POST", "/auth/cadastro", new TypeError("Failed to fetch"));
      const u = await abrir();
      await preencher(u);
      await u.click(botao());
      expect(await screen.findByText(/Não foi possível conectar ao servidor/)).toBeTruthy();
      expect(campoNome().value).toBe(VALIDO.nome);
      expect(campoSenha().value).toBe(VALIDO.senha);
    });

    it("o aviso geral some quando a pessoa volta a digitar", async () => {
      backend.rota("POST", "/auth/cadastro", { status: 500, corpo: { mensagem: "Erro interno. Tente novamente em instantes." } });
      const u = await abrir();
      await preencher(u);
      await u.click(botao());
      await screen.findByText("Erro interno. Tente novamente em instantes.");
      await u.type(campoNome(), "x");
      expect(screen.queryByText("Erro interno. Tente novamente em instantes.")).toBeNull();
    });
  });

  it("mostrar e ocultar a senha funciona como no login", async () => {
    const u = await abrir();
    await u.type(campoSenha(), "Senha@123");
    await u.click(screen.getByRole("button", { name: "Mostrar senha" }));
    expect(campoSenha().type).toBe("text");
    await u.click(screen.getByRole("button", { name: "Ocultar senha" }));
    expect(campoSenha().type).toBe("password");
  });

  it("o link Já tenho conta leva ao login", async () => {
    const u = await abrir();
    await u.click(screen.getByRole("link", { name: "Já tenho conta" }));
    expect(await screen.findByRole("heading", { name: "Entrar" })).toBeTruthy();
  });

  it("depois de enviar, 'Ir para o login' leva ao login", async () => {
    const u = await abrir();
    await preencher(u);
    await u.click(botao());
    await u.click(await screen.findByRole("link", { name: "Ir para o login" }));
    expect(await screen.findByRole("heading", { name: "Entrar" })).toBeTruthy();
    await waitFor(() => expect(backend.vezes("POST", "/auth/cadastro")).toBe(1));
  });
});
