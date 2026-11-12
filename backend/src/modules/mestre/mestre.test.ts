import { describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import type { Identificador } from "../../shared/auth.js";
import { criarHasherFalso, hasherFalso, uuid } from "../../testes/identidadeFalsa.js";
import type { CardapioRepositorio } from "../cardapio/repositorio.js";
import { CURSOR_INVALIDO, criarServicoLogs, type LogsRepositorio } from "../auditoria/consulta.js";
import {
  EMAIL_JA_CADASTRADO,
  MESTRE_JA_EXISTE,
  criarPrimeiroMestre,
  type ContaCriada,
  type ContasRepositorio,
} from "./contas.js";

// ---------- apoio ----------
const MESTRE = uuid(1);
const SENHA = "Senha@123";

type Linha = Awaited<ReturnType<LogsRepositorio["listar"]>>[number];

/** Banco em memória: contas e logs, com a mesma regra do repositório de verdade (conta + log juntos). */
function criarBanco(agoraMs = Date.parse("2026-11-10T12:00:00.000Z")) {
  const contas: (ContaCriada & { senhaHash: string })[] = [];
  const logs: Linha[] = [];
  let relogio = agoraMs;
  let contador = 100;
  let mestreComLogin = false;

  const contasRepo: ContasRepositorio = {
    async criarConta({ nome, email, senhaHash, perfil, atorId }) {
      if (contas.some((c) => c.email === email)) return EMAIL_JA_CADASTRADO;
      const conta = { id: uuid(++contador), nome, email, perfil, senhaHash };
      contas.push(conta);
      relogio += 1000;
      logs.push({
        id: uuid(++contador),
        criadoEm: new Date(relogio),
        acao: perfil === "MESTRE" ? "CRIAR_MESTRE" : "CRIAR_CONTA",
        entidade: "usuario",
        entidadeId: conta.id,
        detalhes: { perfil, email },
        ator: atorId ? { id: atorId, nome: "Mestre Teste" } : null,
      });
      return { id: conta.id, nome, email, perfil };
    },
    async existeMestreComLogin() {
      return mestreComLogin;
    },
  };

  const logsRepo: LogsRepositorio = {
    async listar({ depois, quantidade }) {
      return [...logs]
        .sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime() || (a.id < b.id ? 1 : -1))
        .filter(
          (l) =>
            !depois ||
            l.criadoEm < depois.data ||
            (l.criadoEm.getTime() === depois.data.getTime() && l.id < depois.id),
        )
        .slice(0, quantidade);
    },
  };

  return { contas, logs, contasRepo, logsRepo, definirMestreComLogin: (v: boolean) => (mestreComLogin = v) };
}

const cardapioRepo: CardapioRepositorio = {
  async salvar(data) {
    return { data, itens: [] };
  },
  async buscar() {
    return null;
  },
};

const identificar: Identificador = (request) => {
  const perfil = request.headers["x-perfil"];
  if (typeof perfil === "string") request.usuario = { id: MESTRE, perfil: perfil as never };
};

async function montar() {
  const banco = criarBanco();
  const hasher = criarHasherFalso();
  const app = await buildApp({
    cardapioRepo,
    mestre: { contasRepo: banco.contasRepo, logsRepo: banco.logsRepo, hasher },
    identificar,
    hoje: () => "2026-11-10",
  });
  return { app, banco, hasher };
}
type Contexto = Awaited<ReturnType<typeof montar>>;

const comoMestre = { "x-perfil": "MESTRE" };
const criar = (c: Contexto, corpo: unknown, headers: Record<string, string> = comoMestre) =>
  c.app.inject({ method: "POST", url: "/mestre/contas", payload: corpo as object, headers });
const valida = { nome: "Ana Admin", email: "ana@utfpr.edu.br", senha: SENHA, perfil: "ADMIN" };

