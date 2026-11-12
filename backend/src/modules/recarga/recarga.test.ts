import { createHmac, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import type { Identificador } from "../../shared/auth.js";
import type { CardapioRepositorio } from "../cardapio/repositorio.js";
import type { CarteiraRepositorio } from "../carteira/repositorio.js";
import {
  CABECALHO_ASSINATURA,
  criarGatewaySimulado,
  type EventoPagamento,
  type GatewayPagamento,
} from "./gateway.js";
import type { CobrancaRegistro, RecargaRepositorio, ResultadoEvento } from "./repositorio.js";
import { VALIDADE_COBRANCA_MS, VALOR_MAXIMO_CENTAVOS, VALOR_MINIMO_CENTAVOS } from "./servico.js";

// ---------- apoio ----------
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const EU = uuid(1);
const OUTRO = uuid(2);
const SEGREDO = "segredo-de-teste";
const INICIO = Date.parse("2026-11-12T12:00:00.000Z");

type Cobranca = CobrancaRegistro & { idExterno: string; transacaoId: string | null };
type Transacao = { id: string; usuarioId: string; tipo: "RECARGA"; valorCentavos: number; saldoAposCentavos: number };

/**
 * Banco em memória com as mesmas regras do repositório real: a mudança de uma cobrança e do
 * saldo acontece em um único passo, sem pontos de espera no meio (o equivalente da transação).
 */
function criarBanco(saldos: Record<string, number>) {
  const carteiras = new Map(Object.entries(saldos).map(([id, saldo]) => [id, { saldoCentavos: saldo, atualizadoEm: new Date(INICIO) }]));
  const cobrancas: Cobranca[] = [];
  const transacoes: Transacao[] = [];

  const repo: RecargaRepositorio = {
    async criarCobranca(d) {
      const c: Cobranca = {
        id: randomUUID(),
        usuarioId: d.usuarioId,
        valorCentavos: d.valorCentavos,
        status: "PENDENTE",
        provedor: d.provedor,
        codigoPagamento: d.codigoPagamento,
        motivoFalha: null,
        criadaEm: new Date(relogio.agora),
        confirmadaEm: null,
        idExterno: d.idExterno,
        transacaoId: null,
      };
      cobrancas.push(c);
      return c;
    },
    async contarPendentes(usuarioId, desde) {
      return cobrancas.filter((c) => c.usuarioId === usuarioId && c.status === "PENDENTE" && c.criadaEm > desde).length;
    },
    async buscarDoUsuario(id, usuarioId) {
      return cobrancas.find((c) => c.id === id && c.usuarioId === usuarioId) ?? null;
    },
    async buscarPorId(id) {
      return cobrancas.find((c) => c.id === id) ?? null;
    },
    async aplicarEvento(evento, agora): Promise<ResultadoEvento> {
      const c = cobrancas.find((x) => x.idExterno === evento.idExterno);
      if (!c) return "DESCONHECIDA";
      if (c.valorCentavos !== evento.valorCentavos) return "VALOR_DIVERGENTE";
      if (evento.resultado !== "CONFIRMADA") {
        if (c.status !== "PENDENTE") return "JA_PROCESSADA";
        c.status = evento.resultado;
        c.motivoFalha = evento.motivo ?? null;
        return "RECUSADA";
      }
      if (c.status === "CONFIRMADA" || c.status === "RECUSADA") return "JA_PROCESSADA";
      const carteira = carteiras.get(c.usuarioId) ?? { saldoCentavos: 0, atualizadoEm: agora };
      carteira.saldoCentavos += c.valorCentavos;
      carteira.atualizadoEm = agora;
      carteiras.set(c.usuarioId, carteira);
      const t: Transacao = { id: randomUUID(), usuarioId: c.usuarioId, tipo: "RECARGA", valorCentavos: c.valorCentavos, saldoAposCentavos: carteira.saldoCentavos };
      transacoes.push(t);
      c.status = "CONFIRMADA";
      c.transacaoId = t.id;
      c.confirmadaEm = agora;
      c.motivoFalha = null;
      return "CREDITADA";
    },
  };
  const carteiraRepo: CarteiraRepositorio = { buscarSaldo: async (id) => carteiras.get(id) ?? null };
  const saldo = (id: string) => carteiras.get(id)?.saldoCentavos;
  return { repo, carteiraRepo, cobrancas, transacoes, saldo };
}

const relogio = { agora: INICIO };

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

async function montar(opcoes: { saldos?: Record<string, number>; simulacao?: boolean; gateway?: GatewayPagamento } = {}) {
  relogio.agora = INICIO;
  const banco = criarBanco(opcoes.saldos ?? { [EU]: 1000, [OUTRO]: 5000 });
  const gateway = criarGatewaySimulado(SEGREDO);
  const app = await buildApp({
    cardapioRepo,
    carteiraRepo: banco.carteiraRepo,
    recarga: {
      repo: banco.repo,
      gateway: opcoes.gateway ?? gateway,
      ...(opcoes.simulacao !== undefined && { simulacao: opcoes.simulacao }),
      agora: () => new Date(relogio.agora),
    },
    identificar,
    hoje: () => "2026-11-12",
  });
  return { app, banco, gateway };
}
type Contexto = Awaited<ReturnType<typeof montar>>;

const comoUsuario = { "x-perfil": "USUARIO" };
const recarregar = (c: Contexto, valorCentavos: unknown, headers: Record<string, string> = comoUsuario) =>
  c.app.inject({ method: "POST", url: "/recargas", payload: { valorCentavos } as object, headers });
const consultar = (c: Contexto, id: string, headers: Record<string, string> = comoUsuario) =>
  c.app.inject({ method: "GET", url: `/recargas/${id}`, headers });
const saldoPelaApi = async (c: Contexto, headers: Record<string, string> = comoUsuario) =>
  (await c.app.inject({ method: "GET", url: "/carteira", headers })).json().saldoCentavos as number;

/** Webhook assinado como o provedor faria. */
const avisar = (c: Contexto, evento: EventoPagamento) => {
  const { corpoBruto, assinatura } = c.gateway.assinar(evento);
  return c.app.inject({
    method: "POST",
    url: "/webhooks/pagamento",
    headers: { "content-type": "application/json", [CABECALHO_ASSINATURA]: assinatura },
    payload: corpoBruto,
  });
};
/** Cria uma recarga e devolve o que o provedor precisaria para avisar sobre ela. */
async function criarRecarga(c: Contexto, valor = 2000, headers = comoUsuario) {
  const r = await recarregar(c, valor, headers);
  const cobranca = c.banco.cobrancas.at(-1)!;
  return { resposta: r, id: r.json().id as string, cobranca, evento: (resultado: EventoPagamento["resultado"], extra: Partial<EventoPagamento> = {}): EventoPagamento => ({ idExterno: cobranca.idExterno, resultado, valorCentavos: cobranca.valorCentavos, ...extra }) };
}

// ---------- criar a recarga ----------
describe("POST /recargas", () => {
  it("cria a cobrança pendente e devolve o código de pagamento, sem mexer no saldo", async () => {
    const c = await montar();
    const r = await recarregar(c, 2000);
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({
      id: expect.any(String),
      valorCentavos: 2000,
      status: "PENDENTE",
      motivoFalha: null,
      codigoPagamento: expect.stringContaining("PIX-SIMULADO"),
      expiraEm: "2026-11-12T12:30:00.000Z",
      confirmadaEm: null,
      simulacao: true,
    });
    expect(c.banco.cobrancas).toHaveLength(1);
    expect(c.banco.cobrancas[0]).toMatchObject({ usuarioId: EU, provedor: "simulado", status: "PENDENTE" });
    expect(c.banco.saldo(EU)).toBe(1000); // RN-03: nada creditado antes da confirmação
    expect(c.banco.transacoes).toHaveLength(0);
  });

  it("pagamento ainda pendente: o saldo consultado não mudou", async () => {
    const c = await montar();
    await recarregar(c, 5000);
    expect(await saldoPelaApi(c)).toBe(1000);
  });

  it("nunca vai para cache", async () => {
    const c = await montar();
    expect((await recarregar(c, 2000)).headers["cache-control"]).toBe("no-store");
  });

  // ----- valor -----
  it("limites exatos: R$ 5,00 e R$ 200,00 passam", async () => {
    const c = await montar();
    expect((await recarregar(c, VALOR_MINIMO_CENTAVOS)).statusCode).toBe(201);
    expect((await recarregar(c, VALOR_MAXIMO_CENTAVOS)).statusCode).toBe(201);
  });

  it("um centavo abaixo do mínimo: 400 informando o limite, nada criado", async () => {
    const c = await montar();
    const r = await recarregar(c, VALOR_MINIMO_CENTAVOS - 1);
    expect(r.statusCode).toBe(400);
    expect(r.json()).toEqual({ campo: "valorCentavos", mensagem: "O valor mínimo da recarga é R$ 5,00." });
    expect(c.banco.cobrancas).toHaveLength(0);
  });

  it("um centavo acima do máximo: 400 informando o limite", async () => {
    const c = await montar();
    const r = await recarregar(c, VALOR_MAXIMO_CENTAVOS + 1);
    expect(r.statusCode).toBe(400);
    expect(r.json()).toEqual({ campo: "valorCentavos", mensagem: "O valor máximo da recarga é R$ 200,00." });
  });

  it.each([
    ["zero", 0],
    ["negativo", -1000],
    ["decimal", 1000.5],
    ["texto", "2000"],
    ["nulo", null],
    ["ausente", undefined],
    ["NaN em texto", "NaN"],
    ["objeto", {}],
    ["enorme", 1e12],
  ])("valor %s é recusado e nada é criado", async (_n, valor) => {
    const c = await montar();
    const r = await recarregar(c, valor);
    expect(r.statusCode).toBe(400);
    expect(r.json().campo).toBe("valorCentavos");
    expect(c.banco.cobrancas).toHaveLength(0);
  });

  it.each([null, "texto", 42, []])("corpo %j inválido: 400 em português", async (corpo) => {
    const c = await montar();
    const r = await c.app.inject({ method: "POST", url: "/recargas", payload: corpo as never, headers: comoUsuario });
    expect(r.statusCode).toBeGreaterThanOrEqual(400);
    expect(r.statusCode).toBeLessThan(500);
    expect(c.banco.cobrancas).toHaveLength(0);
  });

  // ----- excesso de pendentes -----
  it("a quarta recarga pendente é recusada (429), e depois do prazo volta a liberar", async () => {
    const c = await montar();
    for (let i = 0; i < 3; i++) expect((await recarregar(c, 1000)).statusCode).toBe(201);
    const r = await recarregar(c, 1000);
    expect(r.statusCode).toBe(429);
    expect(r.json().mensagem).toContain("3 recargas aguardando pagamento");
    expect(c.banco.cobrancas).toHaveLength(3);
    relogio.agora += VALIDADE_COBRANCA_MS + 1000;
    expect((await recarregar(c, 1000)).statusCode).toBe(201);
  });

  it("o limite de pendentes é por pessoa", async () => {
    const c = await montar();
    for (let i = 0; i < 3; i++) await recarregar(c, 1000);
    expect((await recarregar(c, 1000, { ...comoUsuario, "x-usuario": OUTRO })).statusCode).toBe(201);
  });

  it("pagar uma pendente libera uma vaga", async () => {
    const c = await montar();
    const a = await criarRecarga(c, 1000);
    await recarregar(c, 1000);
    await recarregar(c, 1000);
    expect((await recarregar(c, 1000)).statusCode).toBe(429);
    await avisar(c, a.evento("CONFIRMADA"));
    expect((await recarregar(c, 1000)).statusCode).toBe(201);
  });

  // ----- provedor fora do ar -----
  it("se o provedor falhar, 502 em português e nenhuma cobrança fica gravada", async () => {
    const quebrado: GatewayPagamento = {
      nome: "simulado",
      criarCobranca: async () => {
        throw new Error("provedor fora do ar: detalhe interno secreto");
      },
      lerWebhook: () => null,
    };
    const c = await montar({ gateway: quebrado });
    const r = await recarregar(c, 2000);
    expect(r.statusCode).toBe(502);
    expect(r.json().mensagem).toBe("Não foi possível gerar o pagamento agora. Tente de novo em instantes.");
    expect(r.body).not.toContain("secreto");
    expect(c.banco.cobrancas).toHaveLength(0);
  });

  // ----- acesso -----
  it("sem login: 401", async () => {
    const c = await montar();
    expect((await recarregar(c, 2000, {})).statusCode).toBe(401);
  });

  it.each(["OPERADOR", "ADMIN", "MESTRE"])("%s não recarrega: 403", async (perfil) => {
    const c = await montar();
    expect((await recarregar(c, 2000, { "x-perfil": perfil })).statusCode).toBe(403);
    expect(c.banco.cobrancas).toHaveLength(0);
  });

  it.each(["PENDENTE_APROVACAO", "REJEITADO", "PENDENTE_EMAIL"])("conta %s não recarrega: 403 informando o motivo", async (status) => {
    const c = await montar();
    const r = await recarregar(c, 2000, { ...comoUsuario, "x-status": status });
    expect(r.statusCode).toBe(403);
    expect(r.json().codigo).toBe("CADASTRO_PENDENTE");
    expect(c.banco.cobrancas).toHaveLength(0);
  });
});

// ---------- consultar ----------
describe("GET /recargas/:id", () => {
  it("o dono vê a situação da própria recarga", async () => {
    const c = await montar();
    const { id } = await criarRecarga(c, 3000);
    const r = await consultar(c, id);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ id, valorCentavos: 3000, status: "PENDENTE", simulacao: true });
  });

  it("a recarga de outra pessoa não existe para quem pergunta (404, sem vazar nada)", async () => {
    const c = await montar();
    const { id } = await criarRecarga(c, 3000);
    const r = await consultar(c, id, { ...comoUsuario, "x-usuario": OUTRO });
    expect(r.statusCode).toBe(404);
    expect(r.body).not.toContain("PIX");
    expect(r.body).not.toContain("3000");
  });

  it("recarga inexistente: 404; id que não é UUID: 400", async () => {
    const c = await montar();
    expect((await consultar(c, uuid(999))).statusCode).toBe(404);
    for (const ruim of ["abc", "1", "../../x", "123e4567-e89b-12d3-a456-42661417400z"]) {
      expect((await consultar(c, ruim)).statusCode).toBe(ruim === "../../x" ? 404 : 400);
    }
  });

  it("depois de confirmada: status CONFIRMADA, data da confirmação e sem código para pagar", async () => {
    const c = await montar();
    const a = await criarRecarga(c);
    await avisar(c, a.evento("CONFIRMADA"));
    const r = (await consultar(c, a.id)).json();
    expect(r).toMatchObject({ status: "CONFIRMADA", codigoPagamento: null, confirmadaEm: "2026-11-12T12:00:00.000Z" });
  });

  it("depois de recusada: mostra o motivo (RN-04)", async () => {
    const c = await montar();
    const a = await criarRecarga(c);
    await avisar(c, a.evento("RECUSADA", { motivo: "Saldo insuficiente no banco." }));
    const r = (await consultar(c, a.id)).json();
    expect(r).toMatchObject({ status: "RECUSADA", motivoFalha: "Saldo insuficiente no banco.", codigoPagamento: null });
  });

  it("passado o prazo sem pagamento, aparece como expirada e sem código", async () => {
    const c = await montar();
    const a = await criarRecarga(c);
    relogio.agora += VALIDADE_COBRANCA_MS - 1;
    expect((await consultar(c, a.id)).json().status).toBe("PENDENTE");
    relogio.agora += 1;
    const r = (await consultar(c, a.id)).json();
    expect(r).toMatchObject({ status: "EXPIRADA", codigoPagamento: null });
    expect(r.motivoFalha).toContain("prazo");
  });

  it("sem login: 401; outros perfis: 403", async () => {
    const c = await montar();
    expect((await consultar(c, uuid(1), {})).statusCode).toBe(401);
    expect((await consultar(c, uuid(1), { "x-perfil": "ADMIN" })).statusCode).toBe(403);
  });
});

