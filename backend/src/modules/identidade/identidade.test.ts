import { describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import type { Identificador } from "../../shared/auth.js";
import {
  criarEmailFalso,
  criarHasherFalso,
  criarRelogio,
  criarRepoIdentidadeFalso,
  hasherFalso,
} from "../../testes/identidadeFalsa.js";
import type { CardapioRepositorio } from "../cardapio/repositorio.js";
import { NOME_COOKIE_SESSAO } from "./rotas.js";
import { VALIDADE_SESSAO_MS, VALIDADE_TOKEN_EMAIL_MS } from "./servico.js";
import { gerarToken, hashToken } from "./tokens.js";

// ---------- montagem ----------
const ORIGEM = "http://localhost:5173";
const EMAIL = "maria@alunos.utfpr.edu.br";
const SENHA = "Senha@123";
const NOME = "Maria da Silva";
const SEGUNDO = 1000;
const DIA = 24 * 3_600_000;

const cardapioRepo: CardapioRepositorio = {
  async salvar(data, _usuario, itens) {
    return { data, itens };
  },
  async buscar() {
    return null;
  },
};

async function montar(opcoes: { producao?: boolean; identificar?: Identificador; usarArgon2?: boolean } = {}) {
  const banco = criarRepoIdentidadeFalso();
  const email = criarEmailFalso();
  const relogio = criarRelogio();
  const hasher = criarHasherFalso();
  const app = await buildApp({
    cardapioRepo,
    identidade: {
      repo: banco.repo,
      email: email.servico,
      agora: relogio.agora,
      ...(opcoes.usarArgon2 ? {} : { hasher }),
    },
    identificar: opcoes.identificar,
    origemFrontend: ORIGEM,
    producao: opcoes.producao ?? false,
    hoje: () => "2026-11-10",
  });
  return { app, banco, email, relogio, hasher };
}
type Contexto = Awaited<ReturnType<typeof montar>>;

const cadastrar = (c: Contexto, corpo: unknown, headers: Record<string, string> = {}) =>
  c.app.inject({ method: "POST", url: "/auth/cadastro", payload: corpo as object, headers });

const entrar = (
  c: Contexto,
  email: string,
  senha: string,
  extra: { ip?: string; headers?: Record<string, string> } = {},
) =>
  c.app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, senha },
    headers: extra.headers ?? {},
    ...(extra.ip ? { remoteAddress: extra.ip } : {}),
  });

const confirmar = (c: Contexto, token: unknown) =>
  c.app.inject({ method: "POST", url: "/auth/confirmar-email", payload: { token } as object });

const cookieDe = (r: { cookies: { name: string; value: string }[] }) => r.cookies.find((k) => k.name === NOME_COOKIE_SESSAO);
const comSessao = (token: string) => ({ cookie: `${NOME_COOKIE_SESSAO}=${token}` });
const eu = (c: Contexto, token?: string) =>
  c.app.inject({ method: "GET", url: "/auth/me", headers: token ? comSessao(token) : {} });

/** Cadastra e confirma o e-mail; devolve o usuário (agora em PENDENTE_APROVACAO). */
async function cadastrarEConfirmar(c: Contexto, email = EMAIL, senha = SENHA) {
  await cadastrar(c, { nome: NOME, email, senha });
  const token = c.email.ultimoToken()!;
  expect((await confirmar(c, token)).statusCode).toBe(200);
  return [...c.banco.usuarios.values()].find((u) => u.email === email)!;
}

/** Cadastra, confirma, ativa a conta (o Admin faz isso na HU-20) e entra; devolve o token da sessão. */
async function entrarComoAtivo(c: Contexto, email = EMAIL, senha = SENHA) {
  const usuario = await cadastrarEConfirmar(c, email, senha);
  usuario.status = "ATIVO";
  const r = await entrar(c, email, senha);
  expect(r.statusCode).toBe(200);
  return cookieDe(r)!.value;
}

