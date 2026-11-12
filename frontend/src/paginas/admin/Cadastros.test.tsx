// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { criarBackendFalso, USUARIO_ATIVO, type BackendFalso } from "../../testes/backendFalso";
import { renderApp } from "../../testes/renderApp";

let backend: BackendFalso;

const item = (n: number, extra: Record<string, unknown> = {}) => ({
  usuarioId: `u-${n}`,
  nome: `Aluno ${n}`,
  email: `aluno${n}@alunos.utfpr.edu.br`,
  identificador: `a${1000000 + n}`,
  declaracaoId: `d-${n}`,
  enviadaEm: "2026-11-10T15:30:00.000Z",
  ...extra,
});
const pagina = (itens: unknown[], proximoCursor: string | null = null) => ({ status: 200, corpo: { itens, proximoCursor } });

const janela = () => ({ location: { href: "" }, close: vi.fn() });
let aberta: ReturnType<typeof janela> | null;

beforeEach(() => {
  backend = criarBackendFalso({ usuario: { ...USUARIO_ATIVO, perfil: "ADMIN" }, logado: true });
  aberta = janela();
  vi.spyOn(window, "open").mockImplementation(() => aberta as unknown as Window);
  URL.createObjectURL = vi.fn(() => "blob:declaracao-1");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const abrir = async (itens: unknown[] = [item(1), item(2)], proximo: string | null = null) => {
  backend.rota("GET", "/admin/cadastros", pagina(itens, proximo), { protegida: true });
  renderApp("/admin/cadastros");
  await screen.findByRole("heading", { name: "Cadastros" });
  await waitFor(() => expect(screen.queryByRole("status", { name: "Carregando cadastros" })).toBeNull());
  return userEvent.setup();
};
const cartao = (nome: string) => screen.getByText(nome).closest("li")!;
const postsDe = (acao: string) => backend.chamadas.filter((c) => c.metodo === "POST" && c.caminho.endsWith(`/${acao}`));
const dialogo = () => screen.getByRole("dialog");

describe("fila de cadastros", () => {
  it("mostra carregando enquanto busca", async () => {
    const lenta = backend.adiar("GET", "/admin/cadastros");
    renderApp("/admin/cadastros");
    expect(await screen.findByRole("status", { name: "Carregando cadastros" })).toBeTruthy();
    lenta.resolver(pagina([]));
    expect(await screen.findByText("Nenhum cadastro aguardando análise.")).toBeTruthy();
    expect(screen.queryByRole("status", { name: "Carregando cadastros" })).toBeNull();
  });

  it("vazio: mensagem clara", async () => {
    await abrir([]);
    expect(await screen.findByText("Nenhum cadastro aguardando análise.")).toBeTruthy();
  });

  it("mostra nome, e-mail, RA e a data de envio no formato brasileiro", async () => {
    await abrir([item(1)]);
    const c = within(cartao("Aluno 1"));
    expect(c.getByText("aluno1@alunos.utfpr.edu.br")).toBeTruthy();
    expect(c.getByText("RA: a1000001")).toBeTruthy();
    expect(c.getByText(/Declaração enviada em 10\/11\/2026 \d{2}:\d{2}/)).toBeTruthy();
    expect(c.getByRole("button", { name: "Ver declaração" })).toBeTruthy();
  });

  it("RA ausente aparece como 'não informado'", async () => {
    await abrir([item(1, { identificador: null })]);
    expect(screen.getByText("RA: não informado")).toBeTruthy();
  });

  it("textos da lista nunca são interpretados como HTML", async () => {
    await abrir([item(1, { nome: "<img src=x onerror=alert(1)>" })]);
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
  });

  it("erro do servidor: mensagem e Tentar de novo", async () => {
    let n = 0;
    backend.rota(
      "GET",
      "/admin/cadastros",
      () => (++n === 1 ? { status: 500, corpo: { mensagem: "Erro interno. Tente novamente em instantes." } } : pagina([item(1)])),
      { protegida: true },
    );
    renderApp("/admin/cadastros");
    expect(await screen.findByText("Erro interno. Tente novamente em instantes.")).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText("Aluno 1")).toBeTruthy();
  });

  it("sem conexão: mensagem em português", async () => {
    backend.rota("GET", "/admin/cadastros", new Error("rede"), { protegida: true });
    renderApp("/admin/cadastros");
    expect(await screen.findByText(/Não foi possível conectar ao servidor/)).toBeTruthy();
  });

  it("sessão vencida: vai para o login", async () => {
    backend.rota(
      "GET",
      "/admin/cadastros",
      () => {
        backend.sessao.logado = false;
        backend.sessao.expirada = true;
        return { status: 401, corpo: { codigo: "SESSAO_EXPIRADA", mensagem: "Sua sessão expirou. Entre novamente." } };
      },
      { protegida: true },
    );
    renderApp("/admin/cadastros");
    expect(await screen.findByRole("heading", { name: "Entrar" })).toBeTruthy();
  });

  it("pede 20 por página", async () => {
    await abrir([]);
    expect(backend.chamadas.find((c) => c.caminho === "/admin/cadastros")?.consulta).toBe("?limite=20");
  });

  it("carrega mais usando o cursor, sem repetir cadastros", async () => {
    backend.rota(
      "GET",
      "/admin/cadastros",
      (_c, q) => (q.get("cursor") === "c1" ? pagina([item(2), item(1)]) : pagina([item(1)], "c1")),
      { protegida: true },
    );
    renderApp("/admin/cadastros");
    await screen.findByText("Aluno 1");
    await userEvent.setup().click(screen.getByRole("button", { name: "Carregar mais" }));
    await screen.findByText("Aluno 2");
    expect(screen.getAllByText("Aluno 1")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
  });

  it("falha ao carregar mais: avisa, mantém a lista e deixa tentar de novo", async () => {
    let falhar = true;
    backend.rota(
      "GET",
      "/admin/cadastros",
      (_c, q) => {
        if (q.get("cursor") !== "c1") return pagina([item(1)], "c1");
        return falhar ? { status: 500, corpo: { mensagem: "Erro interno. Tente novamente em instantes." } } : pagina([item(2)]);
      },
      { protegida: true },
    );
    renderApp("/admin/cadastros");
    await screen.findByText("Aluno 1");
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: "Carregar mais" }));
    expect(await screen.findByText("Erro interno. Tente novamente em instantes.")).toBeTruthy();
    expect(screen.getByText("Aluno 1")).toBeTruthy();
    falhar = false;
    await u.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText("Aluno 2")).toBeTruthy();
  });
});