// ---------- webhook: confirmação ----------
describe("webhook de pagamento: confirmada", () => {
  it("credita o valor, registra a recarga com o saldo resultante e aparece no saldo", async () => {
    const c = await montar();
    const a = await criarRecarga(c, 2000);
    const r = await avisar(c, a.evento("CONFIRMADA"));
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ resultado: "CREDITADA" });
    expect(c.banco.saldo(EU)).toBe(3000);
    expect(await saldoPelaApi(c)).toBe(3000);
    expect(c.banco.transacoes).toEqual([{ id: expect.any(String), usuarioId: EU, tipo: "RECARGA", valorCentavos: 2000, saldoAposCentavos: 3000 }]);
    expect(a.cobranca).toMatchObject({ status: "CONFIRMADA", transacaoId: c.banco.transacoes[0]!.id });
  });

  it("o mesmo pagamento confirmado duas vezes credita uma só vez", async () => {
    const c = await montar();
    const a = await criarRecarga(c, 2000);
    expect((await avisar(c, a.evento("CONFIRMADA"))).json().resultado).toBe("CREDITADA");
    const segunda = await avisar(c, a.evento("CONFIRMADA"));
    expect(segunda.statusCode).toBe(200); // o provedor não precisa insistir
    expect(segunda.json().resultado).toBe("JA_PROCESSADA");
    expect(c.banco.saldo(EU)).toBe(3000);
    expect(c.banco.transacoes).toHaveLength(1);
  });

  it("muitos avisos simultâneos do mesmo pagamento: creditado exatamente uma vez", async () => {
    const c = await montar();
    const a = await criarRecarga(c, 2000);
    const rs = await Promise.all(Array.from({ length: 20 }, () => avisar(c, a.evento("CONFIRMADA"))));
    expect(rs.map((r) => r.json().resultado).filter((x) => x === "CREDITADA")).toHaveLength(1);
    expect(c.banco.saldo(EU)).toBe(3000);
    expect(c.banco.transacoes).toHaveLength(1);
  });

  it("duas recargas diferentes somam, cada uma com o saldo resultante certo", async () => {
    const c = await montar();
    const a = await criarRecarga(c, 2000);
    const b = await criarRecarga(c, 500);
    await avisar(c, a.evento("CONFIRMADA"));
    await avisar(c, b.evento("CONFIRMADA"));
    expect(c.banco.saldo(EU)).toBe(3500);
    expect(c.banco.transacoes.map((t) => t.saldoAposCentavos)).toEqual([3000, 3500]);
  });

  it("só a conta que pagou é creditada", async () => {
    const c = await montar();
    const a = await criarRecarga(c, 2000);
    await avisar(c, a.evento("CONFIRMADA"));
    expect(c.banco.saldo(OUTRO)).toBe(5000);
  });

  it("conta sem carteira: ela é criada com a recarga", async () => {
    const c = await montar({ saldos: {} });
    const a = await criarRecarga(c, 2000);
    await avisar(c, a.evento("CONFIRMADA"));
    expect(c.banco.saldo(EU)).toBe(2000);
  });

  it("pagou depois do prazo (cobrança expirada pelo provedor): o dinheiro entrou, então credita", async () => {
    const c = await montar();
    const a = await criarRecarga(c, 2000);
    await avisar(c, a.evento("EXPIRADA", { motivo: "Prazo encerrado." }));
    expect(c.banco.saldo(EU)).toBe(1000);
    expect((await avisar(c, a.evento("CONFIRMADA"))).json().resultado).toBe("CREDITADA");
    expect(c.banco.saldo(EU)).toBe(3000);
  });
});

