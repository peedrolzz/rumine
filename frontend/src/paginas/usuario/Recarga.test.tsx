// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { criarBackendFalso, type BackendFalso } from "../../testes/backendFalso";
import { renderApp } from "../../testes/renderApp";
import { INTERVALO_CONSULTA_MS } from "./Recarga";

let backend: BackendFalso;

type Estado = "PENDENTE" | "CONFIRMADA" | "RECUSADA" | "EXPIRADA";
const recarga = (extra: Record<string, unknown> = {}) => ({
  id: "r-1",
  valorCentavos: 2000,
  status: "PENDENTE" as Estado,
  motivoFalha: null,
  codigoPagamento: "PIX-SIMULADO-2000-ABCD1234",
  expiraEm: "2026-11-12T15:30:00.000Z",
  simulacao: false,
  ...extra,
});

/** O que o servidor responde para GET /recargas/r-1; o teste muda `atual` para simular o banco avisando. */
let atual: ReturnType<typeof recarga>;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  sessionStorage.clear();
  backend = criarBackendFalso({ logado: true });
  atual = recarga();
  backend.rota("POST", "/recargas", () => ({ status: 201, corpo: atual }), { protegida: true });
  backend.rota("GET", "/recargas/r-1", () => ({ status: 200, corpo: atual }), { protegida: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const abrir = async () => {
  renderApp("/recarga");
  await screen.findByRole("heading", { name: "Recarregar" });
  const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  // O user-event instala a própria área de transferência: o teste troca por uma que ele controla, depois do setup.
  Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn(async () => undefined) }, configurable: true });
  return u;
};
type Usr = Awaited<ReturnType<typeof abrir>>;
const digitar = async (u: Usr, valor: string) => {
  const campo = screen.getByLabelText(/Valor da recarga/);
  await u.clear(campo);
  if (valor) await u.type(campo, valor);
};
const gerar = (u: Usr) => u.click(screen.getByRole("button", { name: "Gerar pagamento Pix" }));
const aguardando = async (u: Usr, valor = "20") => {
  await digitar(u, valor);
  await gerar(u);
  await screen.findByRole("heading", { name: "Pague com Pix" });
};
const pedidos = () => backend.chamadas.filter((c) => c.metodo === "POST" && c.caminho === "/recargas");
const passar = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe("escolher o valor", () => {
  it("mostra os limites e o aviso de que o saldo só sobe depois da confirmação", async () => {
    await abrir();
    expect(screen.getByText("De R$ 5,00 a R$ 200,00")).toBeTruthy();
    expect(screen.getByText(/O saldo só é creditado depois que o banco confirmar o pagamento/)).toBeTruthy();
  });

  it.each([
    ["R$ 10,00", "10,00"],
    ["R$ 20,00", "20,00"],
    ["R$ 50,00", "50,00"],
  ])("o atalho %s preenche o valor", async (rotulo, esperado) => {
    const u = await abrir();
    await u.click(screen.getByRole("button", { name: rotulo }));
    expect((screen.getByLabelText(/Valor da recarga/) as HTMLInputElement).value).toBe(esperado);
  });

  it("enviar vazio: pede o valor e não chama o servidor", async () => {
    const u = await abrir();
    await gerar(u);
    expect(screen.getByText("Informe o valor da recarga.")).toBeTruthy();
    expect(pedidos()).toHaveLength(0);
  });

  it.each([
    ["abc", "Digite um valor válido, por exemplo 20 ou 20,50."],
    ["20,505", "Digite um valor válido, por exemplo 20 ou 20,50."],
    ["4,99", "O valor mínimo da recarga é R$ 5,00."],
    ["0", "O valor mínimo da recarga é R$ 5,00."],
    ["200,01", "O valor máximo da recarga é R$ 200,00."],
    ["1.234", "O valor máximo da recarga é R$ 200,00."],
  ])("valor %j: erro no campo e nada é enviado", async (valor, mensagem) => {
    const u = await abrir();
    await digitar(u, valor);
    await gerar(u);
    expect(screen.getByText(mensagem)).toBeTruthy();
    expect(pedidos()).toHaveLength(0);
  });

  it.each([
    ["5", 500],
    ["200", 20000],
    ["20,5", 2050],
    ["R$ 20", 2000],
    ["20,00", 2000],
  ])("valor %j é enviado como %d centavos (inteiro)", async (valor, centavos) => {
    const u = await abrir();
    await aguardando(u, valor);
    expect(pedidos()).toHaveLength(1);
    expect(pedidos()[0]!.corpo).toEqual({ valorCentavos: centavos });
  });

  it("os erros só aparecem depois de tentar enviar", async () => {
    const u = await abrir();
    await digitar(u, "abc");
    expect(screen.queryByText(/Digite um valor válido/)).toBeNull();
  });

  it("o servidor recusa o valor: a mensagem dele aparece no campo e some ao editar", async () => {
    backend.rota("POST", "/recargas", { status: 400, corpo: { campo: "valorCentavos", mensagem: "O valor máximo da recarga é R$ 200,00." } }, { protegida: true });
    const u = await abrir();
    await digitar(u, "20");
    await gerar(u);
    expect(await screen.findByText("O valor máximo da recarga é R$ 200,00.")).toBeTruthy();
    await digitar(u, "30"); // corrigiu o valor: o erro do servidor sai
    expect(screen.queryByText("O valor máximo da recarga é R$ 200,00.")).toBeNull();
  });

  it.each([
    [429, "Você já tem 3 recargas aguardando pagamento. Pague uma delas ou espere o prazo terminar."],
    [502, "Não foi possível gerar o pagamento agora. Tente de novo em instantes."],
    [403, "Seu cadastro está em análise. Aguarde a aprovação do Admin."],
  ])("erro %d do servidor: aviso geral, valor mantido", async (status, mensagem) => {
    backend.rota("POST", "/recargas", { status, corpo: { mensagem } }, { protegida: true });
    const u = await abrir();
    await digitar(u, "20");
    await gerar(u);
    expect(await screen.findByText(mensagem)).toBeTruthy();
    expect((screen.getByLabelText(/Valor da recarga/) as HTMLInputElement).value).toBe("20");
    expect(screen.getByRole("heading", { name: "Recarregar" })).toBeTruthy();
  });

  it("sem conexão: mensagem em português", async () => {
    backend.rota("POST", "/recargas", new Error("rede"), { protegida: true });
    const u = await abrir();
    await digitar(u, "20");
    await gerar(u);
    expect(await screen.findByText(/Não foi possível conectar ao servidor/)).toBeTruthy();
  });

  it("trava o botão e o campo durante o envio e não envia duas vezes", async () => {
    const lenta = backend.adiar("POST", "/recargas");
    const u = await abrir();
    await digitar(u, "20");
    await gerar(u);
    const botao = (await screen.findByRole("button", { name: "Gerando..." })) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    expect((screen.getByLabelText(/Valor da recarga/) as HTMLInputElement).disabled).toBe(true);
    fireEvent.submit(botao.closest("form")!);
    lenta.resolver({ status: 201, corpo: atual });
    await screen.findByRole("heading", { name: "Pague com Pix" });
    expect(pedidos()).toHaveLength(1);
  });

  it("sessão vencida ao gerar: vai para o login", async () => {
    backend.rota("POST", "/recargas", () => {
      backend.sessao.logado = false;
      backend.sessao.expirada = true;
      return { status: 401, corpo: { codigo: "SESSAO_EXPIRADA", mensagem: "Sua sessão expirou. Entre novamente." } };
    }, { protegida: true });
    const u = await abrir();
    await digitar(u, "20");
    await gerar(u);
    expect(await screen.findByRole("heading", { name: "Entrar" })).toBeTruthy();
  });
});

