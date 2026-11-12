import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import type { Identificador } from "../../shared/auth.js";
import type { CardapioRepositorio } from "../cardapio/repositorio.js";
import { codificarCursor, decodificarCursor } from "../../shared/cursor.js";
import type { HistoricoRepositorio, Movimento } from "./repositorio.js";

// ---------- apoio ----------
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const EU = uuid(900);
const OUTRO = uuid(901);

type Registro = Movimento & { usuarioId: string };

// Repositório em memória com a mesma semântica do banco: ordem (data desc, id desc) e "depois do cursor".
function repoFalso(registros: Registro[]) {
  const chamadas: string[] = [];
  const depoisDe = (depois: { data: Date; id: string } | undefined, m: Movimento) =>
    !depois || m.data < depois.data || (m.data.getTime() === depois.data.getTime() && m.id < depois.id);
  const ordenar = (a: Movimento, b: Movimento) =>
    b.data.getTime() - a.data.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

  const repo: HistoricoRepositorio = {
    async transacoes({ usuarioId, tipos, depois, quantidade }) {
      chamadas.push("transacoes");
      return registros
        .filter((r) => r.usuarioId === usuarioId && (tipos as string[]).includes(r.tipo) && depoisDe(depois, r))
        .sort(ordenar)
        .slice(0, quantidade);
    },
    async refeicoesIsentas({ usuarioId, depois, quantidade }) {
      chamadas.push("isentas");
      return registros
        .filter((r) => r.usuarioId === usuarioId && r.tipo === "REFEICAO_ISENTA" && depoisDe(depois, r))
        .sort(ordenar)
        .slice(0, quantidade);
    },
  };
  return { repo, chamadas };
}

const cardapioRepo: CardapioRepositorio = {
  async salvar(data) {
    return { data, itens: [] };
  },
  async buscar() {
    return null;
  },
};

// Perfil e id do usuário vêm dos cabeçalhos (sem x-perfil = sem login).
const identificar: Identificador = (request) => {
  const perfil = request.headers["x-perfil"];
  if (typeof perfil === "string") {
    const id = request.headers["x-usuario"];
    request.usuario = { id: typeof id === "string" ? id : EU, perfil: perfil as never };
  }
};

let n = 0;
const mov = (
  tipo: Movimento["tipo"],
  minutosAtras: number,
  valorCentavos = 350,
  extra: Partial<Registro> = {},
): Registro => ({
  id: uuid(++n),
  usuarioId: EU,
  tipo,
  valorCentavos,
  saldoAposCentavos: tipo === "REFEICAO_ISENTA" ? null : 1000,
  data: new Date(Date.UTC(2026, 10, 10, 15, 0, 0) - minutosAtras * 60_000),
  ...extra,
});

async function consultar(
  registros: Registro[],
  query = "",
  headers: Record<string, string> = { "x-perfil": "USUARIO" },
) {
  const { repo, chamadas } = repoFalso(registros);
  const app = await buildApp({ cardapioRepo, historicoRepo: repo, identificar });
  const r = await app.inject({ method: "GET", url: `/historico${query}`, headers });
  return { r, corpo: r.json(), chamadas };
}

// Percorre todas as páginas e devolve tudo, na ordem recebida.
async function percorrer(registros: Registro[], limite: number, tipo = "todos") {
  const { repo } = repoFalso(registros);
  const app = await buildApp({ cardapioRepo, historicoRepo: repo, identificar });
  const ids: string[] = [];
  const tamanhos: number[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 200; i++) {
    const url: string = `/historico?tipo=${tipo}&limite=${limite}${cursor ? `&cursor=${cursor}` : ""}`;
    const r = await app.inject({ method: "GET", url, headers: { "x-perfil": "USUARIO" } });
    expect(r.statusCode).toBe(200);
    const pagina = r.json() as { itens: { id: string }[]; proximoCursor: string | null };
    tamanhos.push(pagina.itens.length);
    ids.push(...pagina.itens.map((x) => x.id));
    cursor = pagina.proximoCursor;
    if (!cursor) return { ids, tamanhos };
  }
  throw new Error("Paginação não terminou (loop infinito).");
}