// ---------- webhook: falhas ----------
describe("webhook de pagamento: recusada, expirada e outros avisos", () => {
  it("recusada: o saldo não muda, nada é registrado e o motivo fica guardado", async () => {
    const c = await montar();
    const a = await criarRecarga(c, 2000);
    const r = await avisar(c, a.evento("RECUSADA", { motivo: "Cartão sem limite." }));
    expect(r.json()).toEqual({ resultado: "RECUSADA" });
    expect(c.banco.saldo(EU)).toBe(1000);
    expect(c.banco.transacoes).toHaveLength(0);
    expect(a.cobranca).toMatchObject({ status: "RECUSADA", motivoFalha: "Cartão sem limite.", transacaoId: null });
  });

  it("expirada: o saldo não muda", async () => {
    const c = await montar();
    const a = await criarRecarga(c, 2000);
    await avisar(c, a.evento("EXPIRADA", { motivo: "Prazo encerrado." }));
    expect(a.cobranca.status).toBe("EXPIRADA");
    expect(c.banco.saldo(EU)).toBe(1000);
  });

  it("recusa sem motivo informado fica sem motivo (a tela usa uma mensagem padrão)", async () => {
    const c = await montar();
    const a = await criarRecarga(c);
    await avisar(c, a.evento("RECUSADA"));
    expect(a.cobranca.motivoFalha).toBeNull();
  });

  it("recusa que chega depois de a recarga já ter sido creditada não desfaz o crédito", async () => {
    const c = await montar();
    const a = await criarRecarga(c, 2000);
    await avisar(c, a.evento("CONFIRMADA"));
    expect((await avisar(c, a.evento("RECUSADA", { motivo: "x" }))).json().resultado).toBe("JA_PROCESSADA");
    expect(a.cobranca.status).toBe("CONFIRMADA");
    expect(c.banco.saldo(EU)).toBe(3000);
  });

  it("confirmação que chega depois de recusada não credita", async () => {
    const c = await montar();
    const a = await criarRecarga(c, 2000);
    await avisar(c, a.evento("RECUSADA", { motivo: "x" }));
    expect((await avisar(c, a.evento("CONFIRMADA"))).json().resultado).toBe("JA_PROCESSADA");
    expect(c.banco.saldo(EU)).toBe(1000);
    expect(c.banco.transacoes).toHaveLength(0);
  });

  it("recusa repetida não muda nada", async () => {
    const c = await montar();
    const a = await criarRecarga(c);
    await avisar(c, a.evento("RECUSADA", { motivo: "primeiro" }));
    expect((await avisar(c, a.evento("RECUSADA", { motivo: "segundo" }))).json().resultado).toBe("JA_PROCESSADA");
    expect(a.cobranca.motivoFalha).toBe("primeiro");
  });

  it("valor diferente do cobrado: 200, mas NADA é creditado", async () => {
    const c = await montar();
    const a = await criarRecarga(c, 2000);
    const r = await avisar(c, a.evento("CONFIRMADA", { valorCentavos: 20000 }));
    expect(r.statusCode).toBe(200);
    expect(r.json().resultado).toBe("VALOR_DIVERGENTE");
    expect(c.banco.saldo(EU)).toBe(1000);
    expect(a.cobranca.status).toBe("PENDENTE");
  });

  it("cobrança desconhecida: 200 e nada muda", async () => {
    const c = await montar();
    const r = await avisar(c, { idExterno: "sim_que-nao-existe", resultado: "CONFIRMADA", valorCentavos: 2000 });
    expect(r.statusCode).toBe(200);
    expect(r.json().resultado).toBe("DESCONHECIDA");
    expect(c.banco.saldo(EU)).toBe(1000);
  });
});