describe("aguardando o pagamento", () => {
  it("mostra o valor, o prazo, o código Pix e deixa claro que o saldo ainda não mudou", async () => {
    const u = await abrir();
    await aguardando(u);
    expect(screen.getByText("R$ 20,00")).toBeTruthy();
    expect(screen.getByText(/Pague até as \d{2}:\d{2}/)).toBeTruthy();
    expect(screen.getByText("PIX-SIMULADO-2000-ABCD1234")).toBeTruthy();
    expect(screen.getByText(/Aguardando o pagamento\. O saldo só aumenta depois que o banco confirmar/)).toBeTruthy();
    expect(screen.queryByText(/Recarga confirmada/)).toBeNull();
  });

  it("Copiar código copia o código e avisa", async () => {
    const u = await abrir();
    await aguardando(u);
    await u.click(screen.getByRole("button", { name: "Copiar código" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("PIX-SIMULADO-2000-ABCD1234");
    expect(await screen.findByText("Código copiado. Cole no app do seu banco.")).toBeTruthy();
  });

  it("se não der para copiar, orienta a copiar à mão", async () => {
    const u = await abrir();
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn(async () => { throw new Error("sem permissão"); }) }, configurable: true });
    await aguardando(u);
    await u.click(screen.getByRole("button", { name: "Copiar código" }));
    expect(await screen.findByText(/Não foi possível copiar\. Selecione o código/)).toBeTruthy();
  });

  it("não mostra os botões de simulação quando o servidor não é de desenvolvimento", async () => {
    const u = await abrir();
    await aguardando(u);
    expect(screen.queryByRole("button", { name: /Simular pagamento/ })).toBeNull();
  });

  it("Escolher outro valor volta ao formulário", async () => {
    const u = await abrir();
    await aguardando(u);
    await u.click(screen.getByRole("button", { name: "Escolher outro valor" }));
    expect(screen.getByRole("heading", { name: "Recarregar" })).toBeTruthy();
  });
});

