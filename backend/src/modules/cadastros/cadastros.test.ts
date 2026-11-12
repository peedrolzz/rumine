import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { exigirCadastroAtivo, exigirPerfil, type Identificador } from "../../shared/auth.js";
import { criarEmailFalso, criarHasherFalso, criarRelogio, criarRepoIdentidadeFalso, uuid } from "../../testes/identidadeFalsa.js";
import type { CardapioRepositorio } from "../cardapio/repositorio.js";
import { NOME_COOKIE_SESSAO } from "../identidade/rotas.js";
import { VALIDADE_SESSAO_MS } from "../identidade/servico.js";
import { gerarToken, hashToken } from "../identidade/tokens.js";
import type { CadastroPendente, CadastrosRepositorio, ResultadoDecisao } from "./repositorio.js";

// ---------- apoio ----------
const ADMIN = uuid(900);
const ADMIN_2 = uuid(901);

type Conta = {
  nome: string;
  email: string;
  identificador: string | null;
  status: "PENDENTE_EMAIL" | "PENDENTE_APROVACAO" | "ATIVO" | "REJEITADO" | "DESATIVADO";
  declaracoes: { id: string; enviadaEm: Date }[];
};
type Analise = { usuarioId: string; declaracaoId: string; adminId: string; decisao: string; motivo: string | null };

/** Banco em memória com as mesmas regras do repositório real. */
function criarBanco(contas: Record<string, Conta>) {
  const usuarios = new Map(Object.entries(contas));
  const analises: Analise[] = [];
  const carteiras = new Set<string>();
  const logs: { atorId: string; acao: string; entidadeId: string; detalhes: Record<string, unknown> }[] = [];

  const repo: CadastrosRepositorio = {
    async listarPendentes({ depois, quantidade }) {
      const itens: CadastroPendente[] = [];
      for (const [usuarioId, c] of usuarios) {
        if (c.status !== "PENDENTE_APROVACAO") continue;
        const d = [...c.declaracoes].sort((a, b) => b.enviadaEm.getTime() - a.enviadaEm.getTime() || (a.id < b.id ? 1 : -1))[0];
        if (!d) continue;
        itens.push({ usuarioId, nome: c.nome, email: c.email, identificador: c.identificador, declaracaoId: d.id, enviadaEm: d.enviadaEm });
      }
      return itens
        .sort((a, b) => a.enviadaEm.getTime() - b.enviadaEm.getTime() || (a.declaracaoId < b.declaracaoId ? -1 : 1))
        .filter((i) => !depois || i.enviadaEm > depois.data || (i.enviadaEm.getTime() === depois.data.getTime() && i.declaracaoId > depois.id))
        .slice(0, quantidade);
    },
    async decidir({ usuarioId, adminId, decisao }): Promise<ResultadoDecisao> {
      const c = usuarios.get(usuarioId);
      if (!c) return "NAO_ENCONTRADO";
      if (c.status !== "PENDENTE_APROVACAO") return "JA_DECIDIDO";
      const d = [...c.declaracoes].sort((a, b) => b.enviadaEm.getTime() - a.enviadaEm.getTime())[0];
      if (!d) return "SEM_DECLARACAO";
      const aprovado = decisao.tipo === "APROVADO";
      analises.push({
        usuarioId,
        declaracaoId: d.id,
        adminId,
        decisao: decisao.tipo,
        motivo: decisao.tipo === "REJEITADO" ? decisao.motivo : null,
      });
      c.status = aprovado ? "ATIVO" : "REJEITADO";
      if (aprovado) carteiras.add(usuarioId);
      logs.push({
        atorId: adminId,
        acao: aprovado ? "APROVAR_CADASTRO" : "REJEITAR_CADASTRO",
        entidadeId: usuarioId,
        detalhes: { declaracaoId: d.id, ...(decisao.tipo === "REJEITADO" && { motivo: decisao.motivo }) },
      });
      return "OK";
    },
  };
  return { repo, usuarios, analises, carteiras, logs };
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
  if (typeof perfil !== "string") return;
  const id = request.headers["x-usuario"];
  request.usuario = { id: typeof id === "string" ? id : ADMIN, perfil: perfil as never };
};

const DIA = 24 * 3_600_000;
const pendente = (n: number, dias: number, extra: Partial<Conta> = {}): [string, Conta] => [
  uuid(n),
  {
    nome: `Aluno ${n}`,
    email: `aluno${n}@alunos.utfpr.edu.br`,
    identificador: `a${1000000 + n}`,
    status: "PENDENTE_APROVACAO",
    declaracoes: [{ id: uuid(5000 + n), enviadaEm: new Date(Date.parse("2026-11-01T12:00:00.000Z") + dias * DIA) }],
    ...extra,
  },
];