// ---------- webhook: autenticidade ----------
describe("webhook de pagamento: assinatura", () => {
  const enviar = (c: Contexto, corpo: string, assinatura?: string) =>
    c.app.inject({
      method: "POST",
      url: "/webhooks/pagamento",
      headers: { "content-type": "application/json", ...(assinatura !== undefined && { [CABECALHO_ASSINATURA]: assinatura }) },
      payload: corpo,
    });

  it("sem assinatura: 401 e nada é creditado", async () => {
    const c = await montar();
    const a = await criarRecarga(c, 2000);
    const { corpoBruto } = c.gateway.assinar(a.evento("CONFIRMADA"));
    const r = await enviar(c, corpoBruto);
    expect(r.statusCode).toBe(401);
    expect(r.json()).toEqual({ mensagem: "Assinatura inválida." });
    expect(c.banco.saldo(EU)).toBe(1000);
  });

  it.each(["", "abc", "0".repeat(64), "Z".repeat(64)])("assinatura %j errada: 401 e nada é creditado", async (assinatura) => {
    const c = await montar();
    const a = await criarRecarga(c, 2000);
    const { corpoBruto } = c.gateway.assinar(a.evento("CONFIRMADA"));
    expect((await enviar(c, corpoBruto, assinatura)).statusCode).toBe(401);
    expect(c.banco.saldo(EU)).toBe(1000);
    expect(a.cobranca.status).toBe("PENDENTE");
  });

  it("corpo adulterado depois de assinado (valor maior): 401", async () => {
    const c = await montar();
    const a = await criarRecarga(c, 2000);
    const { corpoBruto, assinatura } = c.gateway.assinar(a.evento("CONFIRMADA"));
    expect((await enviar(c, corpoBruto.replace("2000", "20000"), assinatura)).statusCode).toBe(401);
    expect(c.banco.saldo(EU)).toBe(1000);
  });

  it("assinatura feita com outro segredo: 401", async () => {
    const c = await montar();
    const a = await criarRecarga(c, 2000);
    const falso = criarGatewaySimulado("outro-segredo").assinar(a.evento("CONFIRMADA"));
    expect((await enviar(c, falso.corpoBruto, falso.assinatura)).statusCode).toBe(401);
    expect(c.banco.saldo(EU)).toBe(1000);
  });

  it("assinatura válida sobre um corpo que não é um evento: 401", async () => {
    const c = await montar();
    for (const corpo of ["isto não é json", "{}", '{"idExterno":"x"}', '{"idExterno":"x","resultado":"PAGO","valorCentavos":1}', '{"idExterno":"x","resultado":"CONFIRMADA","valorCentavos":-5}', "[]", "null"]) {
      const r = await enviar(c, corpo, assinarCru(corpo));
      expect(r.statusCode).toBe(401);
    }
  });

  it("não exige login nem Origin (quem chama é o provedor)", async () => {
    const c = await montar();
    const a = await criarRecarga(c, 2000);
    const r = await avisar(c, a.evento("CONFIRMADA")); // sem x-perfil e sem Origin
    expect(r.statusCode).toBe(200);
  });

  it("um aviso assinado que chega repetido (replay) não credita de novo", async () => {
    const c = await montar();
    const a = await criarRecarga(c, 2000);
    const { corpoBruto, assinatura } = c.gateway.assinar(a.evento("CONFIRMADA"));
    await enviar(c, corpoBruto, assinatura);
    await enviar(c, corpoBruto, assinatura);
    await enviar(c, corpoBruto, assinatura);
    expect(c.banco.saldo(EU)).toBe(3000);
  });
});

