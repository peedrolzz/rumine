import { describe, expect, it } from "vitest";
import { primeiraRegraQuebrada, REGRAS_SENHA, SENHA_MAX } from "./senha";
import { validarCadastro } from "./validacao";

// Mesmos casos do backend (backend/src/modules/identidade/senha.test.ts): se uma regra mudar
// de um lado, estes testes obrigam a conferir o outro.
describe("regras da senha (espelham o backend)", () => {
  it.each([
    ["Senha@123", undefined],
    ["abcdefg1!", undefined],
    ["12345678!", undefined],
    ["Sen@1abc", undefined], // exatamente 8 caracteres
    ["Sen@1ab", /8 caracteres/], // 7 caracteres
    ["", /8 caracteres/],
    ["senhasemnumero!", /número/],
    ["senhasemespecial1", /especial/],
    ["SenhaForte", /número/],
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

  it("as mensagens são iguais às do servidor (o que o usuário lê não muda entre a tela e a API)", () => {
    expect(REGRAS_SENHA.map((r) => r.mensagem)).toEqual([
      "A senha precisa ter pelo menos 8 caracteres.",
      "A senha precisa ter pelo menos um número.",
      "A senha precisa ter pelo menos um caractere especial (por exemplo: ! @ # $ %).",
    ]);
    expect(SENHA_MAX).toBe(128);
  });
});

describe("validarCadastro", () => {
  const valido = { nome: "Maria da Silva", email: "maria@alunos.utfpr.edu.br", senha: "Senha@123" };

  it("dados corretos não geram erro", () => {
    expect(validarCadastro(valido)).toEqual({});
  });

  it.each(["", "  ", "Ma", "  Ma  "])("nome curto %j", (nome) => {
    expect(validarCadastro({ ...valido, nome }).nome).toBe("Informe seu nome completo.");
  });

  it("nome com 3 letras (depois de tirar espaços) passa", () => {
    expect(validarCadastro({ ...valido, nome: "  Ana " }).nome).toBeUndefined();
  });

  it("e-mail vazio e formato inválido têm mensagens diferentes", () => {
    expect(validarCadastro({ ...valido, email: "" }).email).toBe("Informe seu e-mail.");
    expect(validarCadastro({ ...valido, email: "   " }).email).toBe("Informe seu e-mail.");
    for (const email of ["maria", "maria@", "@alunos.utfpr.edu.br", "maria alunos@x.com", "maria@x"]) {
      expect(validarCadastro({ ...valido, email }).email, email).toBe("Informe um e-mail válido.");
    }
  });

  it("o domínio institucional NÃO é conferido aqui: quem decide é o servidor", () => {
    expect(validarCadastro({ ...valido, email: "maria@gmail.com" }).email).toBeUndefined();
  });

  it("e-mail com espaços nas pontas é aceito (o envio apara)", () => {
    expect(validarCadastro({ ...valido, email: "  maria@alunos.utfpr.edu.br  " }).email).toBeUndefined();
  });

  it("senha fraca devolve a regra que falta", () => {
    expect(validarCadastro({ ...valido, senha: "curta1!" }).senha).toMatch(/8 caracteres/);
    expect(validarCadastro({ ...valido, senha: "semnumero!" }).senha).toMatch(/número/);
  });

  it("senha acima de 128 caracteres é recusada", () => {
    expect(validarCadastro({ ...valido, senha: "a1!".repeat(42) + "xx" }).senha).toBeUndefined(); // 128
    expect(validarCadastro({ ...valido, senha: "a1!".repeat(42) + "xxx" }).senha).toBe("A senha pode ter no máximo 128 caracteres.");
  });

  it("junta os erros de vários campos", () => {
    expect(Object.keys(validarCadastro({ nome: "", email: "", senha: "" })).sort()).toEqual(["email", "nome", "senha"]);
  });
});