async function montar(contas: [string, Conta][] = []) {
  const banco = criarBanco(Object.fromEntries(contas));
  const app = await buildApp({ cardapioRepo, cadastrosRepo: banco.repo, identificar, hoje: () => "2026-11-10" });
  return { app, banco };
}
type Contexto = Awaited<ReturnType<typeof montar>>;

const comoAdmin = { "x-perfil": "ADMIN" };
const listar = (c: Contexto, consulta = "", headers: Record<string, string> = comoAdmin) =>
  c.app.inject({ method: "GET", url: `/admin/cadastros${consulta}`, headers });
const aprovar = (c: Contexto, id: string, headers: Record<string, string> = comoAdmin) =>
  c.app.inject({ method: "POST", url: `/admin/cadastros/${id}/aprovar`, headers });
const rejeitar = (c: Contexto, id: string, corpo: unknown, headers: Record<string, string> = comoAdmin) =>
  c.app.inject({ method: "POST", url: `/admin/cadastros/${id}/rejeitar`, payload: corpo as object, headers });

// ---------- lista ----------
describe("GET /admin/cadastros", () => {
  it("vazio: lista vazia, sem próxima página", async () => {
    const c = await montar();
    expect((await listar(c)).json()).toEqual({ itens: [], proximoCursor: null });
  });

  it("mostra nome, e-mail, RA e a declaração enviada, só dos que aguardam análise", async () => {
    const c = await montar([
      pendente(1, 0),
      pendente(2, 1, { status: "ATIVO" }),
      pendente(3, 1, { status: "REJEITADO" }),
      pendente(4, 1, { status: "PENDENTE_EMAIL", declaracoes: [] }),
      pendente(5, 1, { declaracoes: [] }), // confirmou o e-mail mas ainda não enviou: não entra na fila
    ]);
    const r = await listar(c);
    expect(r.statusCode).toBe(200);
    expect(r.json().itens).toEqual([
      {
        usuarioId: uuid(1),
        nome: "Aluno 1",
        email: "aluno1@alunos.utfpr.edu.br",
        identificador: "a1000001",
        declaracaoId: uuid(5001),
        enviadaEm: "2026-11-01T12:00:00.000Z",
      },
    ]);
  });

  it("fila: do mais antigo para o mais novo", async () => {
    const c = await montar([pendente(1, 5), pendente(2, 1), pendente(3, 3)]);
    expect((await listar(c)).json().itens.map((i: { usuarioId: string }) => i.usuarioId)).toEqual([uuid(2), uuid(3), uuid(1)]);
  });

  it("quem reenviou aparece uma vez só, com a declaração mais recente", async () => {
    const [id, conta] = pendente(1, 0);
    conta.declaracoes.push({ id: uuid(9999), enviadaEm: new Date("2026-11-08T12:00:00.000Z") });
    const c = await montar([[id, conta]]);
    const itens = (await listar(c)).json().itens;
    expect(itens).toHaveLength(1);
    expect(itens[0].declaracaoId).toBe(uuid(9999));
  });

  it("não expõe campos além dos combinados (nunca senha ou hash)", async () => {
    const c = await montar([pendente(1, 0)]);
    const [item] = (await listar(c)).json().itens;
    expect(Object.keys(item).sort()).toEqual(["declaracaoId", "email", "enviadaEm", "identificador", "nome", "usuarioId"]);
  });

  it("pagina sem repetir nem perder ninguém", async () => {
    const c = await montar([1, 2, 3, 4, 5].map((n) => pendente(n, n)));
    const vistos: string[] = [];
    let cursor: string | null = null;
    let paginas = 0;
    do {
      const r: Awaited<ReturnType<typeof listar>> = await listar(c, `?limite=2${cursor ? `&cursor=${cursor}` : ""}`);
      const corpo = r.json();
      vistos.push(...corpo.itens.map((i: { usuarioId: string }) => i.usuarioId));
      cursor = corpo.proximoCursor;
      paginas++;
    } while (cursor && paginas < 10);
    expect(paginas).toBe(3);
    expect(vistos).toEqual([1, 2, 3, 4, 5].map(uuid));
  });

  it("página exata não anuncia próxima página", async () => {
    const c = await montar([pendente(1, 1), pendente(2, 2)]);
    expect((await listar(c, "?limite=2")).json().proximoCursor).toBeNull();
    expect((await listar(c, "?limite=1")).json().proximoCursor).not.toBeNull();
  });

  it.each(["0", "51", "-1", "abc", "1.5"])("limite %s recusado", async (limite) => {
    const c = await montar();
    const r = await listar(c, `?limite=${limite}`);
    expect(r.statusCode).toBe(400);
    expect(r.json().campo).toBe("limite");
  });

  it.each(["lixo", "e30", "%%%"])("cursor %s inválido: 400, nunca 500", async (cursor) => {
    const c = await montar();
    const r = await listar(c, `?cursor=${cursor}`);
    expect(r.statusCode).toBe(400);
    expect(r.json().campo).toBe("cursor");
  });

  it.each(["USUARIO", "OPERADOR", "MESTRE"])("%s não vê a fila: 403 e nenhum dado vaza", async (perfil) => {
    const c = await montar([pendente(1, 0)]);
    const r = await listar(c, "", { "x-perfil": perfil });
    expect(r.statusCode).toBe(403);
    expect(r.body).not.toContain("aluno1@");
  });

  it("sem login: 401", async () => {
    const c = await montar([pendente(1, 0)]);
    expect((await listar(c, "", {})).statusCode).toBe(401);
  });
});

