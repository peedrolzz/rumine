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
const DATA = "2026-11-10";

describe("cardápio", () => {
  let repo: ReturnType<typeof repoFalso>;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    repo = repoFalso();
    app = await buildApp({ cardapioRepo: repo, identificar });
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
});
