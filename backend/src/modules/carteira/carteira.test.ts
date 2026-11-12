import { describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import type { Identificador } from "../../shared/auth.js";
import type { CardapioRepositorio } from "../cardapio/repositorio.js";
import type { CarteiraRepositorio } from "./repositorio.js";

// ---------- apoio ----------
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const EU = uuid(1);
const OUTRO = uuid(2);

type Registro = { saldoCentavos: number; atualizadoEm: Date };

/** Carteiras em memória. As funções recarregar/consumir imitam o que as HU-05 e HU-07/08 farão no banco. */
function criarBanco(carteiras: Record<string, Registro>) {
  const mapa = new Map(Object.entries(carteiras));
  const consultas: string[] = [];
  const repo: CarteiraRepositorio = {
    async buscarSaldo(usuarioId) {
      consultas.push(usuarioId);
      return mapa.get(usuarioId) ?? null;
    },
  };
  const mexer = (id: string, delta: number, quando: string) => {
    const atual = mapa.get(id)!;
    mapa.set(id, { saldoCentavos: atual.saldoCentavos + delta, atualizadoEm: new Date(quando) });
  };
  return {
    repo,
    consultas,
    recarregar: (id: string, centavos: number, quando = "2026-11-12T13:00:00.000Z") => mexer(id, centavos, quando),
    consumir: (id: string, centavos: number, quando = "2026-11-12T14:00:00.000Z") => mexer(id, -centavos, quando),
  };
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
  const status = request.headers["x-status"];
  request.usuario = {
    id: typeof id === "string" ? id : EU,
    perfil: perfil as never,
    ...(typeof status === "string" && { status: status as never }),
  };
};

const INICIAL: Registro = { saldoCentavos: 1250, atualizadoEm: new Date("2026-11-10T12:00:00.000Z") };

async function montar(carteiras: Record<string, Registro> = { [EU]: { ...INICIAL } }) {
  const banco = criarBanco(carteiras);
  const app = await buildApp({ cardapioRepo, carteiraRepo: banco.repo, identificar, hoje: () => "2026-11-12" });
  return { app, banco };
}
type Contexto = Awaited<ReturnType<typeof montar>>;

const comoUsuario = { "x-perfil": "USUARIO" };
const ver = (c: Contexto, consulta = "", headers: Record<string, string> = comoUsuario) =>
  c.app.inject({ method: "GET", url: `/carteira${consulta}`, headers });

// ---------- saldo ----------
describe("GET /carteira", () => {
  it("devolve o saldo em centavos e a data da última atualização", async () => {
    const c = await montar();
    const r = await ver(c);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ saldoCentavos: 1250, atualizadoEm: "2026-11-10T12:00:00.000Z" });
  });

  it("saldo zero: devolve 0 (o front mostra R$ 0,00)", async () => {
    const c = await montar({ [EU]: { saldoCentavos: 0, atualizadoEm: INICIAL.atualizadoEm } });
    expect((await ver(c)).json().saldoCentavos).toBe(0);
  });

  it("conta ativa sem carteira (dado incompleto): R$ 0,00 em vez de erro", async () => {
    const c = await montar({});
    const r = await ver(c);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ saldoCentavos: 0, atualizadoEm: null });
  });

  it("depois de uma recarga o saldo está atualizado", async () => {
    const c = await montar();
    c.banco.recarregar(EU, 2000);
    expect((await ver(c)).json()).toEqual({ saldoCentavos: 3250, atualizadoEm: "2026-11-12T13:00:00.000Z" });
  });

  it("depois de consumir uma refeição o saldo está atualizado", async () => {
    const c = await montar();
    c.banco.consumir(EU, 350);
    expect((await ver(c)).json()).toEqual({ saldoCentavos: 900, atualizadoEm: "2026-11-12T14:00:00.000Z" });
  });

  it("recarga e consumo em sequência: cada consulta vê o valor mais novo", async () => {
    const c = await montar({ [EU]: { saldoCentavos: 0, atualizadoEm: INICIAL.atualizadoEm } });
    c.banco.recarregar(EU, 1000);
    expect((await ver(c)).json().saldoCentavos).toBe(1000);
    c.banco.consumir(EU, 350);
    expect((await ver(c)).json().saldoCentavos).toBe(650);
    c.banco.consumir(EU, 650);
    expect((await ver(c)).json().saldoCentavos).toBe(0);
  });

  it("nunca vai para cache (o saldo muda a cada movimento)", async () => {
    const c = await montar();
    expect((await ver(c)).headers["cache-control"]).toBe("no-store");
  });

  it("só passa os campos combinados", async () => {
    const c = await montar();
    expect(Object.keys((await ver(c)).json()).sort()).toEqual(["atualizadoEm", "saldoCentavos"]);
  });

  it("cada usuário vê só o próprio saldo", async () => {
    const c = await montar({ [EU]: { ...INICIAL }, [OUTRO]: { saldoCentavos: 99999, atualizadoEm: INICIAL.atualizadoEm } });
    expect((await ver(c)).json().saldoCentavos).toBe(1250);
    expect((await ver(c, "", { ...comoUsuario, "x-usuario": OUTRO })).json().saldoCentavos).toBe(99999);
    expect(c.banco.consultas).toEqual([EU, OUTRO]);
  });
});