// ---------- cadastro ----------
describe("POST /auth/cadastro", () => {
  it("cria a conta pendente de confirmação e manda o e-mail com o link", async () => {
    const c = await montar();
    const r = await cadastrar(c, { nome: NOME, email: EMAIL, senha: SENHA });

    expect(r.statusCode).toBe(201);
    expect(r.json().mensagem).toMatch(/Enviamos um e-mail para confirmar/);
    const usuario = [...c.banco.usuarios.values()][0]!;
    expect(usuario).toMatchObject({
      nome: NOME,
      email: EMAIL,
      perfil: "USUARIO", // ninguém vira admin pelo cadastro
      categoria: "DISCENTE",
      status: "PENDENTE_EMAIL",
    });
    expect(c.email.enviados).toHaveLength(1);
    expect(c.email.enviados[0]!.para).toBe(EMAIL);
    expect(c.email.enviados[0]!.texto).toContain(`${ORIGEM}/confirmar-email?token=`);
    expect(c.email.enviados[0]!.texto).toContain("24 horas");
  });

  it("não cria sessão nem cookie: só entra quem confirmar e fizer login", async () => {
    const c = await montar();
    const r = await cadastrar(c, { nome: NOME, email: EMAIL, senha: SENHA });
    expect(r.cookies).toHaveLength(0);
    expect(c.banco.sessoes).toHaveLength(0);
  });

  it("guarda a senha só como hash, e o token do e-mail só como hash", async () => {
    const c = await montar();
    await cadastrar(c, { nome: NOME, email: EMAIL, senha: SENHA });
    const usuario = [...c.banco.usuarios.values()][0]!;
    expect(usuario.senhaHash).toBe(hasherFalso.hashSync(SENHA));
    expect(usuario.senhaHash).not.toBe(SENHA);

    const token = c.email.ultimoToken()!;
    expect(c.banco.tokens).toHaveLength(1);
    expect(c.banco.tokens[0]!.tokenHash).toBe(hashToken(token));
    expect(c.banco.tokens[0]!.tokenHash).not.toBe(token);
  });

  it("a resposta não devolve a senha, hash, token nem dados do usuário", async () => {
    const c = await montar();
    const r = await cadastrar(c, { nome: NOME, email: EMAIL, senha: SENHA });
    expect(Object.keys(r.json())).toEqual(["mensagem"]);
    expect(r.body).not.toContain(SENHA);
    expect(r.body).not.toContain(c.email.ultimoToken()!);
  });

  it("normaliza o e-mail (minúsculas e sem espaços)", async () => {
    const c = await montar();
    await cadastrar(c, { nome: NOME, email: `  Maria@ALUNOS.utfpr.edu.br `, senha: SENHA });
    expect([...c.banco.usuarios.values()][0]!.email).toBe("maria@alunos.utfpr.edu.br");
  });

  describe("validações", () => {
    it.each(["maria@gmail.com", "maria@professores.utfpr.edu.br", "maria@alunos.utfpr.edu.br.evil.com"])(
      "e-mail fora do domínio institucional (%s): recusa e explica o motivo",
      async (email) => {
        const c = await montar();
        const r = await cadastrar(c, { nome: NOME, email, senha: SENHA });
        expect(r.statusCode).toBe(400);
        expect(r.json()).toEqual({
          campo: "email",
          mensagem: "Use seu e-mail institucional (@alunos.utfpr.edu.br).",
        });
        expect(c.banco.usuarios.size).toBe(0);
        expect(c.email.enviados).toHaveLength(0);
      },
    );

    it.each([
      ["curta1!", "A senha precisa ter pelo menos 8 caracteres."],
      ["semnumero!", "A senha precisa ter pelo menos um número."],
      ["semespecial1", "A senha precisa ter pelo menos um caractere especial (por exemplo: ! @ # $ %)."],
    ])("senha fraca %j: recusa e indica a regra", async (senha, mensagem) => {
      const c = await montar();
      const r = await cadastrar(c, { nome: NOME, email: EMAIL, senha });
      expect(r.statusCode).toBe(400);
      expect(r.json()).toEqual({ campo: "senha", mensagem });
      expect(c.banco.usuarios.size).toBe(0);
      expect(c.email.enviados).toHaveLength(0);
    });

    it("senha fraca nem chega a gastar processamento com hash", async () => {
      const c = await montar();
      await cadastrar(c, { nome: NOME, email: EMAIL, senha: "fraca" });
      expect(c.hasher.hash).not.toHaveBeenCalled();
    });

    it.each([undefined, null, [], "texto", {}])("corpo %j responde 400 em português, não 500", async (corpo) => {
      const c = await montar();
      const r = await c.app.inject({
        method: "POST",
        url: "/auth/cadastro",
        headers: { "content-type": "application/json" },
        ...(corpo === undefined ? {} : { payload: JSON.stringify(corpo) }),
      });
      expect(r.statusCode).toBe(400);
      expect(r.json().mensagem).not.toMatch(/Invalid|expected|received/i);
    });

    it("ignora perfil, status e id enviados no corpo", async () => {
      const c = await montar();
      await cadastrar(c, { nome: NOME, email: EMAIL, senha: SENHA, perfil: "ADMIN", status: "ATIVO", id: "x" });
      expect([...c.banco.usuarios.values()][0]).toMatchObject({ perfil: "USUARIO", status: "PENDENTE_EMAIL" });
    });
  });

  describe("e-mail que já tem conta", () => {
    it("responde exatamente igual a um cadastro novo (não revela quem tem conta)", async () => {
      const c = await montar();
      const novo = await cadastrar(c, { nome: NOME, email: EMAIL, senha: SENHA });
      (await c.banco.repo.buscarPorEmail(EMAIL))!.status = "ATIVO";
      const repetido = await cadastrar(c, { nome: "Outra Pessoa", email: EMAIL, senha: "Outra@Senha1" });

      expect(repetido.statusCode).toBe(novo.statusCode);
      expect(repetido.body).toBe(novo.body);
      expect(repetido.cookies).toEqual(novo.cookies);
    });

    it("não altera nem cria nada, e avisa o dono do e-mail", async () => {
      const c = await montar();
      const usuario = c.banco.semear({ email: EMAIL, senha: SENHA, nome: NOME });
      const antes = { ...usuario };
      await cadastrar(c, { nome: "Invasor Qualquer", email: EMAIL, senha: "Invasor@123" });

      expect(c.banco.usuarios.size).toBe(1);
      expect({ ...usuario }).toEqual(antes); // nome e senha intactos
      expect(c.banco.tokens).toHaveLength(0);
      expect(c.email.enviados).toHaveLength(1);
      expect(c.email.enviados[0]).toMatchObject({ para: EMAIL, assunto: "Você já tem uma conta no RU Mine" });
      expect(c.email.ultimoToken()).toBeUndefined(); // o aviso não leva link de confirmação
    });

    it.each(["PENDENTE_APROVACAO", "ATIVO", "REJEITADO", "DESATIVADO"] as const)(
      "conta %s: não é recadastrada nem muda de status",
      async (status) => {
        const c = await montar();
        const usuario = c.banco.semear({ email: EMAIL, senha: SENHA, status });
        await cadastrar(c, { nome: NOME, email: EMAIL, senha: "Nova@Senha1" });
        expect(usuario.status).toBe(status);
        expect(usuario.senhaHash).toBe(hasherFalso.hashSync(SENHA));
      },
    );

    it("o tempo de resposta não revela a existência: o hash é calculado nos dois casos", async () => {
      const c = await montar();
      await cadastrar(c, { nome: NOME, email: EMAIL, senha: SENHA });
      expect(c.hasher.hash).toHaveBeenCalledTimes(1);
      c.banco.usuarios.values().next().value!.status = "ATIVO";
      await cadastrar(c, { nome: NOME, email: EMAIL, senha: SENHA });
      expect(c.hasher.hash).toHaveBeenCalledTimes(2);
    });

    it("conta ainda não confirmada: novo cadastro vale o último nome e senha, com novo link", async () => {
      const c = await montar();
      await cadastrar(c, { nome: "Nome Antigo", email: EMAIL, senha: "Antiga@123" });
      const linkAntigo = c.email.ultimoToken()!;
      await cadastrar(c, { nome: "Nome Novo", email: EMAIL, senha: "Nova@Senha1" });
      const linkNovo = c.email.ultimoToken()!;

      const usuario = [...c.banco.usuarios.values()][0]!;
      expect(c.banco.usuarios.size).toBe(1);
      expect(usuario.nome).toBe("Nome Novo");
      expect(usuario.senhaHash).toBe(hasherFalso.hashSync("Nova@Senha1"));
      expect(linkNovo).not.toBe(linkAntigo);
      expect(c.email.enviados).toHaveLength(2);

      expect((await confirmar(c, linkAntigo)).statusCode).toBe(400); // o link antigo deixou de valer
      expect((await confirmar(c, linkNovo)).statusCode).toBe(200);
    });

    it("dois cadastros simultâneos do mesmo e-mail resultam em uma conta e um link válido", async () => {
      const c = await montar();
      const [a, b] = await Promise.all([
        cadastrar(c, { nome: NOME, email: EMAIL, senha: "Primeira@123" }),
        cadastrar(c, { nome: NOME, email: EMAIL, senha: "Segunda@123" }),
      ]);
      expect([a.statusCode, b.statusCode]).toEqual([201, 201]);
      expect(c.banco.usuarios.size).toBe(1);
      expect(c.banco.tokens.filter((t) => t.usadoEm === null)).toHaveLength(1);
      expect((await confirmar(c, c.email.ultimoToken()!)).statusCode).toBe(200);
    });
  });

  it("falha do banco vira 500 genérico, sem vazar detalhes", async () => {
    const c = await montar();
    c.banco.repo.buscarPorEmail = async () => {
      throw new Error("connection refused 10.0.0.5 segredo");
    };
    const r = await cadastrar(c, { nome: NOME, email: EMAIL, senha: SENHA });
    expect(r.statusCode).toBe(500);
    expect(r.json()).toEqual({ mensagem: "Erro interno. Tente novamente em instantes." });
    expect(r.body).not.toMatch(/segredo|10\.0\.0\.5/);
  });
});