// ---------- criar Admin e Operador ----------
describe("POST /mestre/contas", () => {
  it("o Mestre cria um Admin: 201, conta ATIVA com a senha guardada só como hash", async () => {
    const c = await montar();
    const r = await criar(c, valida);
    expect(r.statusCode).toBe(201);
    expect(r.json()).toEqual({
      id: expect.any(String),
      nome: "Ana Admin",
      email: "ana@utfpr.edu.br",
      perfil: "ADMIN",
    });
    expect(c.banco.contas[0]?.senhaHash).toBe(hasherFalso.hashSync(SENHA));
    expect(JSON.stringify(r.json())).not.toContain(SENHA);
  });

  it("o Mestre cria um Operador", async () => {
    const c = await montar();
    const r = await criar(c, { ...valida, email: "op@utfpr.edu.br", perfil: "OPERADOR" });
    expect(r.statusCode).toBe(201);
    expect(r.json().perfil).toBe("OPERADOR");
  });

  it("registra no log quem criou, o quê e quando, sem a senha", async () => {
    const c = await montar();
    await criar(c, valida);
    const r = await c.app.inject({ method: "GET", url: "/mestre/logs", headers: comoMestre });
    const [log] = r.json().itens;
    expect(log).toMatchObject({
      acao: "CRIAR_CONTA",
      entidade: "usuario",
      entidadeId: c.banco.contas[0]?.id,
      detalhes: { perfil: "ADMIN", email: "ana@utfpr.edu.br" },
      autor: { id: MESTRE, nome: "Mestre Teste" },
    });
    expect(log.data).toMatch(/^2026-11-10T12:00:01/);
    expect(JSON.stringify(r.json())).not.toContain(SENHA);
    expect(JSON.stringify(r.json())).not.toContain("hash");
  });

  it("não deixa criar MESTRE pela API (só pelo script de instalação)", async () => {
    const c = await montar();
    const r = await criar(c, { ...valida, perfil: "MESTRE" });
    expect(r.statusCode).toBe(400);
    expect(r.json().campo).toBe("perfil");
    expect(c.banco.contas).toHaveLength(0);
  });

  it.each(["USUARIO", "", undefined, 5])("perfil %j é recusado", async (perfil) => {
    const c = await montar();
    const r = await criar(c, { ...valida, perfil });
    expect(r.statusCode).toBe(400);
    expect(r.json().campo).toBe("perfil");
  });

  it("e-mail repetido: 409 no campo e-mail, sem criar nem logar", async () => {
    const c = await montar();
    await criar(c, valida);
    const r = await criar(c, { ...valida, nome: "Outra Pessoa" });
    expect(r.statusCode).toBe(409);
    expect(r.json()).toEqual({ campo: "email", mensagem: "Já existe uma conta com este e-mail." });
    expect(c.banco.contas).toHaveLength(1);
    expect(c.banco.logs).toHaveLength(1);
  });

  it("e-mail em maiúsculas e com espaços é normalizado", async () => {
    const c = await montar();
    await criar(c, { ...valida, email: "  ANA@UTFPR.EDU.BR " });
    expect(c.banco.contas[0]?.email).toBe("ana@utfpr.edu.br");
    const r = await criar(c, valida);
    expect(r.statusCode).toBe(409);
  });

  it("aceita e-mail fora do domínio dos alunos (conta interna)", async () => {
    const c = await montar();
    const r = await criar(c, { ...valida, email: "gente@gmail.com" });
    expect(r.statusCode).toBe(201);
  });

  it.each([
    ["senha curta", { senha: "Ab@1" }, "senha"],
    ["senha sem número", { senha: "SenhaForte@" }, "senha"],
    ["senha sem caractere especial", { senha: "Senha1234" }, "senha"],
    ["senha enorme", { senha: "a1@".repeat(50) }, "senha"],
    ["nome curto", { nome: "Al" }, "nome"],
    ["nome só com espaços", { nome: "     " }, "nome"],
    ["e-mail inválido", { email: "isto-nao-e-email" }, "email"],
  ])("%s: 400 apontando o campo, sem criar", async (_n, mudanca, campo) => {
    const c = await montar();
    const r = await criar(c, { ...valida, ...mudanca });
    expect(r.statusCode).toBe(400);
    expect(r.json().campo).toBe(campo);
    expect(c.banco.contas).toHaveLength(0);
    expect(c.banco.logs).toHaveLength(0);
  });

  it.each([null, 42, [], undefined])("corpo %j inválido: 400 em português", async (corpo) => {
    const c = await montar();
    const r = await c.app.inject({
      method: "POST",
      url: "/mestre/contas",
      headers: comoMestre,
      ...(corpo === undefined ? {} : { payload: corpo as never }),
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().mensagem).not.toMatch(/expected|invalid input/i);
  });

  it("corpo que não é JSON: erro 4xx, nunca 500", async () => {
    const c = await montar();
    const r = await c.app.inject({ method: "POST", url: "/mestre/contas", headers: comoMestre, payload: "texto" });
    expect(r.statusCode).toBeGreaterThanOrEqual(400);
    expect(r.statusCode).toBeLessThan(500);
  });

  it.each(["USUARIO", "OPERADOR", "ADMIN"])("%s não pode criar contas: 403, nada criado", async (perfil) => {
    const c = await montar();
    const r = await criar(c, valida, { "x-perfil": perfil });
    expect(r.statusCode).toBe(403);
    expect(c.banco.contas).toHaveLength(0);
    expect(c.banco.logs).toHaveLength(0);
  });

  it("sem login: 401", async () => {
    const c = await montar();
    const r = await criar(c, valida, {});
    expect(r.statusCode).toBe(401);
    expect(c.banco.contas).toHaveLength(0);
  });
});

// ---------- logs ----------
describe("GET /mestre/logs", () => {
  const popular = async (c: Contexto, quantidade: number) => {
    for (let i = 0; i < quantidade; i++) await criar(c, { ...valida, email: `a${i}@utfpr.edu.br` });
  };

  it("vazio: lista vazia, sem próxima página", async () => {
    const c = await montar();
    const r = await c.app.inject({ method: "GET", url: "/mestre/logs", headers: comoMestre });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ itens: [], proximoCursor: null });
  });

  it("do mais recente para o mais antigo", async () => {
    const c = await montar();
    await popular(c, 3);
    const r = await c.app.inject({ method: "GET", url: "/mestre/logs", headers: comoMestre });
    expect(r.json().itens.map((l: { detalhes: { email: string } }) => l.detalhes.email)).toEqual([
      "a2@utfpr.edu.br",
      "a1@utfpr.edu.br",
      "a0@utfpr.edu.br",
    ]);
  });

  it("pagina sem repetir nem perder itens", async () => {
    const c = await montar();
    await popular(c, 5);
    const vistos: string[] = [];
    let cursor: string | null = null;
    let paginas = 0;
    do {
      const url: string = `/mestre/logs?limite=2${cursor ? `&cursor=${cursor}` : ""}`;
      const r = await c.app.inject({ method: "GET", url, headers: comoMestre });
      const corpo = r.json();
      vistos.push(...corpo.itens.map((l: { id: string }) => l.id));
      cursor = corpo.proximoCursor;
      paginas++;
    } while (cursor && paginas < 10);
    expect(paginas).toBe(3);
    expect(new Set(vistos).size).toBe(5);
    expect(vistos).toEqual(c.banco.logs.map((l) => l.id).reverse());
  });

  it("página exata não anuncia próxima", async () => {
    const c = await montar();
    await popular(c, 2);
    const r = await c.app.inject({ method: "GET", url: "/mestre/logs?limite=2", headers: comoMestre });
    expect(r.json().proximoCursor).toBeNull();
  });

  it.each(["0", "101", "-1", "abc", "1.5"])("limite %s é recusado", async (limite) => {
    const c = await montar();
    const r = await c.app.inject({ method: "GET", url: `/mestre/logs?limite=${limite}`, headers: comoMestre });
    expect(r.statusCode).toBe(400);
    expect(r.json().campo).toBe("limite");
  });

  it("cursor inválido: 400 e nunca 500", async () => {
    const c = await montar();
    for (const cursor of ["lixo", "e30", "%%%"]) {
      const r = await c.app.inject({ method: "GET", url: `/mestre/logs?cursor=${cursor}`, headers: comoMestre });
      expect(r.statusCode).toBe(400);
      expect(r.json().campo).toBe("cursor");
    }
  });

  it("ação sem usuário logado (script do Mestre) aparece com autor nulo", async () => {
    const c = await montar();
    await criarPrimeiroMestre(c.banco.contasRepo, c.hasher, { nome: "Primeiro Mestre", email: "m@utfpr.edu.br", senha: SENHA });
    const r = await c.app.inject({ method: "GET", url: "/mestre/logs", headers: comoMestre });
    expect(r.json().itens[0]).toMatchObject({ acao: "CRIAR_MESTRE", autor: null });
  });

  it("só passa campos conhecidos (nada vaza do registro)", async () => {
    const c = await montar();
    await popular(c, 1);
    (c.banco.logs[0] as Record<string, unknown>)["segredo"] = "x";
    const r = await c.app.inject({ method: "GET", url: "/mestre/logs", headers: comoMestre });
    expect(Object.keys(r.json().itens[0]).sort()).toEqual(
      ["acao", "autor", "data", "detalhes", "entidade", "entidadeId", "id"].sort(),
    );
  });

  it.each(["USUARIO", "OPERADOR", "ADMIN"])("%s não vê os logs: 403", async (perfil) => {
    const c = await montar();
    const r = await c.app.inject({ method: "GET", url: "/mestre/logs", headers: { "x-perfil": perfil } });
    expect(r.statusCode).toBe(403);
    expect(r.body).not.toContain("itens");
  });

  it("sem login: 401", async () => {
    const c = await montar();
    const r = await c.app.inject({ method: "GET", url: "/mestre/logs" });
    expect(r.statusCode).toBe(401);
  });

  it("serviço devolve CURSOR_INVALIDO sem consultar o repositório", async () => {
    let consultou = false;
    const servico = criarServicoLogs({
      async listar() {
        consultou = true;
        return [];
      },
    });
    expect(await servico.listar(10, "lixo")).toBe(CURSOR_INVALIDO);
    expect(consultou).toBe(false);
  });
});