describe("ver a declaração", () => {
  it("abre a aba no toque, busca o arquivo com a sessão e aponta a aba para ele", async () => {
    const u = await abrir([item(1)]);
    backend.rota("GET", "/admin/declaracoes/d-1/arquivo", { status: 200, corpo: { conteudo: "pdf" } }, { protegida: true });
    await u.click(within(cartao("Aluno 1")).getByRole("button", { name: "Ver declaração" }));
    await waitFor(() => expect(aberta!.location.href).toBe("blob:declaracao-1"));
    expect(window.open).toHaveBeenCalledWith("", "_blank");
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(backend.vezes("GET", "/admin/declaracoes/d-1/arquivo")).toBe(1);
    expect(aberta!.close).not.toHaveBeenCalled();
  });

  it("falha ao buscar: fecha a aba vazia e mostra o erro no cartão", async () => {
    const u = await abrir([item(1), item(2)]);
    backend.rota("GET", "/admin/declaracoes/d-1/arquivo", { status: 404, corpo: { mensagem: "Declaração não encontrada." } }, { protegida: true });
    await u.click(within(cartao("Aluno 1")).getByRole("button", { name: "Ver declaração" }));
    expect(await within(cartao("Aluno 1")).findByText("Declaração não encontrada.")).toBeTruthy();
    expect(aberta!.close).toHaveBeenCalled();
    expect(within(cartao("Aluno 2")).queryByText("Declaração não encontrada.")).toBeNull();
  });

  it("navegador bloqueou a aba: explica e nem busca o arquivo", async () => {
    const u = await abrir([item(1)]);
    vi.spyOn(window, "open").mockReturnValue(null);
    await u.click(screen.getByRole("button", { name: "Ver declaração" }));
    expect(await screen.findByText(/bloqueou a nova aba/)).toBeTruthy();
    expect(backend.vezes("GET", "/admin/declaracoes/d-1/arquivo")).toBe(0);
  });

  it("trava o botão enquanto abre", async () => {
    const u = await abrir([item(1)]);
    const lenta = backend.adiar("GET", "/admin/declaracoes/d-1/arquivo");
    await u.click(screen.getByRole("button", { name: "Ver declaração" }));
    const botao = (await screen.findByRole("button", { name: "Abrindo..." })) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    lenta.resolver({ status: 200, corpo: {} });
    await waitFor(() => expect(screen.getByRole("button", { name: "Ver declaração" })).toBeTruthy());
  });
});