// ---------- confirmação ----------
describe("POST /auth/confirmar-email", () => {
  it("confirma o e-mail: a conta passa a aguardar a aprovação do Admin", async () => {
    const c = await montar();
    await cadastrar(c, { nome: NOME, email: EMAIL, senha: SENHA });
    const r = await confirmar(c, c.email.ultimoToken());

    expect(r.statusCode).toBe(200);
    expect(r.json().mensagem).toBe("E-mail confirmado! Seu cadastro agora aguarda a aprovação do Admin.");
    expect([...c.banco.usuarios.values()][0]!.status).toBe("PENDENTE_APROVACAO");
    expect(r.cookies).toHaveLength(0); // confirmar não faz login
  });

  it("o link é de uso único", async () => {
    const c = await montar();
    await cadastrar(c, { nome: NOME, email: EMAIL, senha: SENHA });
    const token = c.email.ultimoToken()!;
    expect((await confirmar(c, token)).statusCode).toBe(200);
    const segunda = await confirmar(c, token);
    expect(segunda.statusCode).toBe(400);
    expect(segunda.json().mensagem).toMatch(/inválido ou expirou/);
  });

  it("clicar duas vezes ao mesmo tempo confirma uma só vez", async () => {
    const c = await montar();
    await cadastrar(c, { nome: NOME, email: EMAIL, senha: SENHA });
    const token = c.email.ultimoToken()!;
    const respostas = await Promise.all([confirmar(c, token), confirmar(c, token)]);
    expect(respostas.map((r) => r.statusCode).sort()).toEqual([200, 400]);
  });

  it("recusa token que não existe, inventado ou de outro formato", async () => {
    const c = await montar();
    await cadastrar(c, { nome: NOME, email: EMAIL, senha: SENHA });
    for (const token of [gerarToken(), "abc", "' OR 1=1 --", "../../etc/passwd"]) {
      const r = await confirmar(c, token);
      expect(r.statusCode).toBe(400);
      expect(r.json().mensagem).toMatch(/inválido ou expirou/);
    }
    expect([...c.banco.usuarios.values()][0]!.status).toBe("PENDENTE_EMAIL");
  });

  it("não aceita o hash guardado no banco no lugar do token", async () => {
    const c = await montar();
    await cadastrar(c, { nome: NOME, email: EMAIL, senha: SENHA });
    const r = await confirmar(c, c.banco.tokens[0]!.tokenHash);
    expect(r.statusCode).toBe(400);
  });

  it("vale por 24 horas: um instante antes funciona, no limite já expirou", async () => {
    const c = await montar();
    await cadastrar(c, { nome: NOME, email: EMAIL, senha: SENHA });
    const token = c.email.ultimoToken()!;
    c.relogio.avancar(VALIDADE_TOKEN_EMAIL_MS);
    const expirado = await confirmar(c, token);
    expect(expirado.statusCode).toBe(400);
    expect([...c.banco.usuarios.values()][0]!.status).toBe("PENDENTE_EMAIL");

    const c2 = await montar();
    await cadastrar(c2, { nome: NOME, email: EMAIL, senha: SENHA });
    const token2 = c2.email.ultimoToken()!;
    c2.relogio.avancar(VALIDADE_TOKEN_EMAIL_MS - 1);
    expect((await confirmar(c2, token2)).statusCode).toBe(200);
  });

  it("depois de expirar, cadastrar de novo gera um link novo que funciona", async () => {
    const c = await montar();
    await cadastrar(c, { nome: NOME, email: EMAIL, senha: SENHA });
    const velho = c.email.ultimoToken()!;
    c.relogio.avancar(2 * DIA);
    expect((await confirmar(c, velho)).statusCode).toBe(400);

    await cadastrar(c, { nome: NOME, email: EMAIL, senha: SENHA });
    expect((await confirmar(c, c.email.ultimoToken()!)).statusCode).toBe(200);
  });

  it.each([undefined, null, [], {}, { token: "" }, { token: 7 }])("corpo %j responde 400", async (corpo) => {
    const c = await montar();
    const r = await c.app.inject({
      method: "POST",
      url: "/auth/confirmar-email",
      headers: { "content-type": "application/json" },
      ...(corpo === undefined ? {} : { payload: JSON.stringify(corpo) }),
    });
    expect(r.statusCode).toBe(400);
    // Corpo totalmente vazio nem chega à validação: o Fastify o recusa antes.
    expect(r.json().mensagem).toBe(corpo === undefined ? "Requisição inválida." : "Link de confirmação inválido.");
  });

  it("confirmar não reativa conta que já passou da fase de confirmação", async () => {
    const c = await montar();
    const usuario = await cadastrarEConfirmar(c);
    usuario.status = "REJEITADO";
    // um token novo para essa conta não deve mudar o status
    c.banco.tokens.push({ usuarioId: usuario.id, tokenHash: hashToken("novo"), expiraEm: new Date(Date.now() + DIA), usadoEm: null });
    await confirmar(c, "novo");
    expect(usuario.status).toBe("REJEITADO");
  });
});

