import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import type { Identificador } from "../../shared/auth.js";
import type { CardapioDia, CardapioRepositorio } from "./repositorio.js";

// Repositório em memória: os testes não precisam de banco.
function repoFalso(): CardapioRepositorio & { publicadoPor: Map<string, string> } {
  const dados = new Map<string, CardapioDia>();
  const publicadoPor = new Map<string, string>();
  return {
    publicadoPor,
    async salvar(data, usuarioId, itens) {
      dados.set(data, { data, itens });
      publicadoPor.set(data, usuarioId);
      return { data, itens };
    },
    async buscar(data) {
      return dados.get(data) ?? null;
    },
  };
}

// Identificador falso: o perfil vem do cabeçalho x-perfil (sem cabeçalho = sem login).
const identificar: Identificador = (request) => {
  const perfil = request.headers["x-perfil"];
  if (typeof perfil === "string") {
    request.usuario = { id: `id-${perfil}`, perfil: perfil as never };
  }
};

const cardapio = {
  proteinaAnimal: "Frango grelhado",
  proteinaVegetariana: "Omelete de legumes",
  carboidrato1: "Arroz branco",
  carboidrato2: "Feijão",
  carboidrato3: "Batata cozida",
  salada1: "Alface e tomate",
  salada2: "Cenoura ralada",
  sobremesa: "Banana",
  suco: "Laranja",
};
const CHAVES = Object.keys(cardapio);
const DATA = "2026-11-10"; // "hoje" fixo nos testes

