// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { criarBackendFalso, USUARIO_ATIVO, type BackendFalso } from "../../testes/backendFalso";
import { renderApp } from "../../testes/renderApp";

let backend: BackendFalso;

beforeEach(() => {
  backend = criarBackendFalso({ usuario: { ...USUARIO_ATIVO, perfil: "MESTRE" }, logado: true });
  backend.rota("GET", "/mestre/logs", { status: 200, corpo: { itens: [], proximoCursor: null } });
  backend.rota("POST", "/mestre/contas", (corpo) => ({
    status: 201,
    corpo: { id: "novo", nome: corpo.nome, email: String(corpo.email).toLowerCase(), perfil: corpo.perfil },
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const abrir = async () => {
  renderApp("/mestre/contas");
  await screen.findByRole("heading", { name: "Nova conta" });
  return userEvent.setup();
};
type Usuario = Awaited<ReturnType<typeof abrir>>;
const preencher = async (u: Usuario, nome = "Ana Admin", email = "ana@utfpr.edu.br", senha = "Senha@123") => {
  await u.type(screen.getByLabelText(/Nome completo/), nome);
  await u.type(screen.getByLabelText(/E-mail/), email);
  await u.type(screen.getByLabelText(/Senha temporária/), senha);
};
const criar = (u: Usuario) => u.click(screen.getByRole("button", { name: "Criar conta" }));
const chamadasCriar = () => backend.chamadas.filter((c) => c.metodo === "POST" && c.caminho === "/mestre/contas");

describe("Nova conta (Mestre)", () => {
  it("cria um Admin (perfil padrão) e mostra a confirmação", async () => {
    const u = await abrir();
    await preencher(u);
    await criar(u);
    expect(await screen.findByRole("heading", { name: "Conta criada" })).toBeTruthy();
    expect(screen.getByText(/ana@utfpr.edu.br/)).toBeTruthy();
    expect(chamadasCriar()[0]?.corpo).toEqual({
      nome: "Ana Admin",
      email: "ana@utfpr.edu.br",
      senha: "Senha@123",
      perfil: "ADMIN",
    });
  });

  it("cria um Operador quando escolhido", async () => {
    const u = await abrir();
    await u.click(screen.getByRole("radio", { name: "Operador" }));
    await preencher(u, "Beto Operador", "beto@utfpr.edu.br");
    await criar(u);
    await screen.findByRole("heading", { name: "Conta criada" });
    expect(chamadasCriar()[0]?.corpo?.["perfil"]).toBe("OPERADOR");
    expect(screen.getByText(/Beto Operador \(Operador\)/)).toBeTruthy();
  });

  it("apara espaços do nome e do e-mail antes de enviar", async () => {
    const u = await abrir();
    await preencher(u, "  Ana Admin  ", "  ana@utfpr.edu.br ");
    await criar(u);
    await screen.findByRole("heading", { name: "Conta criada" });
    expect(chamadasCriar()[0]?.corpo).toMatchObject({ nome: "Ana Admin", email: "ana@utfpr.edu.br" });
  });

  it("campos inválidos: mostra os erros e não envia nada", async () => {
    const u = await abrir();
    await criar(u);
    expect(screen.getByText("Informe seu nome completo.")).toBeTruthy();
    expect(screen.getByText("Informe seu e-mail.")).toBeTruthy();
    expect(chamadasCriar()).toHaveLength(0);
  });

  it("mostra as regras da senha ao vivo", async () => {
    const u = await abrir();
    const estado = () =>
      within(screen.getByRole("list", { name: "Regras da senha" }))
        .getAllByRole("listitem")
        .map((li) => (li.textContent!.includes("(cumprida)") ? "cumprida" : "pendente"));
    expect(estado()).toEqual(["pendente", "pendente", "pendente"]);
    await u.type(screen.getByLabelText(/Senha temporária/), "Senha@123");
    expect(estado()).toEqual(["cumprida", "cumprida", "cumprida"]);
  });

  it("e-mail repetido: o erro do servidor aparece no campo e-mail e some ao editar", async () => {
    backend.rota("POST", "/mestre/contas", {
      status: 409,
      corpo: { campo: "email", mensagem: "Já existe uma conta com este e-mail." },
    });
    const u = await abrir();
    await preencher(u);
    await criar(u);
    expect(await screen.findByText("Já existe uma conta com este e-mail.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Conta criada" })).toBeNull();
    await u.type(screen.getByLabelText(/E-mail/), "x");
    expect(screen.queryByText("Já existe uma conta com este e-mail.")).toBeNull();
  });

  it("erro sem campo (servidor fora do ar): aviso geral, e os dados digitados são mantidos", async () => {
    backend.rota("POST", "/mestre/contas", { status: 500, corpo: { mensagem: "Erro interno. Tente novamente em instantes." } });
    const u = await abrir();
    await preencher(u);
    await criar(u);
    expect(await screen.findByText("Erro interno. Tente novamente em instantes.")).toBeTruthy();
    expect((screen.getByLabelText(/E-mail/) as HTMLInputElement).value).toBe("ana@utfpr.edu.br");
  });

  it("sem conexão: mensagem em português", async () => {
    backend.rota("POST", "/mestre/contas", new Error("rede"));
    const u = await abrir();
    await preencher(u);
    await criar(u);
    expect(await screen.findByText(/Não foi possível conectar ao servidor/)).toBeTruthy();
  });

  it("trava os campos e o botão durante o envio, e não envia duas vezes", async () => {
    const lenta = backend.adiar("POST", "/mestre/contas");
    const u = await abrir();
    await preencher(u);
    await criar(u);
    const botao = await screen.findByRole("button", { name: "Criando..." });
    expect((botao as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText(/Nome completo/) as HTMLInputElement).disabled).toBe(true);
    fireEvent.submit(botao.closest("form")!); // segundo envio enquanto o primeiro não terminou
    lenta.resolver({ status: 201, corpo: { id: "n", nome: "Ana Admin", email: "ana@utfpr.edu.br", perfil: "ADMIN" } });
    await screen.findByRole("heading", { name: "Conta criada" });
    expect(chamadasCriar()).toHaveLength(1);
  });

  it("Criar outra conta volta ao formulário limpo", async () => {
    const u = await abrir();
    await preencher(u);
    await criar(u);
    await u.click(await screen.findByRole("button", { name: "Criar outra conta" }));
    expect((screen.getByLabelText(/Nome completo/) as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText(/Senha temporária/) as HTMLInputElement).value).toBe("");
    expect((screen.getByRole("radio", { name: "Admin" }) as HTMLInputElement).checked).toBe(true);
  });

  it("a senha não aparece na confirmação", async () => {
    const u = await abrir();
    await preencher(u);
    await criar(u);
    await screen.findByRole("heading", { name: "Conta criada" });
    expect(document.body.textContent).not.toContain("Senha@123");
  });
});