// ---------- login ----------
describe("POST /auth/login", () => {
  it("entra com e-mail e senha corretos: devolve o usuário e abre a sessão", async () => {
    const c = await montar();
    const token = await entrarComoAtivo(c);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(c.banco.sessoes).toHaveLength(1);
  });

  it("devolve só os dados públicos do usuário", async () => {
    const c = await montar();
    await cadastrarEConfirmar(c);
    [...c.banco.usuarios.values()][0]!.status = "ATIVO";
    const r = await entrar(c, EMAIL, SENHA);
    expect(Object.keys(r.json())).toEqual(["usuario"]);
    expect(Object.keys(r.json().usuario).sort()).toEqual(["categoria", "email", "id", "nome", "perfil", "status"]);
    expect(r.json().usuario).toMatchObject({ email: EMAIL, nome: NOME, perfil: "USUARIO", status: "ATIVO" });
    expect(r.body).not.toMatch(/hash|senha/i);
  });

  it("o cookie é HttpOnly, SameSite=Lax, vale 45 dias e não leva Secure fora de produção", async () => {
    const c = await montar();
    await cadastrarEConfirmar(c);
    [...c.banco.usuarios.values()][0]!.status = "ATIVO";
    const cookie = cookieDe(await entrar(c, EMAIL, SENHA)) as Record<string, unknown>;
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/", maxAge: 45 * 24 * 3600 });
    expect(cookie.secure).toBeFalsy();
  });

  it("em produção o cookie também é Secure (só trafega por HTTPS)", async () => {
    const c = await montar({ producao: true });
    await cadastrarEConfirmar(c);
    [...c.banco.usuarios.values()][0]!.status = "ATIVO";
    const cookie = cookieDe(await entrar(c, EMAIL, SENHA)) as Record<string, unknown>;
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", secure: true });
  });

  it("o banco guarda só o hash do token da sessão e a data da última autenticação", async () => {
    const c = await montar();
    const token = await entrarComoAtivo(c);
    expect(c.banco.sessoes[0]!.tokenHash).toBe(hashToken(token));
    expect(c.banco.sessoes[0]!.tokenHash).not.toBe(token);
    expect([...c.banco.usuarios.values()][0]!.ultimaAutenticacao).toEqual(c.relogio.agora());
    expect(c.banco.sessoes[0]!.expiraEm).toEqual(new Date(c.relogio.agora().getTime() + VALIDADE_SESSAO_MS));
  });

  it("cada login gera um token diferente", async () => {
    const c = await montar();
    const a = await entrarComoAtivo(c);
    const b = cookieDe(await entrar(c, EMAIL, SENHA))!.value;
    expect(a).not.toBe(b);
  });

  it("aceita e-mail em outras caixas e com espaços; a senha é exata", async () => {
    const c = await montar();
    await entrarComoAtivo(c);
    expect((await entrar(c, "  MARIA@Alunos.UTFPR.edu.br ", SENHA)).statusCode).toBe(200);
    expect((await entrar(c, EMAIL, "senha@123")).statusCode).toBe(401);
    expect((await entrar(c, EMAIL, `${SENHA} `)).statusCode).toBe(401);
  });

  describe("credenciais incorretas: mensagem genérica", () => {
    it("e-mail inexistente e senha errada são indistinguíveis", async () => {
      const c = await montar();
      await entrarComoAtivo(c);
      const senhaErrada = await entrar(c, EMAIL, "Errada@123");
      const emailInexistente = await entrar(c, "ninguem@alunos.utfpr.edu.br", SENHA);

      expect(senhaErrada.statusCode).toBe(401);
      expect(emailInexistente.statusCode).toBe(401);
      expect(emailInexistente.body).toBe(senhaErrada.body);
      expect(senhaErrada.json()).toEqual({ mensagem: "E-mail ou senha incorretos." });
      expect(senhaErrada.cookies).toHaveLength(0);
    });

    it("com e-mail inexistente, ainda gasta o mesmo trabalho de verificação de senha", async () => {
      const c = await montar();
      await entrar(c, "ninguem@alunos.utfpr.edu.br", SENHA);
      expect(c.hasher.verify).toHaveBeenCalledTimes(1);
    });

    it("um e-mail fora do domínio também recebe a mesma resposta (sem dica de regra)", async () => {
      const c = await montar();
      const r = await entrar(c, "alguem@gmail.com", SENHA);
      expect(r.statusCode).toBe(401);
      expect(r.json()).toEqual({ mensagem: "E-mail ou senha incorretos." });
    });

    it("conta pendente de e-mail com senha errada também é genérico (não revela a conta)", async () => {
      const c = await montar();
      await cadastrar(c, { nome: NOME, email: EMAIL, senha: SENHA });
      const r = await entrar(c, EMAIL, "Errada@123");
      expect(r.statusCode).toBe(401);
      expect(r.json()).toEqual({ mensagem: "E-mail ou senha incorretos." });
    });

    it("conta desativada com senha errada também é genérico", async () => {
      const c = await montar();
      c.banco.semear({ email: EMAIL, senha: SENHA, status: "DESATIVADO" });
      expect((await entrar(c, EMAIL, "Errada@123")).json()).toEqual({ mensagem: "E-mail ou senha incorretos." });
    });
  });

  describe("situação da conta (só aparece depois de acertar a senha)", () => {
    it("e-mail ainda não confirmado: 403 pedindo a confirmação, sem sessão", async () => {
      const c = await montar();
      await cadastrar(c, { nome: NOME, email: EMAIL, senha: SENHA });
      const r = await entrar(c, EMAIL, SENHA);
      expect(r.statusCode).toBe(403);
      expect(r.json().mensagem).toMatch(/Confirme seu e-mail/);
      expect(r.cookies).toHaveLength(0);
      expect(c.banco.sessoes).toHaveLength(0);
    });

    it("conta desativada: 403, sem sessão", async () => {
      const c = await montar();
      c.banco.semear({ email: EMAIL, senha: SENHA, status: "DESATIVADO" });
      const r = await entrar(c, EMAIL, SENHA);
      expect(r.statusCode).toBe(403);
      expect(r.json().mensagem).toBe("Sua conta está desativada. Fale com o RU.");
      expect(c.banco.sessoes).toHaveLength(0);
    });

    it.each(["PENDENTE_APROVACAO", "REJEITADO", "ATIVO"] as const)(
      "conta %s entra, e o status vai na resposta para o app decidir a tela",
      async (status) => {
        const c = await montar();
        c.banco.semear({ email: EMAIL, senha: SENHA, status });
        const r = await entrar(c, EMAIL, SENHA);
        expect(r.statusCode).toBe(200);
        expect(r.json().usuario.status).toBe(status);
      },
    );
  });

  describe("limite de tentativas", () => {
    it("na 6ª tentativa seguida responde 429 com Retry-After, mesmo com a senha certa", async () => {
      const c = await montar();
      c.banco.semear({ email: EMAIL, senha: SENHA });
      for (let i = 0; i < 5; i++) expect((await entrar(c, EMAIL, "Errada@123")).statusCode).toBe(401);

      const bloqueada = await entrar(c, EMAIL, SENHA);
      expect(bloqueada.statusCode).toBe(429);
      expect(bloqueada.headers["retry-after"]).toBe("900");
      expect(bloqueada.json().mensagem).toMatch(/Muitas tentativas/);
      expect(bloqueada.cookies).toHaveLength(0);
    });

    it("tentativa bloqueada nem chega a gastar processamento de hash", async () => {
      const c = await montar();
      c.banco.semear({ email: EMAIL, senha: SENHA });
      for (let i = 0; i < 5; i++) await entrar(c, EMAIL, "Errada@123");
      const antes = c.hasher.verify.mock.calls.length;
      await entrar(c, EMAIL, "Errada@123");
      expect(c.hasher.verify.mock.calls.length).toBe(antes);
    });

    it("libera depois de 15 minutos", async () => {
      const c = await montar();
      c.banco.semear({ email: EMAIL, senha: SENHA });
      for (let i = 0; i < 5; i++) await entrar(c, EMAIL, "Errada@123");
      c.relogio.avancar(15 * 60 * SEGUNDO);
      expect((await entrar(c, EMAIL, SENHA)).statusCode).toBe(200);
    });

    it("conta como falha também o e-mail inexistente, sem revelar nada", async () => {
      const c = await montar();
      for (let i = 0; i < 5; i++) await entrar(c, "ninguem@alunos.utfpr.edu.br", SENHA);
      expect((await entrar(c, "ninguem@alunos.utfpr.edu.br", SENHA)).statusCode).toBe(429);
    });

    it("é por IP e e-mail: outro IP ou outro e-mail não é afetado", async () => {
      const c = await montar();
      c.banco.semear({ email: EMAIL, senha: SENHA });
      c.banco.semear({ email: "outro@alunos.utfpr.edu.br", senha: SENHA });
      for (let i = 0; i < 5; i++) await entrar(c, EMAIL, "Errada@123", { ip: "10.0.0.1" });

      expect((await entrar(c, EMAIL, SENHA, { ip: "10.0.0.1" })).statusCode).toBe(429);
      expect((await entrar(c, EMAIL, SENHA, { ip: "10.0.0.2" })).statusCode).toBe(200);
      expect((await entrar(c, "outro@alunos.utfpr.edu.br", SENHA, { ip: "10.0.0.1" })).statusCode).toBe(200);
    });

    it("um login bem-sucedido zera a contagem", async () => {
      const c = await montar();
      c.banco.semear({ email: EMAIL, senha: SENHA });
      for (let i = 0; i < 4; i++) await entrar(c, EMAIL, "Errada@123");
      expect((await entrar(c, EMAIL, SENHA)).statusCode).toBe(200);
      for (let i = 0; i < 4; i++) expect((await entrar(c, EMAIL, "Errada@123")).statusCode).toBe(401);
    });

    it("conta desativada ou pendente com a senha certa não conta como tentativa de adivinhar", async () => {
      const c = await montar();
      c.banco.semear({ email: EMAIL, senha: SENHA, status: "DESATIVADO" });
      for (let i = 0; i < 8; i++) expect((await entrar(c, EMAIL, SENHA)).statusCode).toBe(403);
    });
  });

  it.each([undefined, null, [], {}, { email: EMAIL }, { senha: SENHA }, { email: "", senha: "" }])(
    "corpo %j responde 400 'Informe e-mail e senha.'",
    async (corpo) => {
      const c = await montar();
      const r = await c.app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "content-type": "application/json" },
        ...(corpo === undefined ? {} : { payload: JSON.stringify(corpo) }),
      });
      expect(r.statusCode).toBe(400);
      // Corpo totalmente vazio nem chega à validação: o Fastify o recusa antes.
      expect(r.json().mensagem).toBe(corpo === undefined ? "Requisição inválida." : "Informe e-mail e senha.");
    },
  );
});