/** Assinatura válida (com o segredo certo) sobre qualquer texto, para testar corpos que não são eventos. */
function assinarCru(corpo: string) {
  return createHmac("sha256", SEGREDO).update(corpo).digest("hex");
}

// ---------- simulação de desenvolvimento ----------
describe("POST /dev/recargas/:id/simular", () => {
  const simular = (c: Contexto, id: string, resultado: unknown, headers: Record<string, string> = comoUsuario) =>
    c.app.inject({ method: "POST", url: `/dev/recargas/${id}/simular`, payload: { resultado } as object, headers });

  it("confirmar: credita pelo mesmo caminho do webhook", async () => {
    const c = await montar();
    const a = await criarRecarga(c, 2000);
    const r = await simular(c, a.id, "CONFIRMADA");
    expect(r.json()).toEqual({ resultado: "CREDITADA" });
    expect(c.banco.saldo(EU)).toBe(3000);
    expect(c.banco.transacoes).toHaveLength(1);
  });

  it("confirmar duas vezes credita uma só", async () => {
    const c = await montar();
    const a = await criarRecarga(c, 2000);
    await simular(c, a.id, "CONFIRMADA");
    expect((await simular(c, a.id, "CONFIRMADA")).json().resultado).toBe("JA_PROCESSADA");
    expect(c.banco.saldo(EU)).toBe(3000);
  });

  it("recusar: saldo intacto e motivo guardado", async () => {
    const c = await montar();
    const a = await criarRecarga(c, 2000);
    expect((await simular(c, a.id, "RECUSADA")).json()).toEqual({ resultado: "RECUSADA" });
    expect(c.banco.saldo(EU)).toBe(1000);
    expect((await consultar(c, a.id)).json()).toMatchObject({ status: "RECUSADA", motivoFalha: "Pagamento recusado pelo banco (simulação)." });
  });

  it("não simula a recarga de outra pessoa (404)", async () => {
    const c = await montar();
    const a = await criarRecarga(c, 2000);
    const r = await simular(c, a.id, "CONFIRMADA", { ...comoUsuario, "x-usuario": OUTRO });
    expect(r.statusCode).toBe(404);
    expect(c.banco.saldo(EU)).toBe(1000);
    expect(c.banco.saldo(OUTRO)).toBe(5000);
  });

  it.each(["EXPIRADA", "PAGO", "", null, 1])("resultado %j inválido: 400", async (resultado) => {
    const c = await montar();
    const a = await criarRecarga(c);
    expect((await simular(c, a.id, resultado)).statusCode).toBe(400);
  });

  it("id inválido: 400; inexistente: 404", async () => {
    const c = await montar();
    expect((await simular(c, "abc", "CONFIRMADA")).statusCode).toBe(400);
    expect((await simular(c, uuid(999), "CONFIRMADA")).statusCode).toBe(404);
  });

  it("com a simulação desligada (produção), a rota nem existe e ninguém consegue creditar", async () => {
    const c = await montar({ simulacao: false });
    const a = await criarRecarga(c, 2000);
    expect(a.resposta.json().simulacao).toBe(false);
    const r = await simular(c, a.id, "CONFIRMADA");
    expect(r.statusCode).toBe(404);
    expect(c.banco.saldo(EU)).toBe(1000);
  });

  it("em produção a simulação vem desligada por padrão", async () => {
    const banco = criarBanco({ [EU]: 1000 });
    const app = await buildApp({
      cardapioRepo,
      recarga: { repo: banco.repo, gateway: criarGatewaySimulado(SEGREDO) },
      identificar,
      producao: true,
    });
    const a = await app.inject({ method: "POST", url: "/recargas", payload: { valorCentavos: 2000 }, headers: comoUsuario });
    expect(a.json().simulacao).toBe(false);
    const r = await app.inject({ method: "POST", url: `/dev/recargas/${a.json().id}/simular`, payload: { resultado: "CONFIRMADA" }, headers: comoUsuario });
    expect(r.statusCode).toBe(404);
    expect(banco.saldo(EU)).toBe(1000);
  });

  it("perfis e login", async () => {
    const c = await montar();
    expect((await simular(c, uuid(1), "CONFIRMADA", {})).statusCode).toBe(401);
    expect((await simular(c, uuid(1), "CONFIRMADA", { "x-perfil": "ADMIN" })).statusCode).toBe(403);
    expect((await simular(c, uuid(1), "CONFIRMADA", { ...comoUsuario, "x-status": "PENDENTE_APROVACAO" })).statusCode).toBe(403);
  });
});