beforeEach(() => {
  n = 0;
});

// ---------- testes ----------
describe("GET /historico", () => {
  it("lista recargas e refeições do usuário, da mais recente para a mais antiga, com data, tipo e valor", async () => {
    const { r, corpo } = await consultar([
      mov("RECARGA", 300, 2000),
      mov("DEBITO_REFEICAO", 10, 350),
      mov("DEBITO_REFEICAO", 100, 350),
    ]);
    expect(r.statusCode).toBe(200);
    expect(corpo.itens.map((i: { tipo: string }) => i.tipo)).toEqual(["DEBITO_REFEICAO", "DEBITO_REFEICAO", "RECARGA"]);
    expect(corpo.itens[0]).toMatchObject({ valorCentavos: 350, saldoAposCentavos: 1000, data: "2026-11-10T14:50:00.000Z" });
    expect(corpo.itens[2]).toMatchObject({ tipo: "RECARGA", valorCentavos: 2000 });
    expect(corpo.proximoCursor).toBeNull();
  });

  it("um movimento novo aparece no topo", async () => {
    const base = [mov("RECARGA", 60)];
    const antes = (await consultar(base)).corpo;
    const depois = (await consultar([...base, mov("DEBITO_REFEICAO", 1)])).corpo;
    expect(antes.itens).toHaveLength(1);
    expect(depois.itens[0].tipo).toBe("DEBITO_REFEICAO");
    expect(depois.itens).toHaveLength(2);
  });

  it("só devolve os movimentos do próprio usuário (nunca os de outro)", async () => {
    const { corpo } = await consultar([
      mov("RECARGA", 10, 500),
      mov("RECARGA", 5, 9999, { usuarioId: OUTRO }),
      mov("REFEICAO_ISENTA" as never, 2, 0, { usuarioId: OUTRO }),
    ]);
    expect(corpo.itens).toHaveLength(1);
    expect(corpo.itens[0].valorCentavos).toBe(500);
  });

  it("a resposta não expõe ids de usuário nem de carteira", async () => {
    const { r } = await consultar([mov("RECARGA", 1)]);
    expect(r.body).not.toContain(EU);
    expect(Object.keys(r.json().itens[0]).sort()).toEqual(["data", "id", "saldoAposCentavos", "tipo", "valorCentavos"]);
  });

  it("estado vazio: usuário sem movimentos recebe lista vazia, não erro", async () => {
    const { r, corpo } = await consultar([]);
    expect(r.statusCode).toBe(200);
    expect(corpo).toEqual({ itens: [], proximoCursor: null });
  });

  describe("PAE (refeição isenta)", () => {
    it("aparece no histórico com valor zero e sem saldo, na ordem certa entre as outras", async () => {
      const { corpo } = await consultar([
        mov("RECARGA", 300, 2000),
        mov("REFEICAO_ISENTA", 100, 0),
        mov("DEBITO_REFEICAO", 10, 350),
      ]);
      expect(corpo.itens.map((i: { tipo: string }) => i.tipo)).toEqual(["DEBITO_REFEICAO", "REFEICAO_ISENTA", "RECARGA"]);
      expect(corpo.itens[1]).toMatchObject({ tipo: "REFEICAO_ISENTA", valorCentavos: 0, saldoAposCentavos: null });
    });
  });

  describe("sinais e valores", () => {
    it("devolve sempre o valor positivo, mesmo que o banco guarde o débito negativo", async () => {
      const { corpo } = await consultar([mov("DEBITO_REFEICAO", 1, -350), mov("RECARGA", 2, 2000)]);
      expect(corpo.itens[0].valorCentavos).toBe(350);
      expect(corpo.itens.every((i: { valorCentavos: number }) => i.valorCentavos >= 0)).toBe(true);
    });
  });

  describe("filtros", () => {
    const dados = () => [
      mov("RECARGA", 50, 2000),
      mov("DEBITO_REFEICAO", 40),
      mov("REFEICAO_ISENTA", 30, 0),
      mov("ESTORNO", 20),
    ];
    const tipos = async (query: string) =>
      (await consultar(dados(), query)).corpo.itens.map((i: { tipo: string }) => i.tipo);

    it("todos (padrão) mostra os quatro tipos", async () => {
      expect(await tipos("")).toEqual(["ESTORNO", "REFEICAO_ISENTA", "DEBITO_REFEICAO", "RECARGA"]);
      expect(await tipos("?tipo=todos")).toHaveLength(4);
    });
    it("recargas mostra só recargas", async () => {
      expect(await tipos("?tipo=recargas")).toEqual(["RECARGA"]);
    });
    it("consumo mostra refeições pagas e isentas (PAE)", async () => {
      expect(await tipos("?tipo=consumo")).toEqual(["REFEICAO_ISENTA", "DEBITO_REFEICAO"]);
    });
    it("estornos mostra só estornos", async () => {
      expect(await tipos("?tipo=estornos")).toEqual(["ESTORNO"]);
    });
    it("filtros que não incluem PAE nem consultam a tabela de consumo", async () => {
      expect((await consultar(dados(), "?tipo=recargas")).chamadas).toEqual(["transacoes"]);
      expect((await consultar(dados(), "?tipo=estornos")).chamadas).toEqual(["transacoes"]);
      expect((await consultar(dados(), "?tipo=consumo")).chamadas.sort()).toEqual(["isentas", "transacoes"]);
    });
    it("filtro desconhecido é recusado, indicando o campo", async () => {
      const { r, corpo } = await consultar(dados(), "?tipo=tudo");
      expect(r.statusCode).toBe(400);
      expect(corpo.campo).toBe("tipo");
      expect(corpo.mensagem).toMatch(/Filtro inválido/);
    });
  });

  describe("paginação", () => {
    const muitos = (qtd: number) => Array.from({ length: qtd }, (_, i) => mov("DEBITO_REFEICAO", i + 1));

    it("padrão de 20 por página: 45 registros viram 20 + 20 + 5, sem repetir nem pular", async () => {
      const dados = muitos(45);
      const { ids, tamanhos } = await percorrer(dados, 20);
      expect(tamanhos).toEqual([20, 20, 5]);
      expect(new Set(ids).size).toBe(45);
      // mesma ordem do banco: do mais recente (menos minutos atrás) para o mais antigo
      expect(ids).toEqual(dados.map((d) => d.id));
    });

    it("sem informar limite, a primeira página tem 20", async () => {
      const { corpo } = await consultar(muitos(30));
      expect(corpo.itens).toHaveLength(20);
      expect(corpo.proximoCursor).not.toBeNull();
    });

    it("exatamente `limite` registros: uma página só, sem próxima", async () => {
      const { corpo } = await consultar(muitos(20), "?limite=20");
      expect(corpo.itens).toHaveLength(20);
      expect(corpo.proximoCursor).toBeNull();
    });

    it("`limite` + 1 registros: existe uma segunda página com 1 item", async () => {
      const { ids, tamanhos } = await percorrer(muitos(21), 20);
      expect(tamanhos).toEqual([20, 1]);
      expect(ids).toHaveLength(21);
    });

    it("limite 1 percorre tudo, um por vez, misturando transações e PAE", async () => {
      const dados = [
        mov("RECARGA", 50, 2000),
        mov("REFEICAO_ISENTA", 40, 0),
        mov("DEBITO_REFEICAO", 30),
        mov("REFEICAO_ISENTA", 20, 0),
        mov("ESTORNO", 10),
      ];
      const { ids, tamanhos } = await percorrer(dados, 1);
      expect(tamanhos).toEqual([1, 1, 1, 1, 1]);
      expect(ids).toEqual([...dados].reverse().map((d) => d.id)); // 10, 20, 30, 40, 50 min atrás
    });

    it("movimentos no MESMO instante (inclusive entre as duas tabelas) não se perdem nem se repetem", async () => {
      const mesmaHora = (tipo: Movimento["tipo"]) => mov(tipo, 5, tipo === "REFEICAO_ISENTA" ? 0 : 350);
      const dados = [
        ...Array.from({ length: 4 }, () => mesmaHora("DEBITO_REFEICAO")),
        ...Array.from({ length: 4 }, () => mesmaHora("REFEICAO_ISENTA")),
        mov("RECARGA", 60, 2000),
      ];
      for (const limite of [1, 2, 3, 4, 5]) {
        const { ids } = await percorrer(dados, limite);
        expect(ids, `limite ${limite}`).toHaveLength(dados.length);
        expect(new Set(ids).size, `limite ${limite}`).toBe(dados.length);
      }
    });

    it("movimento novo entre uma página e outra não duplica nem pula os antigos", async () => {
      const antigos = muitos(5).map((m, i) => ({ ...m, data: new Date(m.data.getTime() - 3_600_000 * (i + 1)) }));
      const { repo } = repoFalso(antigos);
      const app = await buildApp({ cardapioRepo, historicoRepo: repo, identificar });
      const h = { "x-perfil": "USUARIO" };

      const p1 = (await app.inject({ method: "GET", url: "/historico?limite=2", headers: h })).json();
      antigos.push(mov("RECARGA", 0, 5000)); // chega um movimento mais novo no meio da navegação
      const p2 = (
        await app.inject({ method: "GET", url: `/historico?limite=2&cursor=${p1.proximoCursor}`, headers: h })
      ).json();

      const ids = [...p1.itens, ...p2.itens].map((i: { id: string }) => i.id);
      expect(new Set(ids).size).toBe(4);
      expect(ids).toEqual(antigos.slice(0, 4).map((a) => a.id));
    });

    it("o cursor funciona com o filtro mantido nas páginas seguintes", async () => {
      const dados = [...muitos(7), mov("RECARGA", 500, 2000), mov("RECARGA", 600, 2000), mov("RECARGA", 700, 2000)];
      const { ids, tamanhos } = await percorrer(dados, 2, "recargas");
      expect(tamanhos).toEqual([2, 1]);
      expect(ids).toHaveLength(3);
    });

    describe("limite", () => {
      it.each(["0", "-1", "51", "1.5", "abc", ""])("recusa limite=%j indicando o campo", async (valor) => {
        const { r, corpo } = await consultar([], `?limite=${valor}`);
        expect(r.statusCode).toBe(400);
        expect(corpo.campo).toBe("limite");
        expect(corpo.mensagem).toBe("Limite inválido. Use um número de 1 a 50.");
      });
      it.each(["1", "50"])("aceita limite=%s", async (valor) => {
        expect((await consultar([], `?limite=${valor}`)).r.statusCode).toBe(200);
      });
    });

    describe("cursor", () => {
      const invalidos: [string, string][] = [
        ["texto qualquer", "lixo"],
        ["base64 de texto que não é JSON", Buffer.from("não é json").toString("base64url")],
        ["JSON de outro formato", Buffer.from(JSON.stringify({ x: 1 })).toString("base64url")],
        ["id que não é UUID", Buffer.from(JSON.stringify({ d: "2026-11-10T10:00:00.000Z", i: "123" })).toString("base64url")],
        ["data inválida", Buffer.from(JSON.stringify({ d: "ontem", i: uuid(1) })).toString("base64url")],
        ["JSON null", Buffer.from("null").toString("base64url")],
        ["caracteres estranhos", "%%%"],
      ];
      it.each(invalidos)("recusa cursor inválido (%s) com 400 e não com erro 500", async (_nome, cursor) => {
        const { r, corpo } = await consultar([mov("RECARGA", 1)], `?cursor=${encodeURIComponent(cursor)}`);
        expect(r.statusCode).toBe(400);
        expect(corpo).toEqual({ campo: "cursor", mensagem: "Cursor inválido." });
      });

      it("cursor vazio também é recusado", async () => {
        expect((await consultar([], "?cursor=")).r.statusCode).toBe(400);
      });
    });
  });

  describe("acesso", () => {
    it("sem login responde 401", async () => {
      const { r } = await consultar([mov("RECARGA", 1)], "", {});
      expect(r.statusCode).toBe(401);
    });

    it.each(["USUARIO", "OPERADOR", "ADMIN", "MESTRE"])("o perfil %s vê o próprio histórico", async (perfil) => {
      const { r } = await consultar([mov("RECARGA", 1)], "", { "x-perfil": perfil });
      expect(r.statusCode).toBe(200);
    });

    it("pedir o histórico de outra pessoa é negado (403) e nada é consultado", async () => {
      const { r, corpo, chamadas } = await consultar([mov("RECARGA", 1, 500, { usuarioId: OUTRO })], `?usuarioId=${OUTRO}`);
      expect(r.statusCode).toBe(403);
      expect(corpo.mensagem).toBe("Você só pode ver o seu próprio histórico.");
      expect(chamadas).toEqual([]);
    });

    it("nem o Admin vê o histórico de terceiros por aqui (o geral é a HU-10)", async () => {
      const { r } = await consultar([], `?usuarioId=${OUTRO}`, { "x-perfil": "ADMIN" });
      expect(r.statusCode).toBe(403);
    });

    it("informar o próprio id é aceito", async () => {
      const { r } = await consultar([mov("RECARGA", 1)], `?usuarioId=${EU}`);
      expect(r.statusCode).toBe(200);
    });

    it("dois usuários logados enxergam cada um só o seu", async () => {
      const dados = [mov("RECARGA", 10, 1111), mov("RECARGA", 10, 2222, { usuarioId: OUTRO })];
      const meu = (await consultar(dados, "", { "x-perfil": "USUARIO", "x-usuario": EU })).corpo;
      const dele = (await consultar(dados, "", { "x-perfil": "USUARIO", "x-usuario": OUTRO })).corpo;
      expect(meu.itens.map((i: { valorCentavos: number }) => i.valorCentavos)).toEqual([1111]);
      expect(dele.itens.map((i: { valorCentavos: number }) => i.valorCentavos)).toEqual([2222]);
    });
  });

  it("falha do banco vira 500 genérico, sem vazar detalhes", async () => {
    const quebrado: HistoricoRepositorio = {
      async transacoes() {
        throw new Error("connection refused 10.0.0.5:5432 segredo");
      },
      async refeicoesIsentas() {
        throw new Error("segredo");
      },
    };
    const app = await buildApp({ cardapioRepo, historicoRepo: quebrado, identificar });
    const r = await app.inject({ method: "GET", url: "/historico", headers: { "x-perfil": "USUARIO" } });
    expect(r.statusCode).toBe(500);
    expect(r.json()).toEqual({ mensagem: "Erro interno. Tente novamente em instantes." });
    expect(r.body).not.toMatch(/segredo|10\.0\.0\.5/);
  });
});

describe("cursor", () => {
  it("ida e volta preservam data (com milissegundos) e id", () => {
    const posicao = { data: new Date("2026-11-10T14:50:33.123Z"), id: uuid(7) };
    const depois = decodificarCursor(codificarCursor(posicao));
    expect(depois?.data.getTime()).toBe(posicao.data.getTime());
    expect(depois?.id).toBe(posicao.id);
  });

  it("é texto seguro para URL (sem +, / ou =)", () => {
    expect(codificarCursor({ data: new Date(), id: uuid(1) })).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each(["", "   ", "###", "e30", "bnVsbA", "W10"])("decodificar %j devolve null, sem lançar exceção", (texto) => {
    expect(decodificarCursor(texto)).toBeNull();
  });
});

describe("integração com o cardápio", () => {
  it("sem historicoRepo a rota não existe (404), e o cardápio segue funcionando", async () => {
    const app = await buildApp({ cardapioRepo, identificar });
    expect((await app.inject({ method: "GET", url: "/historico", headers: { "x-perfil": "USUARIO" } })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
  });
});
