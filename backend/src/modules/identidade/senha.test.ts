import { describe, expect, it } from "vitest";
import { primeiraRegraQuebrada, REGRAS_SENHA } from "./esquemas.js";
import { hasherArgon2 } from "./senha.js";
import { gerarToken, hashToken } from "./tokens.js";

describe("política de senha", () => {
  it.each([
    ["Senha@123", undefined],
    ["abcdefg1!", undefined],
    ["12345678!", undefined], // só números e símbolo também vale: a regra pede número e especial
    ["Sen@1abc", undefined], // exatamente 8 caracteres
    ["Sen@1ab", /8 caracteres/], // 7 caracteres
    ["", /8 caracteres/],
    ["senhasemnumero!", /número/],
    ["senhasemespecial1", /especial/],
    ["SenhaForte", /número/], // tem 10 caracteres; falta número
  ])("%j -> %s", (senha, esperado) => {
    const msg = primeiraRegraQuebrada(senha);
    if (esperado === undefined) expect(msg).toBeUndefined();
    else expect(msg).toMatch(esperado);
  });

  it("indica a primeira regra quebrada, na ordem tamanho, número, especial", () => {
    expect(primeiraRegraQuebrada("abc")).toMatch(/8 caracteres/);
    expect(primeiraRegraQuebrada("abcdefgh")).toMatch(/número/);
    expect(primeiraRegraQuebrada("abcdefg1")).toMatch(/especial/);
  });

  it("letra acentuada, espaço e dígito não contam como caractere especial", () => {
    expect(primeiraRegraQuebrada("ação1234")).toMatch(/especial/);
    expect(primeiraRegraQuebrada("senha 1234")).toMatch(/especial/);
    expect(primeiraRegraQuebrada("senha\t1234")).toMatch(/especial/);
  });

  it("pontuação e símbolos contam como especiais", () => {
    for (const c of "!@#$%^&*()-_=+[]{};:'\",.<>/?\\|`~€§") {
      expect(primeiraRegraQuebrada(`abcdefg1${c}`), `caractere ${c}`).toBeUndefined();
    }
  });

  it("cada regra tem uma mensagem em português que diz o que fazer", () => {
    for (const regra of REGRAS_SENHA) expect(regra.mensagem).toMatch(/^A senha precisa ter/);
  });
});

describe("hash de senha (Argon2 de verdade)", () => {
  it("gera Argon2id com sal, e o hash não contém a senha", async () => {
    const hash = await hasherArgon2.hash("Senha@123");
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=\d+,t=\d+,p=\d+\$/);
    expect(hash).not.toContain("Senha@123");
  });

  it("confere a senha certa e recusa a errada", async () => {
    const hash = await hasherArgon2.hash("Senha@123");
    expect(await hasherArgon2.verify(hash, "Senha@123")).toBe(true);
    expect(await hasherArgon2.verify(hash, "Senha@124")).toBe(false);
    expect(await hasherArgon2.verify(hash, "senha@123")).toBe(false);
    expect(await hasherArgon2.verify(hash, "")).toBe(false);
  });

  it("a mesma senha gera hashes diferentes (sal aleatório), e os dois conferem", async () => {
    const [a, b] = await Promise.all([hasherArgon2.hash("Senha@123"), hasherArgon2.hash("Senha@123")]);
    expect(a).not.toBe(b);
    expect(await hasherArgon2.verify(a, "Senha@123")).toBe(true);
    expect(await hasherArgon2.verify(b, "Senha@123")).toBe(true);
  });

  it("aceita senha de 128 caracteres e com acentos e emoji", async () => {
    for (const senha of ["a1!".repeat(42) + "xx", "Çãõ9!senhá", "senha1!😀"]) {
      const hash = await hasherArgon2.hash(senha);
      expect(await hasherArgon2.verify(hash, senha)).toBe(true);
    }
  });

  it.each(["sem-login-dev", "", "$argon2id$quebrado", "texto qualquer"])(
    "hash malformado (%j) nunca autentica e nunca lança exceção",
    async (hashRuim) => {
      await expect(hasherArgon2.verify(hashRuim, "qualquer")).resolves.toBe(false);
    },
  );
});

describe("tokens", () => {
  it("são aleatórios, longos e seguros para URL e cookie", () => {
    const tokens = Array.from({ length: 200 }, () => gerarToken());
    expect(new Set(tokens).size).toBe(200);
    for (const t of tokens) {
      expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes em base64url, sem preenchimento
    }
  });

  it("o hash é SHA-256 em hexadecimal, determinístico e diferente do token", () => {
    const token = gerarToken();
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(token);
    expect(hashToken(token)).not.toBe(hashToken(gerarToken()));
  });

  it("valor conhecido do SHA-256 (garante o algoritmo)", () => {
    expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
