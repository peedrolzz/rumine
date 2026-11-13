import { criarServicoQr } from "../modules/acesso/qrToken.js";
import { describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import type { Identificador } from "../shared/auth.js";
import type { PerfilUsuario } from "../../generated/prisma/enums.js";
import type { CardapioRepositorio } from "../modules/cardapio/repositorio.js";
import type { HistoricoRepositorio } from "../modules/historico/repositorio.js";
import { criarGatewaySimulado } from "../modules/recarga/gateway.js";
import type { VinculoRepositorio } from "../modules/vinculo/repositorio.js";
import { criarRepoIdentidadeFalso } from "./identidadeFalsa.js";

// Matriz de acesso (HU-03): cada rota existente × cada perfil (e sem login).
// Quem cria uma rota nova protegida por perfil deve acrescentar uma linha aqui.
// Um teste confere que a matriz cobre todas as rotas registradas no app.

const PERFIS: PerfilUsuario[] = ["USUARIO", "OPERADOR", "ADMIN", "MESTRE"];
const TODOS = PERFIS;

type Rota = {
  metodo: "GET" | "POST" | "PUT";
  url: string;
  /** Rota registrada no Fastify (para conferir a cobertura). */
  padrao: string;
  /** Perfis que passam da proteção. Os outros recebem 403 e quem não entrou recebe 401. */
  permitidos: PerfilUsuario[];
  corpo?: unknown;
};

const ROTAS: Rota[] = [
  { metodo: "GET", url: "/cardapios/2026-11-10", padrao: "/cardapios/:data", permitidos: TODOS },
  { metodo: "PUT", url: "/cardapios/2026-11-10", padrao: "/cardapios/:data", permitidos: ["ADMIN"], corpo: { itens: [] } },
  { metodo: "GET", url: "/historico", padrao: "/historico", permitidos: TODOS },
  { metodo: "POST", url: "/mestre/contas", padrao: "/mestre/contas", permitidos: ["MESTRE"], corpo: {} },
  { metodo: "GET", url: "/mestre/logs", padrao: "/mestre/logs", permitidos: ["MESTRE"] },
  { metodo: "GET", url: "/admin/cadastros", padrao: "/admin/cadastros", permitidos: ["ADMIN"] },
  {
    metodo: "POST",
    url: "/admin/cadastros/00000000-0000-4000-8000-000000000009/aprovar",
    padrao: "/admin/cadastros/:usuarioId/aprovar",
    permitidos: ["ADMIN"],
  },
  {
    metodo: "POST",
    url: "/admin/cadastros/00000000-0000-4000-8000-000000000009/rejeitar",
    padrao: "/admin/cadastros/:usuarioId/rejeitar",
    permitidos: ["ADMIN"],
    corpo: {},
  },
  { metodo: "GET", url: "/carteira", padrao: "/carteira", permitidos: ["USUARIO"] },
  { metodo: "POST", url: "/recargas", padrao: "/recargas", permitidos: ["USUARIO"], corpo: {} },
  { metodo: "GET", url: "/recargas/00000000-0000-4000-8000-000000000009", padrao: "/recargas/:id", permitidos: ["USUARIO"] },
  {
    metodo: "POST",
    url: "/dev/recargas/00000000-0000-4000-8000-000000000009/simular",
    padrao: "/dev/recargas/:id/simular",
    permitidos: ["USUARIO"],
    corpo: {},
  },
  { metodo: "POST", url: "/qr", padrao: "/qr", permitidos: ["USUARIO"] },
  { metodo: "GET", url: "/vinculo", padrao: "/vinculo", permitidos: ["USUARIO"] },
  { metodo: "POST", url: "/vinculo", padrao: "/vinculo", permitidos: ["USUARIO"] },
  {
    metodo: "GET",
    url: "/admin/declaracoes/00000000-0000-4000-8000-000000000009/arquivo",
    padrao: "/admin/declaracoes/:id/arquivo",
    permitidos: ["ADMIN"],
  },
];

// Rotas públicas ou que se protegem sozinhas (sessão), fora da matriz de perfis.
const FORA_DA_MATRIZ = [
  "GET /health",
  "POST /auth/cadastro",
  "POST /auth/confirmar-email",
  "POST /auth/login",
  "POST /webhooks/pagamento", // pública: quem chama é o provedor; a autenticidade vem da assinatura
  "POST /auth/logout",
  "GET /auth/me",
];

const cardapioRepo: CardapioRepositorio = {
  async salvar(data) {
    return { data, itens: [] };
  },
  async buscar() {
    return null;
  },
};
const historicoRepo: HistoricoRepositorio = {
  async transacoes() {
    return [];
  },
  async refeicoesIsentas() {
    return [];
  },
};

const vinculo = {
  repo: {
    buscar: async () => ({ status: "ATIVO" as const, identificador: null, declaracaoEnviadaEm: null, motivoRejeicao: null }),
    registrarEnvio: async () => "OK",
    buscarDeclaracao: async () => null,
    registrarVisualizacao: async () => undefined,
  } satisfies VinculoRepositorio,
  armazenamento: { salvar: async () => undefined, ler: async () => null, remover: async () => undefined },
};

const identificar: Identificador = (request) => {
  const perfil = request.headers["x-perfil"];
  if (typeof perfil === "string") request.usuario = { id: "00000000-0000-4000-8000-000000000001", perfil: perfil as PerfilUsuario };
};

async function montar() {
  const app = await buildApp({
    cardapioRepo,
    historicoRepo,
    identidade: { repo: criarRepoIdentidadeFalso().repo },
    mestre: {
      contasRepo: { criarConta: async () => "EMAIL_JA_CADASTRADO", existeMestreComLogin: async () => true },
      logsRepo: { listar: async () => [] },
    },
    vinculo,
    recarga: {
      repo: {
        criarCobranca: async () => { throw new Error("não usado"); },
        contarPendentes: async () => 0,
        buscarDoUsuario: async () => null,
        buscarPorId: async () => null,
        aplicarEvento: async () => "DESCONHECIDA",
      },
      gateway: criarGatewaySimulado("segredo"),
    },
    qr: criarServicoQr({ segredo: "segredo-de-teste-com-mais-de-32-caracteres!" }),
    carteiraRepo: { buscarSaldo: async () => ({ saldoCentavos: 0, atualizadoEm: new Date() }) },
    cadastrosRepo: { listarPendentes: async () => [], decidir: async () => "NAO_ENCONTRADO" },
    identificar,
    hoje: () => "2026-11-10",
  });
  return { app };
}

describe("matriz de acesso por perfil", () => {
  for (const rota of ROTAS) {
    describe(`${rota.metodo} ${rota.url}`, () => {
      const chamar = async (perfil?: PerfilUsuario) => {
        const { app } = await montar();
        return app.inject({
          method: rota.metodo,
          url: rota.url,
          headers: perfil ? { "x-perfil": perfil } : {},
          ...(rota.corpo !== undefined && { payload: rota.corpo as object }),
        });
      };

      it("sem login: 401", async () => {
        expect((await chamar()).statusCode).toBe(401);
      });

      for (const perfil of PERFIS) {
        if (rota.permitidos.includes(perfil)) {
          it(`${perfil} passa da proteção (nem 401 nem 403)`, async () => {
            const r = await chamar(perfil);
            expect([401, 403]).not.toContain(r.statusCode);
          });
        } else {
          it(`${perfil} é barrado: 403 com mensagem em português`, async () => {
            const r = await chamar(perfil);
            expect(r.statusCode).toBe(403);
            expect(r.json().mensagem).toBe("Você não tem permissão para esta ação.");
          });
        }
      }
    });
  }

  it("cobre todas as rotas do app (rota nova sem linha na matriz quebra aqui)", async () => {
    const { app } = await montar();
    await app.ready();
    const registradas = new Set<string>();
    for (const metodo of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
      const texto = app.printRoutes({ commonPrefix: false, method: metodo });
      for (const m of texto.matchAll(/(\/\S*) \((\w+)\)/g)) registradas.add(`${m[2]} ${m[1]}`);
    }
    const conhecidas = new Set([...ROTAS.map((r) => `${r.metodo} ${r.padrao}`), ...FORA_DA_MATRIZ]);
    expect([...registradas].sort()).toEqual([...conhecidas].sort());
  });
});