// ---------- gateway simulado ----------
describe("gateway simulado", () => {
  it("cada cobrança tem um id externo único e um código para pagar", async () => {
    const g = criarGatewaySimulado(SEGREDO);
    const a = await g.criarCobranca({ valorCentavos: 1000, referencia: "x" });
    const b = await g.criarCobranca({ valorCentavos: 1000, referencia: "x" });
    expect(a.idExterno).not.toBe(b.idExterno);
    expect(a.codigoPagamento).toContain("PIX-SIMULADO-1000");
  });

  it("lê o que ele mesmo assinou e recusa tudo o mais", () => {
    const g = criarGatewaySimulado(SEGREDO);
    const evento: EventoPagamento = { idExterno: "sim_1", resultado: "CONFIRMADA", valorCentavos: 1000 };
    const { corpoBruto, assinatura } = g.assinar(evento);
    expect(g.lerWebhook({ corpoBruto, assinatura })).toEqual(evento);
    expect(g.lerWebhook({ corpoBruto, assinatura: undefined })).toBeNull();
    expect(g.lerWebhook({ corpoBruto: corpoBruto + " ", assinatura })).toBeNull();
    expect(criarGatewaySimulado("outro").lerWebhook({ corpoBruto, assinatura })).toBeNull();
  });
});