// ---------- sessão ----------
describe("sessão e GET /auth/me", () => {
  it("com o cookie da sessão, devolve quem é o usuário", async () => {
    const c = await montar();
    const token = await entrarComoAtivo(c);
    const r = await eu(c, token);
    expect(r.statusCode).toBe(200);
    expect(r.json().usuario).toMatchObject({ email: EMAIL, nome: NOME, status: "ATIVO", perfil: "USUARIO" });
    expect(Object.keys(r.json().usuario).sort()).toEqual(["categoria", "email", "id", "nome", "perfil", "status"]);
  });

  it("sem cookie, cookie inventado ou adulterado: 401 sem pista do motivo", async () => {
    const c = await montar();
    const token = await entrarComoAtivo(c);
    const adulterado = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    for (const t of [undefined, gerarToken(), adulterado, "lixo", ""]) {
      const r = await eu(c, t);
      expect(r.statusCode).toBe(401);
      expect(r.json()).toEqual({ mensagem: "Faça login para continuar." });
    }
  });

  it("o status da conta acompanha o banco (ex.: o Admin aprova depois do login)", async () => {
    const c = await montar();
    const token = await entrarComoAtivo(c);
    [...c.banco.usuarios.values()][0]!.status = "REJEITADO";
    expect((await eu(c, token)).json().usuario.status).toBe("REJEITADO");
  });

  describe("reautenticação a cada 45 dias", () => {
    it("um segundo antes do prazo a sessão ainda vale", async () => {
      const c = await montar();
      const token = await entrarComoAtivo(c);
      c.relogio.avancar(45 * DIA - SEGUNDO);
      expect((await eu(c, token)).statusCode).toBe(200);
    });

    it("passados 45 dias: 401 dizendo que a sessão expirou", async () => {
      const c = await montar();
      const token = await entrarComoAtivo(c);
      c.relogio.avancar(45 * DIA);
      const r = await eu(c, token);
      expect(r.statusCode).toBe(401);
      expect(r.json()).toEqual({ codigo: "SESSAO_EXPIRADA", mensagem: "Sua sessão expirou. Entre novamente." });
    });

    it("usar o app não renova o prazo: contam 45 dias desde o login", async () => {
      const c = await montar();
      const token = await entrarComoAtivo(c);
      c.relogio.avancar(44 * DIA);
      expect((await eu(c, token)).statusCode).toBe(200); // usou no dia 44
      c.relogio.avancar(2 * DIA); // dia 46
      expect((await eu(c, token)).statusCode).toBe(401);
    });

    it("entrar de novo com a senha abre uma sessão nova com 45 dias", async () => {
      const c = await montar();
      const velho = await entrarComoAtivo(c);
      c.relogio.avancar(46 * DIA);
      expect((await eu(c, velho)).statusCode).toBe(401);

      const novo = cookieDe(await entrar(c, EMAIL, SENHA))!.value;
      expect((await eu(c, novo)).statusCode).toBe(200);
      c.relogio.avancar(44 * DIA);
      expect((await eu(c, novo)).statusCode).toBe(200);
    });

    it("sessão expirada nega também as rotas de outros módulos", async () => {
      const c = await montar();
      const token = await entrarComoAtivo(c);
      c.relogio.avancar(46 * DIA);
      const r = await c.app.inject({ method: "GET", url: "/cardapios/2026-11-10", headers: comSessao(token) });
      expect(r.statusCode).toBe(401);
      expect(r.json().codigo).toBe("SESSAO_EXPIRADA");
    });
  });

  describe("logout", () => {
    it("revoga a sessão e limpa o cookie", async () => {
      const c = await montar();
      const token = await entrarComoAtivo(c);
      const r = await c.app.inject({ method: "POST", url: "/auth/logout", headers: comSessao(token) });

      expect(r.statusCode).toBe(204);
      expect(cookieDe(r)).toMatchObject({ value: "" });
      expect((cookieDe(r) as { expires?: Date }).expires?.getTime()).toBe(0);
      expect(c.banco.sessoes[0]!.revogadaEm).toEqual(c.relogio.agora());

      // o token antigo, mesmo guardado por alguém, não serve mais
      const depois = await eu(c, token);
      expect(depois.statusCode).toBe(401);
      expect(depois.json()).toEqual({ mensagem: "Faça login para continuar." }); // revogada, e não "expirada"
    });

    it("sair sem sessão (ou duas vezes) não dá erro", async () => {
      const c = await montar();
      expect((await c.app.inject({ method: "POST", url: "/auth/logout" })).statusCode).toBe(204);
      const token = await entrarComoAtivo(c);
      for (let i = 0; i < 2; i++) {
        expect((await c.app.inject({ method: "POST", url: "/auth/logout", headers: comSessao(token) })).statusCode).toBe(204);
      }
    });

    it("sair em um aparelho não derruba a sessão do outro", async () => {
      const c = await montar();
      const celular = await entrarComoAtivo(c);
      const notebook = cookieDe(await entrar(c, EMAIL, SENHA))!.value;
      await c.app.inject({ method: "POST", url: "/auth/logout", headers: comSessao(celular) });
      expect((await eu(c, celular)).statusCode).toBe(401);
      expect((await eu(c, notebook)).statusCode).toBe(200);
    });
  });

  it("conta desativada perde o acesso na hora, sem esperar os 45 dias", async () => {
    const c = await montar();
    const token = await entrarComoAtivo(c);
    [...c.banco.usuarios.values()][0]!.status = "DESATIVADO";
    const r = await eu(c, token);
    expect(r.statusCode).toBe(401);
    expect(r.json()).toEqual({ mensagem: "Faça login para continuar." });
  });

  it("a sessão de uma pessoa nunca vale como a de outra", async () => {
    const c = await montar();
    const maria = await entrarComoAtivo(c, EMAIL);
    const joao = await entrarComoAtivo(c, "joao@alunos.utfpr.edu.br");
    expect((await eu(c, maria)).json().usuario.email).toBe(EMAIL);
    expect((await eu(c, joao)).json().usuario.email).toBe("joao@alunos.utfpr.edu.br");
  });

  it("o perfil vem sempre do banco, não do cookie", async () => {
    const c = await montar();
    const admin = c.banco.semear({ email: "admin@alunos.utfpr.edu.br", senha: SENHA, perfil: "ADMIN" });
    const token = cookieDe(await entrar(c, admin.email, SENHA))!.value;
    const put = (t: string) =>
      c.app.inject({
        method: "PUT",
        url: "/cardapios/2026-11-10",
        headers: comSessao(t),
        payload: {
          proteinaAnimal: "a",
          proteinaVegetariana: "b",
          carboidrato1: "c",
          carboidrato2: "d",
          carboidrato3: "e",
          salada1: "f",
          salada2: "g",
          sobremesa: "h",
          suco: "i",
        },
      });
    expect((await put(token)).statusCode).toBe(200); // admin consegue

    admin.perfil = "USUARIO"; // rebaixado depois do login
    expect((await put(token)).statusCode).toBe(403);
  });

  it("funciona com vários cookies no mesmo cabeçalho", async () => {
    const c = await montar();
    const token = await entrarComoAtivo(c);
    const r = await c.app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: `outro=1; ${NOME_COOKIE_SESSAO}=${token}; tema=escuro` },
    });
    expect(r.statusCode).toBe(200);
  });
});

