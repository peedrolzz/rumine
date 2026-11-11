import { describe, expect, it } from "vitest";
import { criarEsquemaCadastro, DOMINIOS_PADRAO, esquemaConfirmacao, esquemaLogin, lerDominios } from "./esquemas.js";

const esquema = criarEsquemaCadastro(DOMINIOS_PADRAO);
const valido = { nome: "Maria da Silva", email: "maria@alunos.utfpr.edu.br", senha: "Senha@123" };

// Primeira mensagem de erro e o campo, ou undefined se passou.
const erro = (dados: unknown) => {
  const r = esquema.safeParse(dados);
  if (r.success) return undefined;
  const i = r.error.issues[0]!;
  return { campo: String(i.path[0]), mensagem: i.message };
};

describe("domínios permitidos", () => {
  it("o padrão do MVP é só @alunos.utfpr.edu.br", () => {
    expect(DOMINIOS_PADRAO).toEqual(["alunos.utfpr.edu.br"]);
    expect(lerDominios(undefined)).toEqual(["alunos.utfpr.edu.br"]);
    expect(lerDominios("")).toEqual(["alunos.utfpr.edu.br"]);
    expect(lerDominios("  , ,")).toEqual(["alunos.utfpr.edu.br"]);
  });

  it("lê uma lista separada por vírgulas, sem espaços nem maiúsculas", () => {
    expect(lerDominios(" Alunos.UTFPR.edu.br , professores.utfpr.edu.br ")).toEqual([
      "alunos.utfpr.edu.br",
      "professores.utfpr.edu.br",
    ]);
  });
});

describe("cadastro: e-mail", () => {
  it("aceita o e-mail institucional e normaliza (minúsculas e sem espaços)", () => {
    const r = esquema.parse({ ...valido, email: "  Maria.Silva@ALUNOS.UTFPR.EDU.BR  " });
    expect(r.email).toBe("maria.silva@alunos.utfpr.edu.br");
  });

  it.each([
    "maria@gmail.com",
    "maria@utfpr.edu.br",
    "maria@professores.utfpr.edu.br", // docentes ficam para depois do MVP
    "maria@alunos.utfpr.edu.br.evil.com", // domínio disfarçado no começo
    "maria@evilalunos.utfpr.edu.br", // domínio parecido
    "maria@sub.alunos.utfpr.edu.br", // subdomínio
    "maria@alunos.utfpr.edu.com",
  ])("recusa %s explicando o motivo", (email) => {
    const e = erro({ ...valido, email });
    expect(e?.campo).toBe("email");
    expect(e?.mensagem).toBe("Use seu e-mail institucional (@alunos.utfpr.edu.br).");
  });

  it.each(["", "maria", "maria@", "@alunos.utfpr.edu.br", "maria alunos@alunos.utfpr.edu.br", "a@b@alunos.utfpr.edu.br"])(
    "recusa formato inválido %j",
    (email) => {
      expect(erro({ ...valido, email })?.campo).toBe("email");
    },
  );

  it("recusa e-mail enorme sem processá-lo", () => {
    const e = erro({ ...valido, email: `${"a".repeat(300)}@alunos.utfpr.edu.br` });
    expect(e).toEqual({ campo: "email", mensagem: "O e-mail é longo demais." });
  });

  it("a mensagem cita todos os domínios quando há mais de um configurado", () => {
    const dois = criarEsquemaCadastro(["alunos.utfpr.edu.br", "professores.utfpr.edu.br"]);
    const r = dois.safeParse({ ...valido, email: "x@gmail.com" });
    expect(!r.success && r.error.issues[0]!.message).toBe(
      "Use seu e-mail institucional (@alunos.utfpr.edu.br ou @professores.utfpr.edu.br).",
    );
    expect(dois.safeParse({ ...valido, email: "x@professores.utfpr.edu.br" }).success).toBe(true);
  });
});

