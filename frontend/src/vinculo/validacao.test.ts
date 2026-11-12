import { describe, expect, it } from "vitest";
import { LIMITE_BYTES, formatarTamanho, validarVinculo } from "./validacao";

const arquivo = (nome: string, bytes = 10) => {
  const f = new File(["x"], nome);
  Object.defineProperty(f, "size", { value: bytes });
  return f;
};

describe("validarVinculo", () => {
  it("tudo certo: sem erros", () => {
    expect(validarVinculo("a2345678", arquivo("d.pdf"))).toEqual({});
  });

  it("aceita RA em maiúsculas e com espaços nas pontas", () => {
    expect(validarVinculo("  A2345678 ", arquivo("d.pdf"))).toEqual({});
  });

  it.each(["", "   "])("RA vazio %j", (ra) => {
    expect(validarVinculo(ra, arquivo("d.pdf")).identificador).toBe("Informe seu RA.");
  });

  it.each(["12345", "1234567890123", "a 2345678", "a-2345678", "ã2345678", "a2345678;"])("RA %j inválido", (ra) => {
    expect(validarVinculo(ra, arquivo("d.pdf")).identificador).toMatch(/letras e números/);
  });

  it("limites do RA: 6 e 12 caracteres passam", () => {
    expect(validarVinculo("123456", arquivo("d.pdf")).identificador).toBeUndefined();
    expect(validarVinculo("a".repeat(12), arquivo("d.pdf")).identificador).toBeUndefined();
    expect(validarVinculo("a".repeat(13), arquivo("d.pdf")).identificador).toBeDefined();
  });

  it("sem arquivo", () => {
    expect(validarVinculo("a2345678", null).declaracao).toBe("Escolha o arquivo da declaração.");
  });

  it.each(["d.pdf", "d.PDF", "d.jpg", "d.JPEG", "d.png", "minha declaração.final.pdf"])("extensão aceita: %s", (nome) => {
    expect(validarVinculo("a2345678", arquivo(nome)).declaracao).toBeUndefined();
  });

  it.each(["d.txt", "d.exe", "d.gif", "d.docx", "d", "pdf", "d.pdf.exe", "d.pdf "])("extensão recusada: %j", (nome) => {
    expect(validarVinculo("a2345678", arquivo(nome)).declaracao).toBe("Envie a declaração em PDF, JPG ou PNG.");
  });

  it("limite de 5 MB: exato passa, um byte a mais não", () => {
    expect(LIMITE_BYTES).toBe(5 * 1024 * 1024);
    expect(validarVinculo("a2345678", arquivo("d.pdf", LIMITE_BYTES)).declaracao).toBeUndefined();
    expect(validarVinculo("a2345678", arquivo("d.pdf", LIMITE_BYTES + 1)).declaracao).toBe(
      "O arquivo é grande demais. O limite é de 5 MB.",
    );
  });

  it("arquivo vazio", () => {
    expect(validarVinculo("a2345678", arquivo("d.pdf", 0)).declaracao).toBe("O arquivo está vazio.");
  });

  it("devolve os dois erros juntos", () => {
    expect(Object.keys(validarVinculo("", null)).sort()).toEqual(["declaracao", "identificador"]);
  });
});

describe("formatarTamanho", () => {
  it.each([
    [0, "0 bytes"],
    [1023, "1023 bytes"],
    [1024, "1,0 KB"],
    [1536, "1,5 KB"],
    [1024 * 1024 - 1, "1024,0 KB"],
    [1024 * 1024, "1,0 MB"],
    [2.5 * 1024 * 1024, "2,5 MB"],
    [5 * 1024 * 1024, "5,0 MB"],
  ])("%d bytes -> %s", (bytes, texto) => {
    expect(formatarTamanho(bytes)).toBe(texto);
  });
});