// ---------- integração com os outros módulos ----------
describe("rotas dos outros módulos usam a sessão real", () => {
  it("o cardápio exige login: sem sessão 401, com sessão responde", async () => {
    const c = await montar();
    expect((await c.app.inject({ method: "GET", url: "/cardapios/2026-11-10" })).statusCode).toBe(401);
    const token = await entrarComoAtivo(c);
    const r = await c.app.inject({ method: "GET", url: "/cardapios/2026-11-10", headers: comSessao(token) });
    expect(r.statusCode).toBe(404); // autenticou; só não há cardápio publicado
  });

  it("usuário comum não cadastra cardápio (403) mesmo com sessão válida", async () => {
    const c = await montar();
    const token = await entrarComoAtivo(c);
    const r = await c.app.inject({ method: "PUT", url: "/cardapios/2026-11-10", headers: comSessao(token), payload: {} });
    expect(r.statusCode).toBe(403);
  });
});

describe("DEV_USUARIO (identificador explícito)", () => {
  it("tem precedência sobre o cookie de sessão", async () => {
    const c = await montar({
      identificar: (request) => {
        request.usuario = { id: "id-do-dev", perfil: "ADMIN" };
      },
    });
    const dev = c.banco.semear({ email: "dev@dev.local", senha: "x", perfil: "ADMIN" });
    c.banco.usuarios.delete(dev.id);
    c.banco.usuarios.set("id-do-dev", { ...dev, id: "id-do-dev" });

    const token = await entrarComoAtivo(c); // há uma sessão real da Maria...
    const r = await eu(c, token);
    expect(r.json().usuario.email).toBe("dev@dev.local"); // ...mas vale o usuário de desenvolvimento
  });

  it("sem identificador explícito, vale só o cookie", async () => {
    const c = await montar();
    expect((await eu(c)).statusCode).toBe(401);
  });
});

