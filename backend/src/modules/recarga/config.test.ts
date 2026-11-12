import { describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import type { Identificador } from "../../shared/auth.js";
import type { CardapioRepositorio } from "../cardapio/repositorio.js";
import { simulacaoDemoEmProducao, simulacaoHabilitada } from "./config.js";
import { criarGatewaySimulado } from "./gateway.js";
import type { RecargaRepositorio } from "./repositorio.js";

describe("simulacaoHabilitada", () => {
  it.each([
    [{}, true],
    [{ NODE_ENV: "development" }, true],
    [{ NODE_ENV: "test" }, true],
    [{ NODE_ENV: "development", PAGAMENTO_SIMULACAO_DEMO: "false" }, true],
  ])("fora de produção sempre liga: %j", (env, esperado) => {
    expect(simulacaoHabilitada(env)).toBe(esperado);
  });

  it("em produção, sem o interruptor, fica DESLIGADA", () => {
    expect(simulacaoHabilitada({ NODE_ENV: "production" })).toBe(false);
  });

  it("em produção, o interruptor exato 'true' liga", () => {
    expect(simulacaoHabilitada({ NODE_ENV: "production", PAGAMENTO_SIMULACAO_DEMO: "true" })).toBe(true);
  });

  it.each(["", "TRUE", "True", "1", "yes", "sim", "false", " true", "true ", "on"])(
    "em produção, o valor %j NÃO liga (só o texto exato 'true')",
    (valor) => {
      expect(simulacaoHabilitada({ NODE_ENV: "production", PAGAMENTO_SIMULACAO_DEMO: valor })).toBe(false);
    },
  );
});

describe("simulacaoDemoEmProducao (aviso no log)", () => {
  it("só é verdadeira em produção com o interruptor ligado", () => {
    expect(simulacaoDemoEmProducao({ NODE_ENV: "production", PAGAMENTO_SIMULACAO_DEMO: "true" })).toBe(true);
    expect(simulacaoDemoEmProducao({ NODE_ENV: "production" })).toBe(false);
    expect(simulacaoDemoEmProducao({ NODE_ENV: "development", PAGAMENTO_SIMULACAO_DEMO: "true" })).toBe(false);
    expect(simulacaoDemoEmProducao({ PAGAMENTO_SIMULACAO_DEMO: "true" })).toBe(false);
  });
});

// ---------- ligado ao app: o que muda de verdade na rota ----------
const cardapioRepo: CardapioRepositorio = {
  async salvar(data) {
    return { data, itens: [] };
  },
  async buscar() {
    return null;
  },
};
const identificar: Identificador = (request) => {
  if (request.headers["x-perfil"]) request.usuario = { id: "00000000-0000-4000-8000-000000000001", perfil: "USUARIO" };
};
const repo: RecargaRepositorio = {
  criarCobranca: async (d) => ({
    id: "00000000-0000-4000-8000-0000000000aa",
    usuarioId: d.usuarioId,
    valorCentavos: d.valorCentavos,
    status: "PENDENTE",
    provedor: d.provedor,
    codigoPagamento: d.codigoPagamento,
    motivoFalha: null,
    criadaEm: new Date(),
    confirmadaEm: null,
  }),
  contarPendentes: async () => 0,
  buscarDoUsuario: async () => null,
  buscarPorId: async () => null,
  aplicarEvento: async () => "DESCONHECIDA",
};

async function appEmProducao(env: Record<string, string | undefined>) {
  return buildApp({
    cardapioRepo,
    recarga: { repo, gateway: criarGatewaySimulado("segredo"), simulacao: simulacaoHabilitada(env) },
    identificar,
    producao: true,
  });
}
const rotaSimular = (app: Awaited<ReturnType<typeof appEmProducao>>) =>
  app.inject({
    method: "POST",
    url: "/dev/recargas/00000000-0000-4000-8000-0000000000aa/simular",
    payload: { resultado: "CONFIRMADA" },
    headers: { "x-perfil": "USUARIO" },
  });
const criar = (app: Awaited<ReturnType<typeof appEmProducao>>) =>
  app.inject({ method: "POST", url: "/recargas", payload: { valorCentavos: 2000 }, headers: { "x-perfil": "USUARIO" } });

describe("interruptor de demonstração no app (produção)", () => {
  it("desligado: a rota de simular não existe e a API avisa que não há simulação", async () => {
    const app = await appEmProducao({ NODE_ENV: "production" });
    expect((await criar(app)).json().simulacao).toBe(false);
    expect((await rotaSimular(app)).statusCode).toBe(404);
  });

  it("ligado: a rota existe e a API avisa a tela para mostrar os botões", async () => {
    const app = await appEmProducao({ NODE_ENV: "production", PAGAMENTO_SIMULACAO_DEMO: "true" });
    expect((await criar(app)).json().simulacao).toBe(true);
    // A recarga de teste não existe no banco falso: 404 "Recarga não encontrada", que prova que a rota está viva.
    const r = await rotaSimular(app);
    expect(r.statusCode).toBe(404);
    expect(r.json().mensagem).toBe("Recarga não encontrada.");
  });

  it("ligado, a rota continua exigindo login (nunca é pública)", async () => {
    const app = await appEmProducao({ NODE_ENV: "production", PAGAMENTO_SIMULACAO_DEMO: "true" });
    const r = await app.inject({
      method: "POST",
      url: "/dev/recargas/00000000-0000-4000-8000-0000000000aa/simular",
      payload: { resultado: "CONFIRMADA" },
    });
    expect(r.statusCode).toBe(401);
  });
});