describe("acompanhando o pagamento", () => {
  it("consulta o servidor de tempos em tempos enquanto está pendente", async () => {
    const u = await abrir();
    await aguardando(u);
    expect(backend.vezes("GET", "/recargas/r-1")).toBe(0);
    await passar(INTERVALO_CONSULTA_MS);
    expect(backend.vezes("GET", "/recargas/r-1")).toBe(1);
    await passar(INTERVALO_CONSULTA_MS);
    expect(backend.vezes("GET", "/recargas/r-1")).toBe(2);
    expect(screen.getByRole("heading", { name: "Pague com Pix" })).toBeTruthy();
  });

  it("quando o banco confirma: mostra a recarga confirmada com o valor e o atalho para o saldo", async () => {
    const u = await abrir();
    await aguardando(u);
    atual = recarga({ status: "CONFIRMADA", codigoPagamento: null });
    await passar(INTERVALO_CONSULTA_MS);
    expect(await screen.findByRole("heading", { name: "Recarga confirmada" })).toBeTruthy();
    expect(screen.getByText("R$ 20,00")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver meu saldo" }).getAttribute("href")).toBe("/");
    expect(screen.queryByText("PIX-SIMULADO-2000-ABCD1234")).toBeNull();
  });

  it("depois do resultado, para de consultar", async () => {
    const u = await abrir();
    await aguardando(u);
    atual = recarga({ status: "CONFIRMADA", codigoPagamento: null });
    await passar(INTERVALO_CONSULTA_MS);
    await screen.findByRole("heading", { name: "Recarga confirmada" });
    const n = backend.vezes("GET", "/recargas/r-1");
    await passar(INTERVALO_CONSULTA_MS * 5);
    expect(backend.vezes("GET", "/recargas/r-1")).toBe(n);
  });

  it("pagamento recusado: mostra o motivo, avisa que o saldo não mudou e deixa tentar de novo", async () => {
    const u = await abrir();
    await aguardando(u);
    atual = recarga({ status: "RECUSADA", motivoFalha: "Cartão sem limite.", codigoPagamento: null });
    await passar(INTERVALO_CONSULTA_MS);
    expect(await screen.findByRole("heading", { name: "Pagamento não concluído" })).toBeTruthy();
    expect(screen.getByText("Cartão sem limite.")).toBeTruthy();
    expect(screen.getByText("Seu saldo não foi alterado.")).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(screen.getByRole("heading", { name: "Recarregar" })).toBeTruthy();
  });

  it("recusado sem motivo informado: usa uma mensagem padrão", async () => {
    const u = await abrir();
    await aguardando(u);
    atual = recarga({ status: "RECUSADA", motivoFalha: null, codigoPagamento: null });
    await passar(INTERVALO_CONSULTA_MS);
    expect(await screen.findByText("O pagamento foi recusado.")).toBeTruthy();
  });

  it("prazo vencido: avisa e deixa tentar de novo", async () => {
    const u = await abrir();
    await aguardando(u);
    atual = recarga({ status: "EXPIRADA", motivoFalha: "O prazo para pagar terminou. Gere uma nova recarga.", codigoPagamento: null });
    await passar(INTERVALO_CONSULTA_MS);
    expect(await screen.findByRole("heading", { name: "Prazo do pagamento encerrado" })).toBeTruthy();
    expect(screen.getByText("O prazo para pagar terminou. Gere uma nova recarga.")).toBeTruthy();
    expect(screen.getByText("Seu saldo não foi alterado.")).toBeTruthy();
  });

  it("falha ao consultar: avisa, continua tentando e se recupera sozinho", async () => {
    const u = await abrir();
    await aguardando(u);
    let falhar = true;
    backend.rota("GET", "/recargas/r-1", () => (falhar ? new Error("rede") as never : { status: 200, corpo: atual }), { protegida: true });
    await passar(INTERVALO_CONSULTA_MS);
    expect(await screen.findByText(/Não foi possível verificar o pagamento agora/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Pague com Pix" })).toBeTruthy(); // o código continua na tela
    falhar = false;
    atual = recarga({ status: "CONFIRMADA", codigoPagamento: null });
    await passar(INTERVALO_CONSULTA_MS);
    expect(await screen.findByRole("heading", { name: "Recarga confirmada" })).toBeTruthy();
  });

  it("ao sair da tela, para de consultar", async () => {
    renderApp("/recarga");
    await screen.findByRole("heading", { name: "Recarregar" });
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await aguardando(u);
    cleanup();
    await passar(INTERVALO_CONSULTA_MS * 3);
    expect(backend.vezes("GET", "/recargas/r-1")).toBe(0);
  });

  it("se sair da tela com uma consulta no ar, a resposta tardia não reativa a consulta", async () => {
    renderApp("/recarga");
    await screen.findByRole("heading", { name: "Recarregar" });
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await aguardando(u);
    const lenta = backend.adiar("GET", "/recargas/r-1");
    await passar(INTERVALO_CONSULTA_MS); // a consulta sai e fica esperando
    cleanup(); // a pessoa sai da tela
    lenta.resolver({ status: 200, corpo: atual });
    await passar(INTERVALO_CONSULTA_MS * 3);
    expect(backend.vezes("GET", "/recargas/r-1")).toBe(1);
  });

  it("nova recarga depois do sucesso: volta ao formulário limpo", async () => {
    const u = await abrir();
    await aguardando(u);
    atual = recarga({ status: "CONFIRMADA", codigoPagamento: null });
    await passar(INTERVALO_CONSULTA_MS);
    await u.click(await screen.findByRole("button", { name: "Fazer outra recarga" }));
    expect(screen.getByRole("heading", { name: "Recarregar" })).toBeTruthy();
    expect((screen.getByLabelText(/Valor da recarga/) as HTMLInputElement).value).toBe("20"); // o último valor continua sugerido
  });
});

describe("simulação (só desenvolvimento)", () => {
  beforeEach(() => {
    atual = recarga({ simulacao: true });
  });

  it("mostra os botões de simulação", async () => {
    const u = await abrir();
    await aguardando(u);
    expect(screen.getByRole("button", { name: "Simular pagamento aprovado" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Simular pagamento recusado" })).toBeTruthy();
  });

  it("aprovado: chama o servidor e mostra a recarga confirmada na hora", async () => {
    backend.rota("POST", "/dev/recargas/r-1/simular", () => {
      atual = recarga({ simulacao: true, status: "CONFIRMADA", codigoPagamento: null });
      return { status: 200, corpo: { resultado: "CREDITADA" } };
    }, { protegida: true });
    const u = await abrir();
    await aguardando(u);
    await u.click(screen.getByRole("button", { name: "Simular pagamento aprovado" }));
    expect(await screen.findByRole("heading", { name: "Recarga confirmada" })).toBeTruthy();
    expect(backend.chamadas.find((c) => c.caminho === "/dev/recargas/r-1/simular")?.corpo).toEqual({ resultado: "CONFIRMADA" });
  });

  it("recusado: mostra a falha com o motivo", async () => {
    backend.rota("POST", "/dev/recargas/r-1/simular", () => {
      atual = recarga({ simulacao: true, status: "RECUSADA", motivoFalha: "Pagamento recusado pelo banco (simulação).", codigoPagamento: null });
      return { status: 200, corpo: { resultado: "RECUSADA" } };
    }, { protegida: true });
    const u = await abrir();
    await aguardando(u);
    await u.click(screen.getByRole("button", { name: "Simular pagamento recusado" }));
    expect(await screen.findByText("Pagamento recusado pelo banco (simulação).")).toBeTruthy();
    expect(backend.chamadas.find((c) => c.caminho === "/dev/recargas/r-1/simular")?.corpo).toEqual({ resultado: "RECUSADA" });
  });

  it("erro ao simular: mostra a mensagem e continua aguardando", async () => {
    backend.rota("POST", "/dev/recargas/r-1/simular", { status: 404, corpo: { mensagem: "Recarga não encontrada." } }, { protegida: true });
    const u = await abrir();
    await aguardando(u);
    await u.click(screen.getByRole("button", { name: "Simular pagamento aprovado" }));
    expect(await screen.findByText("Recarga não encontrada.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Pague com Pix" })).toBeTruthy();
  });
});

describe("retomar a recarga depois de recarregar a página", () => {
  it("com uma recarga pendente guardada: mostra carregando e depois o pagamento, sem criar outra", async () => {
    sessionStorage.setItem("rumine_recarga_pendente", "r-1");
    const lenta = backend.adiar("GET", "/recargas/r-1");
    renderApp("/recarga");
    expect(await screen.findByRole("status", { name: "Carregando recarga" })).toBeTruthy();
    lenta.resolver({ status: 200, corpo: atual });
    expect(await screen.findByRole("heading", { name: "Pague com Pix" })).toBeTruthy();
    expect(screen.getByText("PIX-SIMULADO-2000-ABCD1234")).toBeTruthy();
    expect(pedidos()).toHaveLength(0);
  });

  it("se a recarga guardada já terminou, mostra o formulário e esquece dela", async () => {
    sessionStorage.setItem("rumine_recarga_pendente", "r-1");
    atual = recarga({ status: "CONFIRMADA", codigoPagamento: null });
    renderApp("/recarga");
    expect(await screen.findByRole("heading", { name: "Recarregar" })).toBeTruthy();
    expect(sessionStorage.getItem("rumine_recarga_pendente")).toBeNull();
  });

  it("se não der para consultar a guardada, mostra o formulário", async () => {
    sessionStorage.setItem("rumine_recarga_pendente", "r-1");
    backend.rota("GET", "/recargas/r-1", { status: 404, corpo: { mensagem: "Recarga não encontrada." } }, { protegida: true });
    renderApp("/recarga");
    expect(await screen.findByRole("heading", { name: "Recarregar" })).toBeTruthy();
    expect(sessionStorage.getItem("rumine_recarga_pendente")).toBeNull();
  });

  it("guarda só o id (nunca o código de pagamento) e esquece quando termina", async () => {
    const u = await abrir();
    await aguardando(u);
    expect(sessionStorage.getItem("rumine_recarga_pendente")).toBe("r-1");
    expect(JSON.stringify(Object.entries(sessionStorage))).not.toContain("PIX-SIMULADO");
    atual = recarga({ status: "CONFIRMADA", codigoPagamento: null });
    await passar(INTERVALO_CONSULTA_MS);
    await screen.findByRole("heading", { name: "Recarga confirmada" });
    await waitFor(() => expect(sessionStorage.getItem("rumine_recarga_pendente")).toBeNull());
  });
});

describe("acesso", () => {
  it.each(["OPERADOR", "ADMIN", "MESTRE"] as const)("%s não abre a tela de recarga", async (perfil) => {
    backend.sessao.usuario = { ...backend.sessao.usuario, perfil };
    renderApp("/recarga");
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Recarregar" })).toBeNull());
    expect(pedidos()).toHaveLength(0);
  });
});
