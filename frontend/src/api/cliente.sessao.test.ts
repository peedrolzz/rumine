import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { aoNaoAutenticado, ErroApi, requisitar } from "./cliente";

const simular = (r: Response) => {
  const f = vi.fn(async () => r);
  vi.stubGlobal("fetch", f);
  return f;
};
const json = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status });

let remover: (() => void) | undefined;
afterEach(() => {
  remover?.();
  remover = undefined;
  vi.unstubAllGlobals();
});

describe("resposta sem corpo (204)", () => {
  it("devolve undefined em vez de quebrar ao ler JSON (logout)", async () => {
    simular(new Response(null, { status: 204 }));
    await expect(requisitar("/auth/logout", { metodo: "POST" })).resolves.toBeUndefined();
  });

  it("uma resposta 200 sem corpo válido continua sendo erro de leitura, não 204", async () => {
    simular(new Response("", { status: 200 }));
    await expect(requisitar("/x")).rejects.toBeInstanceOf(SyntaxError);
  });
});

describe("código do erro", () => {
  it("expõe o código da API (ex.: SESSAO_EXPIRADA)", async () => {
    simular(json(401, { codigo: "SESSAO_EXPIRADA", mensagem: "Sua sessão expirou. Entre novamente." }));
    const erro = (await requisitar("/auth/me").catch((e: unknown) => e)) as ErroApi;
    expect(erro).toBeInstanceOf(ErroApi);
    expect(erro).toMatchObject({ status: 401, codigo: "SESSAO_EXPIRADA", message: "Sua sessão expirou. Entre novamente." });
  });

  it("sem código na resposta, o código fica indefinido", async () => {
    simular(json(400, { campo: "email", mensagem: "Informe um e-mail válido." }));
    const erro = (await requisitar("/x").catch((e: unknown) => e)) as ErroApi;
    expect(erro.codigo).toBeUndefined();
    expect(erro.campo).toBe("email");
  });
});

describe("aviso de 401 (sessão acabou)", () => {
  let tratador: Mock<(erro: ErroApi) => void>;
  beforeEach(() => {
    tratador = vi.fn<(erro: ErroApi) => void>();
    remover = aoNaoAutenticado(tratador);
  });

  it("chama o tratador quando uma rota qualquer responde 401", async () => {
    simular(json(401, { mensagem: "Faça login para continuar." }));
    await requisitar("/historico").catch(() => {});
    expect(tratador).toHaveBeenCalledTimes(1);
    expect(tratador.mock.calls[0]![0]).toMatchObject({ status: 401 });
  });

  it("passa o código da sessão expirada ao tratador", async () => {
    simular(json(401, { codigo: "SESSAO_EXPIRADA", mensagem: "Sua sessão expirou. Entre novamente." }));
    await requisitar("/auth/me").catch(() => {});
    expect(tratador.mock.calls[0]![0].codigo).toBe("SESSAO_EXPIRADA");
  });

  it("NÃO chama no login: lá o 401 é só senha errada", async () => {
    simular(json(401, { mensagem: "E-mail ou senha incorretos." }));
    await requisitar("/auth/login", { metodo: "POST", corpo: { email: "a", senha: "b" } }).catch(() => {});
    expect(tratador).not.toHaveBeenCalled();
  });

  it.each([400, 403, 404, 429, 500])("NÃO chama para o status %i", async (status) => {
    simular(json(status, { mensagem: "x" }));
    await requisitar("/x").catch(() => {});
    expect(tratador).not.toHaveBeenCalled();
  });

  it("NÃO chama quando o servidor está fora do ar (sem resposta)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    await requisitar("/x").catch(() => {});
    expect(tratador).not.toHaveBeenCalled();
  });

  it("o erro continua sendo lançado para quem chamou, além do aviso", async () => {
    simular(json(401, { mensagem: "Faça login para continuar." }));
    await expect(requisitar("/historico")).rejects.toMatchObject({ status: 401 });
  });

  it("depois de removido, o tratador não é mais chamado", async () => {
    remover!();
    simular(json(401, { mensagem: "x" }));
    await requisitar("/historico").catch(() => {});
    expect(tratador).not.toHaveBeenCalled();
  });

  it("remover um tratador antigo não desliga o tratador novo", async () => {
    const removerAntigo = remover!;
    const novo = vi.fn();
    remover = aoNaoAutenticado(novo);
    removerAntigo();
    simular(json(401, { mensagem: "x" }));
    await requisitar("/historico").catch(() => {});
    expect(novo).toHaveBeenCalledTimes(1);
  });

  it("sem tratador registrado, o 401 só vira erro normal (não quebra)", async () => {
    remover!();
    remover = undefined;
    simular(json(401, { mensagem: "x" }));
    await expect(requisitar("/historico")).rejects.toMatchObject({ status: 401 });
  });
});

describe("envio de arquivo (FormData)", () => {
  it("manda o formulário como está, sem Content-Type fixo (o navegador acrescenta o separador)", async () => {
    const f = simular(json(201, { status: "PENDENTE_APROVACAO" }));
    const corpo = new FormData();
    corpo.append("identificador", "a2345678");
    corpo.append("declaracao", new File(["x"], "d.pdf"));
    await requisitar("/vinculo", { metodo: "POST", corpo });
    const init = (f.mock.calls as unknown as [string, RequestInit][])[0]![1];
    expect(init.body).toBe(corpo);
    expect(init.headers).toEqual({});
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
  });

  it("corpo comum continua indo como JSON", async () => {
    const f = simular(json(200, {}));
    await requisitar("/x", { metodo: "POST", corpo: { a: 1 } });
    const init = (f.mock.calls as unknown as [string, RequestInit][])[0]![1];
    expect(init.body).toBe('{"a":1}');
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
  });
});