// ---------- primeiro Mestre (script) ----------
describe("criarPrimeiroMestre", () => {
  const dados = { nome: "Primeiro Mestre", email: "mestre@utfpr.edu.br", senha: SENHA };

  it("cria o Mestre ATIVO, com hash e log sem autor", async () => {
    const banco = criarBanco();
    const r = await criarPrimeiroMestre(banco.contasRepo, criarHasherFalso(), dados);
    expect(r).toMatchObject({ perfil: "MESTRE", email: "mestre@utfpr.edu.br" });
    expect(banco.contas[0]?.senhaHash).toBe(hasherFalso.hashSync(SENHA));
    expect(banco.logs[0]).toMatchObject({ acao: "CRIAR_MESTRE", ator: null });
  });

  it("recusa quando já existe um Mestre que consegue entrar, sem gastar hash nem criar", async () => {
    const banco = criarBanco();
    banco.definirMestreComLogin(true);
    const hasher = criarHasherFalso();
    expect(await criarPrimeiroMestre(banco.contasRepo, hasher, dados)).toBe(MESTRE_JA_EXISTE);
    expect(banco.contas).toHaveLength(0);
    expect(hasher.hash).not.toHaveBeenCalled();
  });

  it("e-mail já usado: devolve EMAIL_JA_CADASTRADO", async () => {
    const banco = criarBanco();
    await criarPrimeiroMestre(banco.contasRepo, criarHasherFalso(), dados);
    expect(await criarPrimeiroMestre(banco.contasRepo, criarHasherFalso(), dados)).toBe(EMAIL_JA_CADASTRADO);
  });
});
