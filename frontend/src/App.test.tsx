// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { criarBackendFalso, SENHA, USUARIO_ATIVO, type BackendFalso } from "./testes/backendFalso";
import { renderApp } from "./testes/renderApp";
import type { Usuario } from "./auth/contexto";

let backend: BackendFalso;

const PENDENTE: Usuario = { ...USUARIO_ATIVO, status: "PENDENTE_APROVACAO" };
const REJEITADO: Usuario = { ...USUARIO_ATIVO, status: "REJEITADO" };

beforeEach(() => {
  backend = criarBackendFalso();
  // Rotas protegidas de outros módulos: 401 quando a sessão não está logada.
  backend.rota("GET", "/historico", { status: 200, corpo: { itens: [], proximoCursor: null } }, { protegida: true });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const titulo = (nome: string) => screen.findByRole("heading", { name: nome });
const menu = () => screen.queryByRole("navigation", { name: "Navegação principal" });
const entrarNoFormulario = async (u: ReturnType<typeof userEvent.setup>, senha = SENHA) => {
  await u.type(screen.getByLabelText("E-mail"), USUARIO_ATIVO.email);
  await u.type(screen.getByLabelText("Senha"), senha);
  await u.click(screen.getByRole("button", { name: "Entrar" }));
};

describe("sem sessão: a guarda leva ao login", () => {
  it.each(["/", "/historico", "/cardapio", "/perfil", "/recarga", "/admin/cardapio", "/status-cadastro"])(
    "%s sem login vai para Entrar",
    async (rota) => {
      renderApp(rota);
      expect(await titulo("Entrar")).toBeTruthy();
      expect(menu()).toBeNull();
    },
  );

  it("depois de entrar, volta para a tela que a pessoa tentou abrir", async () => {
    renderApp("/historico");
    const u = userEvent.setup();
    await titulo("Entrar");
    await entrarNoFormulario(u);
    expect(await titulo("Histórico")).toBeTruthy();
    expect(menu()).toBeTruthy();
  });

  it("entrando pela raiz, vai para o início", async () => {
    renderApp("/");
    const u = userEvent.setup();
    await titulo("Entrar");
    await entrarNoFormulario(u);
    expect(await titulo("Início")).toBeTruthy();
  });

  it("sem sessão na abertura NÃO mostra o aviso de sessão expirada", async () => {
    renderApp("/");
    await titulo("Entrar");
    expect(screen.queryByText(/sessão expirou/)).toBeNull();
  });

  it("enquanto descobre se há sessão, mostra o carregando (e não o login nem o conteúdo)", async () => {
    const lento = backend.adiar("GET", "/auth/me");
    renderApp("/historico");
    expect(screen.getByRole("status", { name: "Carregando" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Entrar" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Histórico" })).toBeNull();

    lento.resolver({ status: 401, corpo: { mensagem: "Faça login para continuar." } });
    expect(await titulo("Entrar")).toBeTruthy();
  });

  it("as telas públicas (entrar e cadastro) abrem sem login", async () => {
    renderApp("/cadastro");
    expect(await titulo("Criar conta")).toBeTruthy();
  });
});

describe("sessão expirada", () => {
  it("expirada ao abrir o app (45 dias): vai ao login com o aviso", async () => {
    backend.sessao.expirada = true;
    renderApp("/historico");
    expect(await titulo("Entrar")).toBeTruthy();
    expect(screen.getByText("Sua sessão expirou. Entre novamente.")).toBeTruthy();
  });

  it("depois de entrar de novo, o aviso some e volta para a tela de origem", async () => {
    backend.sessao.expirada = true;
    renderApp("/historico");
    const u = userEvent.setup();
    await titulo("Entrar");
    await entrarNoFormulario(u);
    expect(await titulo("Histórico")).toBeTruthy();
    expect(screen.queryByText(/sessão expirou/)).toBeNull();
  });

  describe("no meio do uso", () => {
    const abrirHistoricoLogado = async () => {
      backend.sessao.logado = true;
      renderApp("/historico");
      await titulo("Histórico");
      return userEvent.setup();
    };

    it("uma chamada que volta 401 leva ao login com o aviso", async () => {
      const u = await abrirHistoricoLogado();
      backend.sessao.logado = false;
      backend.sessao.expirada = true;
      await u.click(screen.getByRole("tab", { name: "Recargas" })); // faz uma chamada protegida

      expect(await titulo("Entrar")).toBeTruthy();
      expect(screen.getByText("Sua sessão expirou. Entre novamente.")).toBeTruthy();
      expect(menu()).toBeNull();
    });

    it("sessão revogada (401 sem código, ex.: conta desativada) também avisa, porque a pessoa estava logada", async () => {
      const u = await abrirHistoricoLogado();
      backend.sessao.logado = false; // sem 'expirada': o servidor só diz "faça login"
      await u.click(screen.getByRole("tab", { name: "Recargas" }));

      expect(await titulo("Entrar")).toBeTruthy();
      expect(screen.getByText("Sua sessão expirou. Entre novamente.")).toBeTruthy();
    });

    it("entrando de novo, volta exatamente para a tela em que estava", async () => {
      const u = await abrirHistoricoLogado();
      backend.sessao.logado = false;
      backend.sessao.expirada = true;
      await u.click(screen.getByRole("tab", { name: "Recargas" }));
      await titulo("Entrar");

      await entrarNoFormulario(u);
      expect(await titulo("Histórico")).toBeTruthy();
      expect(menu()).toBeTruthy();
    });

    it("o menu e o conteúdo logado somem na hora (nada vaza na tela)", async () => {
      const u = await abrirHistoricoLogado();
      expect(menu()).toBeTruthy();
      backend.sessao.logado = false;
      await u.click(screen.getByRole("tab", { name: "Recargas" }));
      await titulo("Entrar");
      expect(screen.queryByRole("heading", { name: "Histórico" })).toBeNull();
      expect(screen.queryByRole("tab", { name: "Recargas" })).toBeNull();
    });
  });
});

describe("com sessão ativa", () => {
  beforeEach(() => {
    backend.sessao.logado = true;
  });

  it("abre o app direto, com o menu inferior e as cinco abas", async () => {
    renderApp("/");
    expect(await titulo("Início")).toBeTruthy();
    const nav = menu()!;
    const abas = within(nav).getAllByRole("link");
    expect(abas.map((a) => a.textContent)).toEqual(["Início", "Recarga", "Histórico", "Cardápio", "Perfil"]);
    expect(abas.map((a) => a.getAttribute("href"))).toEqual(["/", "/recarga", "/historico", "/cardapio", "/perfil"]);
  });

  it.each(["/entrar", "/cadastro"])("%s com sessão vai direto para o início (sem mostrar o formulário)", async (rota) => {
    renderApp(rota);
    expect(await titulo("Início")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /Entrar|Criar conta/ })).toBeNull();
  });

  it("a navegação inferior leva às telas", async () => {
    renderApp("/");
    const u = userEvent.setup();
    await titulo("Início");
    await u.click(within(menu()!).getByRole("link", { name: "Histórico" }));
    expect(await titulo("Histórico")).toBeTruthy();
    await u.click(within(menu()!).getByRole("link", { name: "Perfil" }));
    expect(await titulo("Perfil")).toBeTruthy();
  });

  it("o link de confirmação de e-mail abre mesmo com outra conta logada", async () => {
    renderApp("/confirmar-email?token=abc");
    expect(await titulo("Confirmar e-mail")).toBeTruthy();
  });

  it("a abertura chama o servidor para descobrir a sessão uma única vez", async () => {
    renderApp("/");
    await titulo("Início");
    expect(backend.vezes("GET", "/auth/me")).toBe(1);
  });

  describe("status do cadastro", () => {
    it("conta ativa que abre /status-cadastro vai para o início", async () => {
      renderApp("/status-cadastro");
      expect(await titulo("Início")).toBeTruthy();
    });
  });
});