// ---------- CSRF ----------
describe("proteção contra CSRF (Origin)", () => {
  it("POST de outro site é barrado (403), inclusive o login", async () => {
    const c = await montar();
    c.banco.semear({ email: EMAIL, senha: SENHA });
    const r = await entrar(c, EMAIL, SENHA, { headers: { origin: "http://site-malicioso.com" } });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toEqual({ mensagem: "Origem não permitida." });
    expect(c.banco.sessoes).toHaveLength(0);
  });

  it("a origem do front passa, e requisições sem Origin (curl, testes) também", async () => {
    const c = await montar();
    c.banco.semear({ email: EMAIL, senha: SENHA });
    expect((await entrar(c, EMAIL, SENHA, { headers: { origin: ORIGEM } })).statusCode).toBe(200);
    expect((await entrar(c, EMAIL, SENHA)).statusCode).toBe(200);
  });

  it("origem parecida mas diferente (porta, esquema, subdomínio) é barrada", async () => {
    const c = await montar();
    for (const origin of [
      "http://localhost:5174",
      "https://localhost:5173",
      "http://localhost:5173.evil.com",
      "http://127.0.0.1:5173",
      "null",
    ]) {
      expect((await cadastrar(c, { nome: NOME, email: EMAIL, senha: SENHA }, { origin })).statusCode, origin).toBe(403);
    }
  });

  it("vale para as rotas de outros módulos: PUT com sessão válida mas origem alheia é barrado", async () => {
    const c = await montar();
    const admin = c.banco.semear({ email: "admin@alunos.utfpr.edu.br", senha: SENHA, perfil: "ADMIN" });
    const token = cookieDe(await entrar(c, admin.email, SENHA))!.value;
    const put = (origin?: string) =>
      c.app.inject({
        method: "PUT",
        url: "/cardapios/2026-11-10",
        headers: { ...comSessao(token), ...(origin ? { origin } : {}) },
        payload: { proteinaAnimal: "a", proteinaVegetariana: "b", carboidrato1: "c", carboidrato2: "d", carboidrato3: "e", salada1: "f", salada2: "g", sobremesa: "h", suco: "i" },
      });
    expect((await put("http://site-malicioso.com")).statusCode).toBe(403);
    expect((await put(ORIGEM)).statusCode).toBe(200);
  });

  it("leituras (GET) não são bloqueadas por Origin", async () => {
    const c = await montar();
    const token = await entrarComoAtivo(c);
    const r = await c.app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { ...comSessao(token), origin: "http://outro-site.com" },
    });
    expect(r.statusCode).toBe(200); // o CORS é quem impede o outro site de ler a resposta
  });
});

// ---------- Argon2 de ponta a ponta ----------
describe("com o Argon2 de verdade", () => {
  it("cadastro, confirmação, login e sessão funcionam, e o banco guarda Argon2id", async () => {
    const c = await montar({ usarArgon2: true });
    const usuario = await cadastrarEConfirmar(c);
    expect(usuario.senhaHash).toMatch(/^\$argon2id\$/);
    expect(usuario.senhaHash).not.toContain(SENHA);

    usuario.status = "ATIVO";
    expect((await entrar(c, EMAIL, "Errada@123")).statusCode).toBe(401);
    expect((await entrar(c, "ninguem@alunos.utfpr.edu.br", SENHA)).statusCode).toBe(401);
    const ok = await entrar(c, EMAIL, SENHA);
    expect(ok.statusCode).toBe(200);
    expect((await eu(c, cookieDe(ok)!.value)).statusCode).toBe(200);
  });
});

it("rotas /auth não existem quando a identidade não é configurada", async () => {
  const app = await buildApp({ cardapioRepo });
  expect((await app.inject({ method: "POST", url: "/auth/login", payload: {} })).statusCode).toBe(404);
});