// ---------- saldo de terceiros ----------
describe("saldo de outro usuário", () => {
  it("pedir o saldo de outra pessoa é negado (403) e nada é consultado", async () => {
    const c = await montar({ [EU]: { ...INICIAL }, [OUTRO]: { saldoCentavos: 99999, atualizadoEm: INICIAL.atualizadoEm } });
    const r = await ver(c, `?usuarioId=${OUTRO}`);
    expect(r.statusCode).toBe(403);
    expect(r.json()).toEqual({ mensagem: "Você só pode ver o seu próprio saldo." });
    expect(r.body).not.toContain("99999");
    expect(c.banco.consultas).toHaveLength(0);
  });

  it("informar o próprio id é aceito", async () => {
    const c = await montar();
    expect((await ver(c, `?usuarioId=${EU}`)).statusCode).toBe(200);
  });

  it.each(["abc", "", "1", "' OR 1=1 --"])("id %j que não é o do usuário: 403", async (id) => {
    const c = await montar();
    expect((await ver(c, `?usuarioId=${encodeURIComponent(id)}`)).statusCode).toBe(403);
  });
});

// ---------- quem pode ver ----------
describe("acesso à carteira", () => {
  it("sem login: 401", async () => {
    const c = await montar();
    expect((await ver(c, "", {})).statusCode).toBe(401);
  });

  it.each(["OPERADOR", "ADMIN", "MESTRE"])("%s não tem carteira: 403", async (perfil) => {
    const c = await montar();
    const r = await ver(c, "", { "x-perfil": perfil });
    expect(r.statusCode).toBe(403);
    expect(c.banco.consultas).toHaveLength(0);
  });

  it("conta em análise: 403 informando que o cadastro está em análise", async () => {
    const c = await montar();
    const r = await ver(c, "", { ...comoUsuario, "x-status": "PENDENTE_APROVACAO" });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toEqual({ codigo: "CADASTRO_PENDENTE", mensagem: "Seu cadastro está em análise. Aguarde a aprovação do Admin." });
    expect(c.banco.consultas).toHaveLength(0);
  });

  it("conta rejeitada: 403", async () => {
    const c = await montar();
    expect((await ver(c, "", { ...comoUsuario, "x-status": "REJEITADO" })).statusCode).toBe(403);
  });

  it("conta ativa passa", async () => {
    const c = await montar();
    expect((await ver(c, "", { ...comoUsuario, "x-status": "ATIVO" })).statusCode).toBe(200);
  });
});
