// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { criarBackendFalso, type BackendFalso } from "../../testes/backendFalso";
import { renderApp } from "../../testes/renderApp";
import { VOLTAR_A_LER_MS } from "./Leitura";

// A câmera não existe no teste: o leitor vira dois botões que disparam o que a lib dispararia.
vi.mock("@yudiel/react-qr-scanner", () => ({
  Scanner: (props: { onScan: (c: { rawValue: string }[]) => void; onError?: (e: unknown) => void }) => (
    <div>
      <button onClick={() => props.onScan([{ rawValue: "token-lido" }])}>detectar QR</button>
      <button onClick={() => { props.onScan([{ rawValue: "token-lido" }]); props.onScan([{ rawValue: "token-lido" }]); }}>detectar QR duas vezes</button>
      <button onClick={() => props.onScan([])}>detectar nada</button>
      <button onClick={() => props.onError?.({ name: "NotAllowedError" })}>camera negada</button>
      <button onClick={() => props.onError?.({ name: "NotFoundError" })}>sem camera</button>
    </div>
  ),
}));

let backend: BackendFalso;
const OPERADOR = { id: "00000000-0000-4000-8000-000000000002", nome: "Operador", email: "op@rumine.demo", perfil: "OPERADOR" as const, categoria: "SERVIDOR" as const, status: "ATIVO" as const };

const liberado = { resultado: "LIBERADO", liberado: true, mensagem: "Liberado", aluno: { nome: "Maria da Silva" }, valorCobradoCentavos: 350 };
const negado = (resultado: string, mensagem: string) => ({ resultado, liberado: false, mensagem, aluno: { nome: "Maria da Silva" } });
const passar = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const leituras = () => backend.chamadas.filter((c) => c.caminho === "/leituras");

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  backend = criarBackendFalso({ logado: true, usuario: OPERADOR });
  backend.rota("POST", "/leituras", { status: 200, corpo: liberado }, { protegida: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const abrir = async () => {
  renderApp("/operador/leitura");
  await screen.findByRole("heading", { name: "Ler QR Code" });
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
};

describe("leitura pela câmera", () => {
  it("lê o QR, envia o código e mostra 'Liberado' com o nome e o valor", async () => {
    const u = await abrir();
    expect(screen.getByText("Aponte a câmera para o QR Code do aluno.")).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "detectar QR" }));
    expect(await screen.findByRole("heading", { name: "Liberado" })).toBeTruthy();
    expect(screen.getByText("Maria da Silva")).toBeTruthy();
    expect(screen.getByText("Cobrado R$ 3,50")).toBeTruthy();
    expect(leituras()).toHaveLength(1);
    expect(leituras()[0]!.corpo).toEqual({ token: "token-lido" });
  });

  it("a câmera detectando o mesmo QR duas vezes seguidas envia uma leitura só", async () => {
    const u = await abrir();
    await u.click(screen.getByRole("button", { name: "detectar QR duas vezes" }));
    await screen.findByRole("heading", { name: "Liberado" });
    expect(leituras()).toHaveLength(1);
  });

  it("detecção vazia não chama o servidor", async () => {
    const u = await abrir();
    await u.click(screen.getByRole("button", { name: "detectar nada" }));
    expect(leituras()).toHaveLength(0);
  });

  it("enquanto confere, mostra o carregando e ignora novas detecções", async () => {
    const lento = backend.adiar("POST", "/leituras");
    const u = await abrir();
    await u.click(screen.getByRole("button", { name: "detectar QR" }));
    expect(screen.getByRole("status", { name: "Conferindo o código" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "detectar QR" })).toBeNull(); // o leitor sai de cena
    lento.resolver({ status: 200, corpo: liberado });
    expect(await screen.findByRole("heading", { name: "Liberado" })).toBeTruthy();
    expect(leituras()).toHaveLength(1);
  });

  it("aluno PAE: mostra refeição isenta", async () => {
    backend.rota("POST", "/leituras", { status: 200, corpo: { ...liberado, valorCobradoCentavos: 0 } }, { protegida: true });
    const u = await abrir();
    await u.click(screen.getByRole("button", { name: "detectar QR" }));
    expect(await screen.findByText("Refeição isenta (PAE)")).toBeTruthy();
  });

  it.each([
    ["NEGADO_SALDO", "Saldo insuficiente"],
    ["NEGADO_TOKEN_EXPIRADO", "QR Code expirado. Peça para o aluno atualizar o código."],
    ["NEGADO_TOKEN_USADO", "QR Code já utilizado. Peça um código novo."],
    ["NEGADO_TOKEN_INVALIDO", "QR Code inválido"],
    ["NEGADO_CADASTRO_INATIVO", "Cadastro do aluno não está ativo"],
  ])("%s: mostra 'Negado' e o motivo em português", async (resultado, mensagem) => {
    backend.rota("POST", "/leituras", { status: 200, corpo: negado(resultado, mensagem) }, { protegida: true });
    const u = await abrir();
    await u.click(screen.getByRole("button", { name: "detectar QR" }));
    expect(await screen.findByRole("heading", { name: "Negado" })).toBeTruthy();
    expect(screen.getByText(mensagem)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Liberado" })).toBeNull();
  });
});