describe("aprovar", () => {
  it("pede confirmação e Cancelar não aprova nada", async () => {
    const u = await abrir();
    await u.click(within(cartao("Aluno 1")).getByRole("button", { name: "Aprovar" }));
    expect(within(dialogo()).getByText("Aprovar cadastro?")).toBeTruthy();
    expect(within(dialogo()).getByText(/Aluno 1 poderá recarregar a carteira e gerar o QR Code/)).toBeTruthy();
    await u.click(within(dialogo()).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(postsDe("aprovar")).toHaveLength(0);
    expect(screen.getByText("Aluno 1")).toBeTruthy();
  });

  it("confirmando: chama o servidor, tira da fila e avisa que foi aprovado", async () => {
    const u = await abrir();
    backend.rota("POST", "/admin/cadastros/u-1/aprovar", { status: 200, corpo: { status: "ATIVO" } }, { protegida: true });
    await u.click(within(cartao("Aluno 1")).getByRole("button", { name: "Aprovar" }));
    await u.click(within(dialogo()).getByRole("button", { name: "Aprovar" }));
    expect(await screen.findByText("Cadastro de Aluno 1 aprovado.")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("aluno1@alunos.utfpr.edu.br")).toBeNull());
    expect(screen.getByText("Aluno 2")).toBeTruthy();
    expect(postsDe("aprovar")).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("aprovar o último da fila mostra a lista vazia", async () => {
    const u = await abrir([item(1)]);
    backend.rota("POST", "/admin/cadastros/u-1/aprovar", { status: 200, corpo: { status: "ATIVO" } }, { protegida: true });
    await u.click(screen.getByRole("button", { name: "Aprovar" }));
    await u.click(within(dialogo()).getByRole("button", { name: "Aprovar" }));
    expect(await screen.findByText("Nenhum cadastro aguardando análise.")).toBeTruthy();
  });

  it("erro do servidor: o diálogo continua aberto com a mensagem, e o cadastro continua na fila", async () => {
    const u = await abrir();
    backend.rota("POST", "/admin/cadastros/u-1/aprovar", { status: 500, corpo: { mensagem: "Erro interno. Tente novamente em instantes." } }, { protegida: true });
    await u.click(within(cartao("Aluno 1")).getByRole("button", { name: "Aprovar" }));
    await u.click(within(dialogo()).getByRole("button", { name: "Aprovar" }));
    expect(await within(dialogo()).findByText("Erro interno. Tente novamente em instantes.")).toBeTruthy();
    expect(screen.getByText("Aluno 1")).toBeTruthy();
    expect(screen.queryByText(/aprovado\./)).toBeNull();
  });

  it("outro Admin já decidiu (409): avisa e atualiza a lista", async () => {
    const u = await abrir();
    let lista = [item(1), item(2)];
    backend.rota("GET", "/admin/cadastros", () => pagina(lista), { protegida: true });
    backend.rota(
      "POST",
      "/admin/cadastros/u-1/aprovar",
      () => {
        lista = [item(2)];
        return { status: 409, corpo: { codigo: "JA_DECIDIDO", mensagem: "Este cadastro já foi analisado." } };
      },
      { protegida: true },
    );
    await u.click(within(cartao("Aluno 1")).getByRole("button", { name: "Aprovar" }));
    await u.click(within(dialogo()).getByRole("button", { name: "Aprovar" }));
    expect(await screen.findByText("Este cadastro já foi analisado. A lista foi atualizada.")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Aluno 1")).toBeNull());
    expect(screen.getByText("Aluno 2")).toBeTruthy();
    expect(backend.vezes("GET", "/admin/cadastros")).toBe(2);
  });

  it("trava os botões durante o envio e não aprova duas vezes", async () => {
    const u = await abrir([item(1)]);
    const lenta = backend.adiar("POST", "/admin/cadastros/u-1/aprovar");
    await u.click(screen.getByRole("button", { name: "Aprovar" }));
    await u.click(within(dialogo()).getByRole("button", { name: "Aprovar" }));
    const botao = (await within(dialogo()).findByRole("button", { name: "Aprovando..." })) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    expect((within(dialogo()).getByRole("button", { name: "Cancelar" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(botao);
    lenta.resolver({ status: 200, corpo: { status: "ATIVO" } });
    await screen.findByText("Cadastro de Aluno 1 aprovado.");
    expect(postsDe("aprovar")).toHaveLength(1);
  });

  it("depois de um erro, cancelar e abrir outro cadastro não herda a mensagem", async () => {
    const u = await abrir();
    backend.rota("POST", "/admin/cadastros/u-1/aprovar", { status: 500, corpo: { mensagem: "Erro interno. Tente novamente em instantes." } }, { protegida: true });
    await u.click(within(cartao("Aluno 1")).getByRole("button", { name: "Aprovar" }));
    await u.click(within(dialogo()).getByRole("button", { name: "Aprovar" }));
    await within(dialogo()).findByText("Erro interno. Tente novamente em instantes.");
    await u.click(within(dialogo()).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await u.click(within(cartao("Aluno 2")).getByRole("button", { name: "Aprovar" }));
    expect(within(dialogo()).queryByText("Erro interno. Tente novamente em instantes.")).toBeNull();
  });
});

describe("rejeitar", () => {
  const abrirRejeicao = async (u: Awaited<ReturnType<typeof abrir>>, nome = "Aluno 1") => {
    await u.click(within(cartao(nome)).getByRole("button", { name: "Rejeitar" }));
    return screen.getByRole("textbox", { name: /Motivo da rejeição/ });
  };
  const confirmar = (u: Awaited<ReturnType<typeof abrir>>) => u.click(within(dialogo()).getByRole("button", { name: "Rejeitar cadastro" }));

  it("explica que o aluno verá o motivo e mostra o contador", async () => {
    const u = await abrir();
    const campo = await abrirRejeicao(u);
    expect(within(dialogo()).getByText(/Aluno 1 verá este motivo e poderá reenviar/)).toBeTruthy();
    expect(within(dialogo()).getByText("0/300")).toBeTruthy();
    await u.type(campo, "Foto cortada");
    expect(within(dialogo()).getByText("12/300")).toBeTruthy();
  });

  it("motivo vazio ou curto: mostra o erro e não chama o servidor", async () => {
    const u = await abrir();
    const campo = await abrirRejeicao(u);
    await confirmar(u);
    expect(within(dialogo()).getByText("Informe o motivo da rejeição (de 5 a 300 caracteres).")).toBeTruthy();
    await u.type(campo, "abc");
    await confirmar(u);
    expect(within(dialogo()).getByText("Informe o motivo da rejeição (de 5 a 300 caracteres).")).toBeTruthy();
    await u.clear(campo);
    await u.type(campo, "      ");
    await confirmar(u);
    expect(postsDe("rejeitar")).toHaveLength(0);
  });

  it("limita o texto a 300 caracteres", async () => {
    const u = await abrir();
    const campo = (await abrirRejeicao(u)) as HTMLTextAreaElement;
    expect(campo.getAttribute("maxlength")).toBe("300");
  });

  it("motivo válido: envia o texto sem espaços nas pontas, tira da fila e avisa", async () => {
    const u = await abrir();
    backend.rota("POST", "/admin/cadastros/u-1/rejeitar", { status: 200, corpo: { status: "REJEITADO" } }, { protegida: true });
    const campo = await abrirRejeicao(u);
    await u.type(campo, "  Declaração vencida.  ");
    await confirmar(u);
    expect(await screen.findByText("Cadastro de Aluno 1 rejeitado.")).toBeTruthy();
    expect(postsDe("rejeitar")[0]?.corpo).toEqual({ motivo: "Declaração vencida." });
    await waitFor(() => expect(screen.queryByText("aluno1@alunos.utfpr.edu.br")).toBeNull());
    expect(screen.getByText("Aluno 2")).toBeTruthy();
  });

  it("cinco caracteres já valem", async () => {
    const u = await abrir([item(1)]);
    backend.rota("POST", "/admin/cadastros/u-1/rejeitar", { status: 200, corpo: { status: "REJEITADO" } }, { protegida: true });
    await u.type(await abrirRejeicao(u), "12345");
    await confirmar(u);
    await screen.findByText("Cadastro de Aluno 1 rejeitado.");
  });

  it("Cancelar descarta o motivo digitado: o próximo cadastro abre com o campo limpo", async () => {
    const u = await abrir();
    await u.type(await abrirRejeicao(u), "Motivo qualquer");
    await u.click(within(dialogo()).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const campo = (await abrirRejeicao(u, "Aluno 2")) as HTMLTextAreaElement;
    expect(campo.value).toBe("");
    expect(within(dialogo()).queryByText(/Informe o motivo/)).toBeNull();
  });

  it("erro do servidor: mantém o diálogo e o texto digitado", async () => {
    const u = await abrir();
    backend.rota("POST", "/admin/cadastros/u-1/rejeitar", { status: 500, corpo: { mensagem: "Erro interno. Tente novamente em instantes." } }, { protegida: true });
    await u.type(await abrirRejeicao(u), "Foto ilegível");
    await confirmar(u);
    expect(await within(dialogo()).findByText("Erro interno. Tente novamente em instantes.")).toBeTruthy();
    expect((screen.getByRole("textbox", { name: /Motivo da rejeição/ }) as HTMLTextAreaElement).value).toBe("Foto ilegível");
    expect(screen.getByText("Aluno 1")).toBeTruthy();
  });

  it("já analisado por outro Admin (409): avisa e atualiza", async () => {
    const u = await abrir();
    backend.rota(
      "POST",
      "/admin/cadastros/u-1/rejeitar",
      { status: 409, corpo: { codigo: "JA_DECIDIDO", mensagem: "Este cadastro já foi analisado." } },
      { protegida: true },
    );
    await u.type(await abrirRejeicao(u), "Foto ilegível");
    await confirmar(u);
    expect(await screen.findByText(/já foi analisado\. A lista foi atualizada\./)).toBeTruthy();
    await waitFor(() => expect(backend.vezes("GET", "/admin/cadastros")).toBe(2));
  });

  it("trava durante o envio e não rejeita duas vezes", async () => {
    const u = await abrir([item(1)]);
    const lenta = backend.adiar("POST", "/admin/cadastros/u-1/rejeitar");
    await u.type(await abrirRejeicao(u), "Foto ilegível");
    await confirmar(u);
    const botao = (await within(dialogo()).findByRole("button", { name: "Rejeitando..." })) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    expect((screen.getByRole("textbox", { name: /Motivo da rejeição/ }) as HTMLTextAreaElement).disabled).toBe(true);
    fireEvent.click(botao);
    lenta.resolver({ status: 200, corpo: { status: "REJEITADO" } });
    await screen.findByText("Cadastro de Aluno 1 rejeitado.");
    expect(postsDe("rejeitar")).toHaveLength(1);
  });
});

describe("decidir quando há mais páginas", () => {
  it("se a página local esvaziou mas há mais cadastros, busca a fila de novo", async () => {
    let decidido = false;
    backend.rota(
      "GET",
      "/admin/cadastros",
      () => (decidido ? pagina([item(2)]) : pagina([item(1)], "c1")),
      { protegida: true },
    );
    backend.rota("POST", "/admin/cadastros/u-1/aprovar", () => {
      decidido = true;
      return { status: 200, corpo: { status: "ATIVO" } };
    }, { protegida: true });
    renderApp("/admin/cadastros");
    const u = userEvent.setup();
    await screen.findByText("Aluno 1");
    await u.click(screen.getByRole("button", { name: "Aprovar" }));
    await u.click(within(dialogo()).getByRole("button", { name: "Aprovar" }));
    expect(await screen.findByText("Aluno 2")).toBeTruthy();
    expect(screen.queryByText("Nenhum cadastro aguardando análise.")).toBeNull();
  });
});

describe("aviso de sucesso", () => {
  it("pode ser fechado", async () => {
    const u = await abrir([item(1), item(2)]);
    backend.rota("POST", "/admin/cadastros/u-1/aprovar", { status: 200, corpo: { status: "ATIVO" } }, { protegida: true });
    await u.click(within(cartao("Aluno 1")).getByRole("button", { name: "Aprovar" }));
    await u.click(within(dialogo()).getByRole("button", { name: "Aprovar" }));
    const texto = await screen.findByText("Cadastro de Aluno 1 aprovado.");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await u.click(within(texto.closest('[role="alert"]') as HTMLElement).getByRole("button", { name: /fechar|close/i }));
    expect(screen.queryByText("Cadastro de Aluno 1 aprovado.")).toBeNull();
  });
});