describe("cadastro: senha", () => {
  it.each([
    ["curta1!", "A senha precisa ter pelo menos 8 caracteres."],
    ["semnumero!", "A senha precisa ter pelo menos um número."],
    ["semespecial1", "A senha precisa ter pelo menos um caractere especial (por exemplo: ! @ # $ %)."],
  ])("recusa %j indicando a regra", (senha, mensagem) => {
    expect(erro({ ...valido, senha })).toEqual({ campo: "senha", mensagem });
  });

  it("não remove espaços da senha (ela é guardada exatamente como digitada)", () => {
    expect(esquema.parse({ ...valido, senha: "  Senha@123  " }).senha).toBe("  Senha@123  ");
  });

  it("aceita até 128 caracteres e recusa 129 (limite contra abuso do hash)", () => {
    const base = "a1!".repeat(42); // 126
    expect(esquema.safeParse({ ...valido, senha: base + "xx" }).success).toBe(true); // 128
    expect(erro({ ...valido, senha: base + "xxx" })).toEqual({
      campo: "senha",
      mensagem: "A senha pode ter no máximo 128 caracteres.",
    });
  });

  it.each([undefined, null, 12345678, ["Senha@123"], {}])("recusa senha que não é texto (%j)", (senha) => {
    expect(erro({ ...valido, senha })).toEqual({ campo: "senha", mensagem: "Informe uma senha." });
  });
});

describe("cadastro: nome", () => {
  it("remove espaços nas pontas", () => {
    expect(esquema.parse({ ...valido, nome: "  Maria da Silva  " }).nome).toBe("Maria da Silva");
  });

  it.each(["", "  ", "Ma"])("recusa nome curto %j", (nome) => {
    expect(erro({ ...valido, nome })).toEqual({ campo: "nome", mensagem: "Informe seu nome completo." });
  });

  it("aceita 100 caracteres e recusa 101", () => {
    expect(esquema.safeParse({ ...valido, nome: "a".repeat(100) }).success).toBe(true);
    expect(erro({ ...valido, nome: "a".repeat(101) })?.campo).toBe("nome");
  });

  it.each([undefined, null, 42])("recusa nome que não é texto (%j)", (nome) => {
    expect(erro({ ...valido, nome })).toEqual({ campo: "nome", mensagem: "Informe seu nome." });
  });
});

describe("cadastro: corpo", () => {
  it.each([undefined, null, [], "texto", 42])("corpo %j é recusado em português", (corpo) => {
    const e = erro(corpo);
    expect(e?.mensagem).toBe("Corpo da requisição inválido.");
  });

  it("ignora campos extras (ninguém define o próprio perfil ou status pelo cadastro)", () => {
    const r = esquema.parse({ ...valido, perfil: "ADMIN", status: "ATIVO", id: "x" });
    expect(Object.keys(r).sort()).toEqual(["email", "nome", "senha"]);
  });
});

describe("login", () => {
  it("normaliza o e-mail e não valida a senha contra a política", () => {
    expect(esquemaLogin.parse({ email: "  Maria@Alunos.UTFPR.edu.br ", senha: "x" })).toEqual({
      email: "maria@alunos.utfpr.edu.br",
      senha: "x",
    });
  });

  it.each([{}, { email: "a@b" }, { senha: "x" }, { email: "", senha: "x" }, { email: "a@b", senha: "" }, { email: 1, senha: 2 }])(
    "recusa %j com a mesma mensagem",
    (corpo) => {
      const r = esquemaLogin.safeParse(corpo);
      expect(!r.success && r.error.issues[0]!.message).toBe("Informe e-mail e senha.");
    },
  );
});

describe("confirmação de e-mail", () => {
  it("aceita um token e recusa vazio, ausente ou gigante", () => {
    expect(esquemaConfirmacao.safeParse({ token: "abc" }).success).toBe(true);
    for (const corpo of [{}, { token: "" }, { token: "a".repeat(201) }, { token: 1 }]) {
      const r = esquemaConfirmacao.safeParse(corpo);
      expect(!r.success && r.error.issues[0]!.message).toBe("Link de confirmação inválido.");
    }
  });
});