describe("cadastro ainda não aprovado", () => {
  beforeEach(() => {
    backend.sessao.logado = true;
    backend.sessao.usuario = PENDENTE;
  });

  it.each(["/", "/historico", "/cardapio", "/perfil", "/recarga", "/admin/cardapio", "/status-cadastro"])(
    "%s mostra só a tela de análise, sem menu",
    async (rota) => {
      renderApp(rota);
      expect(await titulo("Cadastro em análise")).toBeTruthy();
      expect(menu()).toBeNull();
      expect(screen.getByText(`Conta: ${USUARIO_ATIVO.email}`)).toBeTruthy();
    },
  );

  it("conta pendente nem chega a chamar as rotas de dados", async () => {
    renderApp("/historico");
    await titulo("Cadastro em análise");
    expect(backend.vezes("GET", "/historico")).toBe(0);
  });

  it("depois do login, uma conta pendente cai na tela de análise", async () => {
    backend.sessao.logado = false;
    renderApp("/");
    const u = userEvent.setup();
    await titulo("Entrar");
    await entrarNoFormulario(u);
    expect(await titulo("Cadastro em análise")).toBeTruthy();
  });

  it("cadastro rejeitado mostra a tela própria", async () => {
    backend.sessao.usuario = REJEITADO;
    renderApp("/");
    expect(await titulo("Cadastro não aprovado")).toBeTruthy();
    expect(screen.getByText(/Fale com o RU/)).toBeTruthy();
    expect(menu()).toBeNull();
  });

  describe("Atualizar", () => {
    it("quando o Admin aprovou, abre o app", async () => {
      renderApp("/");
      const u = userEvent.setup();
      await titulo("Cadastro em análise");
      backend.sessao.usuario = USUARIO_ATIVO; // o Admin aprovou
      await u.click(screen.getByRole("button", { name: "Atualizar" }));
      expect(await titulo("Início")).toBeTruthy();
      expect(menu()).toBeTruthy();
    });

    it("sem novidade, avisa que ainda está em análise e continua na tela", async () => {
      renderApp("/");
      const u = userEvent.setup();
      await titulo("Cadastro em análise");
      await u.click(screen.getByRole("button", { name: "Atualizar" }));
      expect(await screen.findByText("Seu cadastro ainda está em análise. Tente de novo mais tarde.")).toBeTruthy();
      expect(screen.getByRole("heading", { name: "Cadastro em análise" })).toBeTruthy();
    });

    it("não troca a tela por 'carregando' enquanto atualiza", async () => {
      renderApp("/");
      const u = userEvent.setup();
      await titulo("Cadastro em análise");
      const lento = backend.adiar("GET", "/auth/me");
      await u.click(screen.getByRole("button", { name: "Atualizar" }));

      expect(screen.getByRole("button", { name: "Atualizando..." })).toHaveProperty("disabled", true);
      expect(screen.getByRole("heading", { name: "Cadastro em análise" })).toBeTruthy();
      expect(screen.queryByRole("status", { name: "Carregando" })).toBeNull();

      lento.resolver({ status: 200, corpo: { usuario: PENDENTE } });
      await screen.findByText(/ainda está em análise/);
    });

    it("se a sessão acabou nesse meio tempo, vai ao login com o aviso", async () => {
      renderApp("/");
      const u = userEvent.setup();
      await titulo("Cadastro em análise");
      backend.sessao.logado = false;
      backend.sessao.expirada = true;
      await u.click(screen.getByRole("button", { name: "Atualizar" }));
      expect(await titulo("Entrar")).toBeTruthy();
      expect(screen.getByText("Sua sessão expirou. Entre novamente.")).toBeTruthy();
    });
  });

  it("Sair na tela de análise volta ao login", async () => {
    renderApp("/");
    const u = userEvent.setup();
    await titulo("Cadastro em análise");
    await u.click(screen.getByRole("button", { name: "Sair" }));
    expect(await titulo("Entrar")).toBeTruthy();
    expect(backend.vezes("POST", "/auth/logout")).toBe(1);
  });

  it("Sair sem conexão avisa e a pessoa continua na tela", async () => {
    renderApp("/");
    const u = userEvent.setup();
    await titulo("Cadastro em análise");
    backend.rota("POST", "/auth/logout", new TypeError("Failed to fetch"));
    await u.click(screen.getByRole("button", { name: "Sair" }));
    expect(await screen.findByText(/Não foi possível conectar ao servidor/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Cadastro em análise" })).toBeTruthy();
    expect(backend.sessao.logado).toBe(true);
  });
});

describe("falha ao descobrir a sessão (servidor fora do ar)", () => {
  it("sem conexão: mostra o erro com 'Tentar de novo' e NÃO manda para o login", async () => {
    backend.sessao.logado = true;
    backend.rota("GET", "/auth/me", new TypeError("Failed to fetch"));
    renderApp("/historico");
    expect(await screen.findByText(/Não foi possível conectar ao servidor/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Entrar" })).toBeNull();
  });

  it("'Tentar de novo' consulta outra vez e abre o app quando o servidor volta", async () => {
    backend.sessao.logado = true;
    const original = backend.adiar("GET", "/auth/me");
    original.resolver(new TypeError("Failed to fetch"));
    renderApp("/historico");
    const u = userEvent.setup();
    await screen.findByText(/Não foi possível conectar ao servidor/);

    backend.rota("GET", "/auth/me", () => ({ status: 200, corpo: { usuario: USUARIO_ATIVO } }));
    await u.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await titulo("Histórico")).toBeTruthy();
    expect(backend.vezes("GET", "/auth/me")).toBe(2);
  });

  it("erro 500 do servidor também não derruba a sessão", async () => {
    backend.rota("GET", "/auth/me", { status: 500, corpo: { mensagem: "Erro interno. Tente novamente em instantes." } });
    renderApp("/");
    expect(await screen.findByText("Erro interno. Tente novamente em instantes.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Entrar" })).toBeNull();
  });

  it("nas telas públicas, o servidor fora do ar não impede de ver o login", async () => {
    backend.rota("GET", "/auth/me", new TypeError("Failed to fetch"));
    renderApp("/entrar");
    expect(await titulo("Entrar")).toBeTruthy();
  });
});

describe("Perfil e sair", () => {
  beforeEach(() => {
    backend.sessao.logado = true;
  });

  it("mostra nome, e-mail e categoria", async () => {
    renderApp("/perfil");
    expect(await titulo("Perfil")).toBeTruthy();
    expect(screen.getByText("Maria da Silva")).toBeTruthy();
    expect(screen.getByText("maria@alunos.utfpr.edu.br")).toBeTruthy();
    expect(screen.getByText("Discente")).toBeTruthy();
  });

  it("nome e e-mail muito longos quebram linha em vez de estourar a tela", async () => {
    const longo = "x".repeat(120);
    backend.sessao.usuario = { ...USUARIO_ATIVO, nome: longo, email: `${longo}@alunos.utfpr.edu.br` };
    renderApp("/perfil");
    const el = await screen.findByText(longo);
    expect(getComputedStyle(el).overflowWrap).toBe("anywhere");
  });

  it("Sair encerra a sessão no servidor e volta ao login, sem o aviso de sessão expirada", async () => {
    renderApp("/perfil");
    const u = userEvent.setup();
    await titulo("Perfil");
    await u.click(screen.getByRole("button", { name: "Sair" }));

    expect(await titulo("Entrar")).toBeTruthy();
    expect(screen.queryByText(/sessão expirou/)).toBeNull();
    expect(backend.vezes("POST", "/auth/logout")).toBe(1);
    expect(backend.sessao.logado).toBe(false);
    expect(menu()).toBeNull();
  });

  it("depois de sair e entrar de novo, vai para o início (não para o Perfil de onde saiu)", async () => {
    renderApp("/perfil");
    const u = userEvent.setup();
    await titulo("Perfil");
    await u.click(screen.getByRole("button", { name: "Sair" }));
    await titulo("Entrar");
    await entrarNoFormulario(u);
    expect(await titulo("Início")).toBeTruthy();
  });

  it("depois de sair, as telas logadas já não abrem (a sessão acabou de verdade)", async () => {
    renderApp("/perfil");
    const u = userEvent.setup();
    await titulo("Perfil");
    await u.click(screen.getByRole("button", { name: "Sair" }));
    await titulo("Entrar");
    expect(screen.queryByRole("heading", { name: "Perfil" })).toBeNull();
  });

  it("enquanto sai, o botão fica desabilitado com 'Saindo...' e um segundo clique não repete", async () => {
    const lento = backend.adiar("POST", "/auth/logout");
    renderApp("/perfil");
    const u = userEvent.setup();
    await titulo("Perfil");
    await u.click(screen.getByRole("button", { name: "Sair" }));
    const botao = screen.getByRole("button", { name: "Saindo..." }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    expect(backend.vezes("POST", "/auth/logout")).toBe(1);
    lento.resolver({ status: 204 });
    await titulo("Entrar");
  });

  it("sem conexão: avisa que não conseguiu sair, e a pessoa continua logada (sabe que a sessão segue aberta)", async () => {
    backend.rota("POST", "/auth/logout", new TypeError("Failed to fetch"));
    renderApp("/perfil");
    const u = userEvent.setup();
    await titulo("Perfil");
    await u.click(screen.getByRole("button", { name: "Sair" }));

    expect(await screen.findByText(/Não foi possível conectar ao servidor/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Perfil" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Sair" }) as HTMLButtonElement).disabled).toBe(false);
    expect(backend.sessao.logado).toBe(true);
  });

  it("depois de falhar, dá para tentar sair de novo e funciona", async () => {
    backend.rota("POST", "/auth/logout", new TypeError("Failed to fetch"));
    renderApp("/perfil");
    const u = userEvent.setup();
    await titulo("Perfil");
    await u.click(screen.getByRole("button", { name: "Sair" }));
    await screen.findByText(/Não foi possível conectar/);

    backend.rota("POST", "/auth/logout", () => {
      backend.sessao.logado = false;
      return { status: 204 };
    });
    await u.click(screen.getByRole("button", { name: "Sair" }));
    expect(await titulo("Entrar")).toBeTruthy();
    await waitFor(() => expect(backend.vezes("POST", "/auth/logout")).toBe(2));
  });
});