// ---------- aprovar ----------
describe("POST /admin/cadastros/:id/aprovar", () => {
  it("aprova: conta fica ATIVA, cria a carteira, registra quem decidiu e o log", async () => {
    const c = await montar([pendente(1, 0)]);
    const r = await aprovar(c, uuid(1));
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ status: "ATIVO" });
    expect(c.banco.usuarios.get(uuid(1))?.status).toBe("ATIVO");
    expect(c.banco.carteiras.has(uuid(1))).toBe(true);
    expect(c.banco.analises).toEqual([
      { usuarioId: uuid(1), declaracaoId: uuid(5001), adminId: ADMIN, decisao: "APROVADO", motivo: null },
    ]);
    expect(c.banco.logs).toEqual([
      { atorId: ADMIN, acao: "APROVAR_CADASTRO", entidadeId: uuid(1), detalhes: { declaracaoId: uuid(5001) } },
    ]);
  });

  it("sai da fila depois de aprovado", async () => {
    const c = await montar([pendente(1, 0), pendente(2, 1)]);
    await aprovar(c, uuid(1));
    expect((await listar(c)).json().itens.map((i: { usuarioId: string }) => i.usuarioId)).toEqual([uuid(2)]);
  });

  it("decisão dupla: o segundo Admin recebe 409 e nada é gravado de novo", async () => {
    const c = await montar([pendente(1, 0)]);
    await aprovar(c, uuid(1));
    const r = await aprovar(c, uuid(1), { ...comoAdmin, "x-usuario": ADMIN_2 });
    expect(r.statusCode).toBe(409);
    expect(r.json()).toEqual({ codigo: "JA_DECIDIDO", mensagem: "Este cadastro já foi analisado." });
    expect(c.banco.analises).toHaveLength(1);
    expect(c.banco.logs).toHaveLength(1);
  });

  it("aprovar depois de rejeitado não vale (o usuário precisa reenviar)", async () => {
    const c = await montar([pendente(1, 0)]);
    await rejeitar(c, uuid(1), { motivo: "Arquivo ilegível." });
    expect((await aprovar(c, uuid(1))).statusCode).toBe(409);
    expect(c.banco.usuarios.get(uuid(1))?.status).toBe("REJEITADO");
  });

  it.each(["ATIVO", "PENDENTE_EMAIL", "DESATIVADO", "REJEITADO"] as const)("conta %s não pode ser aprovada: 409", async (status) => {
    const c = await montar([pendente(1, 0, { status })]);
    const r = await aprovar(c, uuid(1));
    expect(r.statusCode).toBe(409);
    expect(c.banco.usuarios.get(uuid(1))?.status).toBe(status);
    expect(c.banco.analises).toHaveLength(0);
    expect(c.banco.carteiras.size).toBe(0);
  });

  it("sem declaração enviada: 409 com mensagem própria", async () => {
    const c = await montar([pendente(1, 0, { declaracoes: [] })]);
    const r = await aprovar(c, uuid(1));
    expect(r.statusCode).toBe(409);
    expect(r.json().mensagem).toContain("não enviou a declaração");
  });

  it("cadastro inexistente: 404; id inválido: 400", async () => {
    const c = await montar();
    expect((await aprovar(c, uuid(77))).statusCode).toBe(404);
    for (const ruim of ["abc", "1", "123e4567-e89b-12d3-a456-42661417400z"]) {
      expect((await aprovar(c, ruim)).statusCode).toBe(400);
    }
  });

  it.each(["USUARIO", "OPERADOR", "MESTRE"])("%s não aprova: 403 e a conta continua pendente", async (perfil) => {
    const c = await montar([pendente(1, 0)]);
    const r = await aprovar(c, uuid(1), { "x-perfil": perfil });
    expect(r.statusCode).toBe(403);
    expect(c.banco.usuarios.get(uuid(1))?.status).toBe("PENDENTE_APROVACAO");
    expect(c.banco.analises).toHaveLength(0);
  });

  it("sem login: 401", async () => {
    const c = await montar([pendente(1, 0)]);
    expect((await aprovar(c, uuid(1), {})).statusCode).toBe(401);
  });
});