describe("cardápio", () => {
  let repo: ReturnType<typeof repoFalso>;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    repo = repoFalso();
    app = await buildApp({ cardapioRepo: repo, identificar, hoje: () => DATA });
  });

  const salvar = (perfil: string | undefined, corpo: unknown, data = DATA) =>
    app.inject({
      method: "PUT",
      url: `/cardapios/${data}`,
      payload: corpo as object,
      headers: perfil ? { "x-perfil": perfil } : {},
    });
  const consultar = (perfil: string | undefined, data = DATA) =>
    app.inject({ method: "GET", url: `/cardapios/${data}`, headers: perfil ? { "x-perfil": perfil } : {} });

  it("admin cadastra e o usuário vê o cardápio naquela data", async () => {
    expect((await salvar("ADMIN", cardapio)).statusCode).toBe(200);
    expect(repo.publicadoPor.get(DATA)).toBe("id-ADMIN");

    const resposta = await consultar("USUARIO");
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ data: DATA, ...cardapio });
  });

  it("editar substitui a versão anterior", async () => {
    await salvar("ADMIN", cardapio);
    await salvar("ADMIN", { ...cardapio, sobremesa: "Gelatina" });

    expect((await consultar("USUARIO")).json().sobremesa).toBe("Gelatina");
  });

  it.each(CHAVES)(
    "recusa e indica o campo quando %s está vazio",
    async (campo) => {
      const resposta = await salvar("ADMIN", { ...cardapio, [campo]: "   " });
      expect(resposta.statusCode).toBe(400);
      expect(resposta.json().campo).toBe(campo);
      expect(resposta.json().mensagem).toMatch(/^Preencha o campo/);
      expect((await consultar("USUARIO")).statusCode).toBe(404);
    },
  );

  it("recusa campo ausente e data inválida", async () => {
    const { suco: _, ...semSuco } = cardapio;
    const ausente = await salvar("ADMIN", semSuco);
    expect(ausente.statusCode).toBe(400);
    expect(ausente.json().campo).toBe("suco");

    const dataInvalida = await salvar("ADMIN", cardapio, "2026-02-31");
    expect(dataInvalida.statusCode).toBe(400);
    expect(dataInvalida.json().campo).toBe("data");
  });

  it.each(["USUARIO", "OPERADOR", "MESTRE"])("nega o cadastro para o perfil %s", async (perfil) => {
    const resposta = await salvar(perfil, cardapio);
    expect(resposta.statusCode).toBe(403);
    expect((await consultar("ADMIN")).statusCode).toBe(404);
  });

  it("sem login responde 401 no cadastro e na consulta", async () => {
    expect((await salvar(undefined, cardapio)).statusCode).toBe(401);
    expect((await consultar(undefined)).statusCode).toBe(401);
  });

  it("data sem cardápio devolve 404 com mensagem em português", async () => {
    const resposta = await consultar("USUARIO");
    expect(resposta.statusCode).toBe(404);
    expect(resposta.json().mensagem).toBe("O cardápio desta data ainda não foi publicado.");
  });

  it("não permite cadastrar nem editar datas anteriores a hoje", async () => {
    const cadastro = await salvar("ADMIN", cardapio, "2026-11-09");
    expect(cadastro.statusCode).toBe(400);
    expect(cadastro.json().campo).toBe("data");
    expect(cadastro.json().mensagem).toMatch(/já passou/);
    expect((await consultar("ADMIN", "2026-11-09")).statusCode).toBe(404);
  });

  it("não permite editar um cardápio que ficou no passado", async () => {
    await salvar("ADMIN", cardapio);
    const futuro = await buildApp({ cardapioRepo: repo, identificar, hoje: () => "2026-11-11" });
    const edicao = await futuro.inject({
      method: "PUT",
      url: `/cardapios/${DATA}`,
      payload: { ...cardapio, sobremesa: "Gelatina" },
      headers: { "x-perfil": "ADMIN" },
    });
    expect(edicao.statusCode).toBe(400);
    const consulta = await futuro.inject({ method: "GET", url: `/cardapios/${DATA}`, headers: { "x-perfil": "USUARIO" } });
    expect(consulta.statusCode).toBe(200);
    expect(consulta.json().sobremesa).toBe("Banana");
  });

  it("permite cadastrar para hoje e para datas futuras", async () => {
    expect((await salvar("ADMIN", cardapio, "2026-11-10")).statusCode).toBe(200);
    expect((await salvar("ADMIN", cardapio, "2026-12-01")).statusCode).toBe(200);
  });

  describe("entradas inesperadas", () => {
    const put = (payload: unknown, headers: Record<string, string> = { "x-perfil": "ADMIN" }, data = DATA) =>
      app.inject({ method: "PUT", url: `/cardapios/${data}`, payload: payload as never, headers });

    it("remove espaços nas pontas ao gravar", async () => {
      await put(Object.fromEntries(CHAVES.map((c) => [c, `  ${c}  `])));
      const lido = (await consultar("USUARIO")).json();
      for (const c of CHAVES) expect(lido[c]).toBe(c);
    });

    it("ignora campos extras e o autor vem da sessão, nunca do corpo", async () => {
      const r = await put({ ...cardapio, publicadoPor: "outro-id", itens: [] });
      expect(r.statusCode).toBe(200);
      expect(r.json()).not.toHaveProperty("publicadoPor");
      expect(repo.publicadoPor.get(DATA)).toBe("id-ADMIN");
    });

    it("aceita exatamente 200 caracteres e recusa 201, indicando o campo", async () => {
      expect((await put({ ...cardapio, suco: "a".repeat(200) })).statusCode).toBe(200);
      const longo = await put({ ...cardapio, suco: "a".repeat(201) });
      expect(longo.statusCode).toBe(400);
      expect(longo.json().campo).toBe("suco");
      expect(longo.json().mensagem).toMatch(/no máximo 200/);
    });

    it("recusa valores que não são texto", async () => {
      for (const valor of [123, true, null, ["x"], { a: 1 }]) {
        const r = await put({ ...cardapio, salada1: valor });
        expect(r.statusCode).toBe(400);
        expect(r.json().campo).toBe("salada1");
      }
    });

    it("recusa corpo ausente, null, array e texto com mensagem em português", async () => {
      for (const corpo of [undefined, null, [], "texto"]) {
        const r = await app.inject({
          method: "PUT",
          url: `/cardapios/${DATA}`,
          headers: { "x-perfil": "ADMIN", "content-type": "application/json" },
          ...(corpo === undefined ? {} : { payload: JSON.stringify(corpo) }),
        });
        expect(r.statusCode).toBe(400);
        expect(r.json().mensagem).not.toMatch(/Invalid|expected|received/i);
      }
    });

    it("JSON inválido e tipo de conteúdo errado respondem { mensagem } em português", async () => {
      const quebrado = await app.inject({
        method: "PUT",
        url: `/cardapios/${DATA}`,
        headers: { "x-perfil": "ADMIN", "content-type": "application/json" },
        payload: "{quebrado",
      });
      expect(quebrado.statusCode).toBe(400);
      expect(quebrado.json()).toEqual({ mensagem: "Requisição inválida." });

      const semTipo = await app.inject({
        method: "PUT",
        url: `/cardapios/${DATA}`,
        headers: { "x-perfil": "ADMIN", "content-type": "application/x-www-form-urlencoded" },
        payload: "oi",
      });
      expect(semTipo.statusCode).toBe(415);
      expect(semTipo.json()).toEqual({ mensagem: "Requisição inválida." });
    });

    it.each(["2026-13-01", "2026-00-10", "2026-11-31", "2026-11-1", "26-11-10", "10%2F11%2F2026", "abc", "2026-11-10x"])(
      "recusa a data inválida %j",
      async (data) => {
        const g = await consultar("ADMIN", data);
        expect(g.statusCode).toBe(400);
        expect(g.json().campo).toBe("data");
        expect((await put(cardapio, undefined, data)).statusCode).toBe(400);
      },
    );

    it.each(["0000-01-01", "1999-12-31", "2101-01-01", "9999-12-31"])(
      "recusa data fora do intervalo razoável (%s)",
      async (data) => {
        const g = await consultar("ADMIN", data);
        expect(g.statusCode).toBe(400);
        expect(g.json().campo).toBe("data");
        expect((await put(cardapio, undefined, data)).statusCode).toBe(400);
      },
    );

    it("aceita 29/02 em ano bissexto e recusa em ano comum", async () => {
      const bissexto = await buildApp({ cardapioRepo: repo, identificar, hoje: () => "2028-01-01" });
      const ok = await bissexto.inject({
        method: "PUT",
        url: "/cardapios/2028-02-29",
        payload: cardapio,
        headers: { "x-perfil": "ADMIN" },
      });
      expect(ok.statusCode).toBe(200);
      expect((await put(cardapio, undefined, "2027-02-29")).statusCode).toBe(400);
    });
  });

  it("erro interno vira 500 genérico, sem vazar detalhes do banco", async () => {
    const quebrado: CardapioRepositorio = {
      async salvar() {
        throw new Error("password authentication failed for user rumine /caminho/secreto");
      },
      async buscar() {
        throw new Error("segredo interno");
      },
    };
    const a = await buildApp({ cardapioRepo: quebrado, identificar, hoje: () => DATA });
    const h = { "x-perfil": "ADMIN" };
    const put = await a.inject({ method: "PUT", url: `/cardapios/${DATA}`, payload: cardapio, headers: h });
    const get = await a.inject({ method: "GET", url: `/cardapios/${DATA}`, headers: h });
    for (const r of [put, get]) {
      expect(r.statusCode).toBe(500);
      expect(r.json()).toEqual({ mensagem: "Erro interno. Tente novamente em instantes." });
      expect(r.body).not.toMatch(/segredo|secreto|password/);
    }
  });

  it("perfil sem permissão recebe 403 antes de qualquer validação do corpo", async () => {
    const r = await app.inject({ method: "PUT", url: `/cardapios/${DATA}`, headers: { "x-perfil": "USUARIO" }, payload: {} });
    expect(r.statusCode).toBe(403);
  });

  it("cadastro recusado por data passada não grava nada", async () => {
    const r = await salvar("ADMIN", cardapio, "2026-11-01");
    expect(r.statusCode).toBe(400);
    expect(repo.publicadoPor.has("2026-11-01")).toBe(false);
  });
});