describe("depois do resultado", () => {
  it("'Ler próximo' volta ao leitor", async () => {
    const u = await abrir();
    await u.click(screen.getByRole("button", { name: "detectar QR" }));
    await screen.findByRole("heading", { name: "Liberado" });
    await u.click(screen.getByRole("button", { name: "Ler próximo" }));
    expect(screen.getByRole("button", { name: "detectar QR" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Liberado" })).toBeNull();
  });

  it("volta a ler sozinho depois de alguns segundos, e não antes", async () => {
    const u = await abrir();
    await u.click(screen.getByRole("button", { name: "detectar QR" }));
    await screen.findByRole("heading", { name: "Liberado" });
    await passar(VOLTAR_A_LER_MS - 1500);
    expect(screen.getByRole("heading", { name: "Liberado" })).toBeTruthy();
    await passar(2500);
    expect(screen.getByRole("button", { name: "detectar QR" })).toBeTruthy();
  });

  it("dá para ler vários alunos em seguida", async () => {
    const u = await abrir();
    for (let i = 1; i <= 3; i++) {
      await u.click(screen.getByRole("button", { name: "detectar QR" }));
      await screen.findByRole("heading", { name: "Liberado" });
      await u.click(screen.getByRole("button", { name: "Ler próximo" }));
    }
    expect(leituras()).toHaveLength(3);
  });
});

describe("erros", () => {
  it("rede caída: mostra o erro e 'Tentar de novo' volta ao leitor", async () => {
    backend.rota("POST", "/leituras", new Error("sem rede"), { protegida: true });
    const u = await abrir();
    await u.click(screen.getByRole("button", { name: "detectar QR" }));
    expect(await screen.findByText(/Não foi possível conectar ao servidor/)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(screen.getByRole("button", { name: "detectar QR" })).toBeTruthy();
  });

  it("preço não configurado (409): mostra a mensagem da API", async () => {
    backend.rota("POST", "/leituras", { status: 409, corpo: { mensagem: "O preço da refeição não está configurado. Avise o Admin." } }, { protegida: true });
    const u = await abrir();
    await u.click(screen.getByRole("button", { name: "detectar QR" }));
    expect(await screen.findByText(/preço da refeição não está configurado/)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Liberado" })).toBeNull();
  });

  it("câmera negada: explica e oferece colar o código", async () => {
    const u = await abrir();
    await u.click(screen.getByRole("button", { name: "camera negada" }));
    expect(await screen.findByText(/Permita o uso da câmera/)).toBeTruthy();
    expect(screen.getByLabelText("Código do QR")).toBeTruthy();
  });

  it("câmera inexistente: mensagem própria", async () => {
    const u = await abrir();
    await u.click(screen.getByRole("button", { name: "sem camera" }));
    expect(await screen.findByText(/Não foi possível abrir a câmera/)).toBeTruthy();
  });
});

describe("colar o código manualmente", () => {
  it("envia o código colado (sem espaços nas pontas) e mostra o resultado", async () => {
    const u = await abrir();
    await u.click(screen.getByRole("button", { name: "Colar o código manualmente" }));
    const botao = screen.getByRole("button", { name: "Conferir código" }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true); // vazio não envia
    await u.type(screen.getByLabelText("Código do QR"), "  abc.def.ghi  ");
    await u.click(botao);
    expect(await screen.findByRole("heading", { name: "Liberado" })).toBeTruthy();
    expect(leituras()[0]!.corpo).toEqual({ token: "abc.def.ghi" });
  });
});

describe("perfil", () => {
  it("a tela é do Operador: um aluno que abre /operador/leitura é levado ao Início", async () => {
    cleanup();
    backend = criarBackendFalso({ logado: true });
    renderApp("/operador/leitura");
    expect(await screen.findByRole("heading", { name: "Início" })).toBeTruthy();
    expect(leituras()).toHaveLength(0);
  });
});