// ---------- rejeitar ----------
describe("POST /admin/cadastros/:id/rejeitar", () => {
  it("rejeita com motivo: REJEITADO, motivo guardado, quem decidiu e o log", async () => {
    const c = await montar([pendente(1, 0)]);
    const r = await rejeitar(c, uuid(1), { motivo: "  Declaração vencida.  " });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ status: "REJEITADO" });
    expect(c.banco.usuarios.get(uuid(1))?.status).toBe("REJEITADO");
    expect(c.banco.carteiras.size).toBe(0); // rejeitado não ganha carteira
    expect(c.banco.analises[0]).toEqual({
      usuarioId: uuid(1),
      declaracaoId: uuid(5001),
      adminId: ADMIN,
      decisao: "REJEITADO",
      motivo: "Declaração vencida.",
    });
    expect(c.banco.logs[0]).toMatchObject({ acao: "REJEITAR_CADASTRO", detalhes: { motivo: "Declaração vencida." } });
  });

  it.each([
    ["sem corpo", undefined],
    ["corpo vazio", {}],
    ["motivo vazio", { motivo: "" }],
    ["só espaços", { motivo: "        " }],
    ["curto demais (4)", { motivo: "abcd" }],
    ["não é texto", { motivo: 123 }],
    ["nulo", { motivo: null }],
    ["longo demais (301)", { motivo: "x".repeat(301) }],
  ])("motivo obrigatório: %s é recusado, nada muda", async (_n, corpo) => {
    const c = await montar([pendente(1, 0)]);
    const r = await rejeitar(c, uuid(1), corpo);
    expect(r.statusCode).toBe(400);
    expect(r.json().campo).toBe("motivo");
    expect(r.json().mensagem).toBe("Informe o motivo da rejeição (de 5 a 300 caracteres).");
    expect(c.banco.usuarios.get(uuid(1))?.status).toBe("PENDENTE_APROVACAO");
    expect(c.banco.analises).toHaveLength(0);
  });

  it("limites do motivo: 5 e 300 caracteres passam", async () => {
    const c = await montar([pendente(1, 0), pendente(2, 1)]);
    expect((await rejeitar(c, uuid(1), { motivo: "12345" })).statusCode).toBe(200);
    expect((await rejeitar(c, uuid(2), { motivo: "x".repeat(300) })).statusCode).toBe(200);
  });

  it("decisão dupla: 409", async () => {
    const c = await montar([pendente(1, 0)]);
    await rejeitar(c, uuid(1), { motivo: "Motivo válido." });
    const r = await rejeitar(c, uuid(1), { motivo: "Outro motivo." }, { ...comoAdmin, "x-usuario": ADMIN_2 });
    expect(r.statusCode).toBe(409);
    expect(c.banco.analises).toHaveLength(1);
  });

  it("a ordem das validações não vaza existência: id inválido é 400 antes do motivo", async () => {
    const c = await montar();
    expect((await rejeitar(c, "abc", { motivo: "Motivo válido." })).statusCode).toBe(400);
    expect((await rejeitar(c, uuid(77), { motivo: "Motivo válido." })).statusCode).toBe(404);
  });

  it("o motivo é guardado como texto (HTML não é interpretado nem limpo)", async () => {
    const c = await montar([pendente(1, 0)]);
    await rejeitar(c, uuid(1), { motivo: "<img src=x onerror=alert(1)>" });
    expect(c.banco.analises[0]?.motivo).toBe("<img src=x onerror=alert(1)>");
  });

  it.each(["USUARIO", "OPERADOR", "MESTRE"])("%s não rejeita: 403", async (perfil) => {
    const c = await montar([pendente(1, 0)]);
    const r = await rejeitar(c, uuid(1), { motivo: "Motivo válido." }, { "x-perfil": perfil });
    expect(r.statusCode).toBe(403);
    expect(c.banco.usuarios.get(uuid(1))?.status).toBe("PENDENTE_APROVACAO");
  });

  it("sem login: 401", async () => {
    const c = await montar([pendente(1, 0)]);
    expect((await rejeitar(c, uuid(1), { motivo: "Motivo válido." }, {})).statusCode).toBe(401);
  });
});

