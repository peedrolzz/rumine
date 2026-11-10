import { afterEach, describe, expect, it, vi } from "vitest";
import { ErroApi, requisitar } from "./cliente";

const resposta = (status: number, corpo?: unknown, textoBruto?: string) =>
  new Response(textoBruto ?? (corpo === undefined ? null : JSON.stringify(corpo)), { status });

const simular = (r: Response | Error) => {
  const fetchFalso = vi.fn(async () => {
    if (r instanceof Error) throw r;
    return r;
  });
  vi.stubGlobal("fetch", fetchFalso);
  return fetchFalso;
};

afterEach(() => vi.unstubAllGlobals());

// Executa a requisição esperando falha e devolve o erro já tipado.
async function falhar(): Promise<ErroApi> {
  try {
    await requisitar("/x");
  } catch (e) {
    return e as ErroApi;
  }
  throw new Error("A requisição deveria ter falhado.");
}

describe("requisitar", () => {
  it("devolve o JSON em caso de sucesso e envia o cookie de sessão", async () => {
    const f = simular(resposta(200, { ok: true }));
    await expect(requisitar("/x")).resolves.toEqual({ ok: true });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/x$/);
    expect(init.credentials).toBe("include");
    expect(init.method).toBe("GET");
  });

  it("envia o corpo como JSON com o cabeçalho certo", async () => {
    const f = simular(resposta(200, {}));
    await requisitar("/x", { metodo: "PUT", corpo: { a: 1 } });
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.method).toBe("PUT");
    expect(init.body).toBe('{"a":1}');
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
  });

  it("erro com campo vira ErroApi com status, campo e mensagem da API", async () => {
    simular(resposta(400, { campo: "suco", mensagem: 'Preencha o campo "Suco".' }));
    const erro = await falhar();
    expect(erro).toBeInstanceOf(ErroApi);
    expect(erro).toMatchObject({ status: 400, campo: "suco", message: 'Preencha o campo "Suco".' });
  });

  it("404 mantém o status (a tela usa isso para o estado vazio)", async () => {
    simular(resposta(404, { mensagem: "O cardápio desta data ainda não foi publicado." }));
    const erro = await falhar();
    expect(erro.status).toBe(404);
    expect(erro.campo).toBeUndefined();
  });

  it("corpo de erro que não é JSON (ex.: página HTML de um proxy) dá mensagem genérica em português", async () => {
    simular(resposta(502, undefined, "<html>Bad Gateway</html>"));
    const erro = await falhar();
    expect(erro).toBeInstanceOf(ErroApi);
    expect(erro.status).toBe(502);
    expect(erro.message).toBe("Algo deu errado. Tente novamente.");
  });

  it("erro sem mensagem na resposta usa a mensagem genérica", async () => {
    simular(resposta(500, {}));
    const erro = await falhar();
    expect(erro.message).toBe("Algo deu errado. Tente novamente.");
  });

  it("servidor fora do ar (falha de rede) vira ErroApi status 0 sem mensagem técnica", async () => {
    simular(new TypeError("Failed to fetch"));
    const erro = await falhar();
    expect(erro).toBeInstanceOf(ErroApi);
    expect(erro.status).toBe(0);
    expect(erro.message).toMatch(/conectar ao servidor/);
    expect(erro.message).not.toMatch(/fetch/i);
  });
});
