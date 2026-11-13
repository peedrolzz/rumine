import { describe, expect, it } from "vitest";
import { garantirArquivoDeclaracao } from "./reparo.js";

const CHAVE = "f07b9b5c-d755-4a44-b070-ddf41be73b83";
const PDF = Buffer.from("%PDF-1.4 demo");

function armazenamentoFalso(inicial: Record<string, Buffer> = {}) {
  const arquivos = new Map(Object.entries(inicial));
  return {
    arquivos,
    ler: async (chave: string) => arquivos.get(chave) ?? null,
    salvar: async (chave: string, conteudo: Buffer) => {
      if (arquivos.has(chave)) throw new Error("já existe"); // como o armazenamento em disco (flag wx)
      arquivos.set(chave, conteudo);
    },
  };
}

describe("garantirArquivoDeclaracao", () => {
  it("arquivo sumiu (volume novo): recoloca com a mesma chave e avisa", async () => {
    const a = armazenamentoFalso();
    expect(await garantirArquivoDeclaracao(a, CHAVE, PDF)).toBe(true);
    expect(a.arquivos.get(CHAVE)).toEqual(PDF);
  });

  it("arquivo existe: não mexe em nada (nem sobrescreve)", async () => {
    const original = Buffer.from("%PDF-1.4 do aluno");
    const a = armazenamentoFalso({ [CHAVE]: original });
    expect(await garantirArquivoDeclaracao(a, CHAVE, PDF)).toBe(false);
    expect(a.arquivos.get(CHAVE)).toEqual(original);
  });

  it("é idempotente: a segunda chamada não faz nada", async () => {
    const a = armazenamentoFalso();
    await garantirArquivoDeclaracao(a, CHAVE, PDF);
    expect(await garantirArquivoDeclaracao(a, CHAVE, PDF)).toBe(false);
  });
});