// ---------- guarda: pendente não recarrega nem gera QR ----------
describe("exigirCadastroAtivo", () => {
  async function appComGuarda(status?: "PENDENTE_APROVACAO" | "REJEITADO" | "ATIVO" | "PENDENTE_EMAIL") {
    const app = Fastify();
    app.decorateRequest("usuario");
    app.addHook("onRequest", async (request) => {
      if (request.headers["x-logado"]) request.usuario = { id: ADMIN, perfil: "USUARIO", ...(status && { status }) };
    });
    app.post("/rota-protegida", { preHandler: [exigirPerfil("USUARIO"), exigirCadastroAtivo()] }, async () => ({ ok: true }));
    return app;
  }
  const chamar = (app: Awaited<ReturnType<typeof appComGuarda>>, logado = true) =>
    app.inject({ method: "POST", url: "/rota-protegida", headers: logado ? { "x-logado": "1" } : {} });

  it("conta pendente de aprovação: 403 informando que está em análise", async () => {
    const r = await chamar(await appComGuarda("PENDENTE_APROVACAO"));
    expect(r.statusCode).toBe(403);
    expect(r.json()).toEqual({ codigo: "CADASTRO_PENDENTE", mensagem: "Seu cadastro está em análise. Aguarde a aprovação do Admin." });
  });

  it("conta com e-mail ainda não confirmado: também barrada", async () => {
    expect((await chamar(await appComGuarda("PENDENTE_EMAIL"))).statusCode).toBe(403);
  });

  it("conta rejeitada: 403 pedindo para reenviar a declaração", async () => {
    const r = await chamar(await appComGuarda("REJEITADO"));
    expect(r.statusCode).toBe(403);
    expect(r.json().mensagem).toContain("não foi aprovado");
  });

  it("conta ativa passa", async () => {
    expect((await chamar(await appComGuarda("ATIVO"))).statusCode).toBe(200);
  });

  it("identificador de desenvolvimento (sem status) passa como ativo", async () => {
    expect((await chamar(await appComGuarda())).statusCode).toBe(200);
  });

  it("sem login: 401", async () => {
    expect((await chamar(await appComGuarda("ATIVO"), false)).statusCode).toBe(401);
  });
});

// ---------- o status vem da sessão de verdade ----------
describe("a sessão carrega o status do cadastro", () => {
  it("conta pendente com sessão válida chega à rota com status PENDENTE_APROVACAO", async () => {
    const banco = criarRepoIdentidadeFalso();
    const relogio = criarRelogio();
    const app = await buildApp({
      cardapioRepo,
      identidade: { repo: banco.repo, email: criarEmailFalso().servico, agora: relogio.agora, hasher: criarHasherFalso() },
    });
    app.post("/qualquer", { preHandler: [exigirPerfil("USUARIO"), exigirCadastroAtivo()] }, async () => ({ ok: true }));

    const usuario = banco.semear({ email: "p@alunos.utfpr.edu.br", senha: "Senha@123", perfil: "USUARIO", status: "PENDENTE_APROVACAO" });
    const token = gerarToken();
    await banco.repo.criarSessao({
      usuarioId: usuario.id,
      tokenHash: hashToken(token),
      expiraEm: new Date(relogio.agora().getTime() + VALIDADE_SESSAO_MS),
      agora: relogio.agora(),
    });
    const r = await app.inject({ method: "POST", url: "/qualquer", cookies: { [NOME_COOKIE_SESSAO]: token } });
    expect(r.statusCode).toBe(403);
    expect(r.json().codigo).toBe("CADASTRO_PENDENTE");

    // Depois de aprovado, a mesma sessão passa.
    banco.usuarios.get(usuario.id)!.status = "ATIVO";
    const r2 = await app.inject({ method: "POST", url: "/qualquer", cookies: { [NOME_COOKIE_SESSAO]: token } });
    expect(r2.statusCode).toBe(200);
  });
});
