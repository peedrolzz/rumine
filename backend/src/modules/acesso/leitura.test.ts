import { describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import type { Identificador } from "../../shared/auth.js";
import type { CardapioRepositorio } from "../cardapio/repositorio.js";
import { MENSAGENS, type LeituraRepositorio, type ResultadoProcessamento } from "./leitura.js";
import { criarServicoQr } from "./qrToken.js";

const SEGREDO = "segredo-de-teste-com-mais-de-32-caracteres!";
const OPERADOR = "00000000-0000-4000-8000-000000000002";
const ALUNO = "00000000-0000-4000-8000-000000000003";
const PRECO = 350;
const T0 = new Date("2026-11-12T12:00:00.000Z");

type Aluno = { nome: string; status: string; perfil: string; pae: boolean; saldo: number };

/** Repositório em memória que imita as regras do banco (jti único, saldo >= 0, uma leitura por vez). */
function criarRepoFalso(alunos: Record<string, Aluno>, preco: number | null = PRECO) {
  const jtis = new Set<string>();
  const leituras: { resultado: string; usuarioId: string | null }[] = [];
  const transacoes: { usuarioId: string; valor: number; saldoApos: number }[] = [];
  const repo: LeituraRepositorio = {
    async registrarNegada({ resultado }) {
      leituras.push({ resultado, usuarioId: null });
    },
    async processar({ usuarioId, jti }): Promise<ResultadoProcessamento> {
      const a = alunos[usuarioId];
      if (!a || a.perfil !== "USUARIO") {
        leituras.push({ resultado: "NEGADO_TOKEN_INVALIDO", usuarioId: null });
        return { resultado: "NEGADO_TOKEN_INVALIDO" };
      }
      if (jtis.has(jti)) {
        leituras.push({ resultado: "NEGADO_TOKEN_USADO", usuarioId });
        return { resultado: "NEGADO_TOKEN_USADO", alunoNome: a.nome };
      }
      if (a.status !== "ATIVO") {
        jtis.add(jti);
        leituras.push({ resultado: "NEGADO_CADASTRO_INATIVO", usuarioId });
        return { resultado: "NEGADO_CADASTRO_INATIVO", alunoNome: a.nome };
      }
      if (a.pae) {
        jtis.add(jti);
        leituras.push({ resultado: "LIBERADO", usuarioId });
        return { resultado: "LIBERADO", alunoNome: a.nome, valorCobradoCentavos: 0 };
      }
      if (preco === null) return { resultado: "SEM_PRECO" };
      jtis.add(jti);
      if (a.saldo < preco) {
        leituras.push({ resultado: "NEGADO_SALDO", usuarioId });
        return { resultado: "NEGADO_SALDO", alunoNome: a.nome };
      }
      a.saldo -= preco;
      transacoes.push({ usuarioId, valor: preco, saldoApos: a.saldo });
      leituras.push({ resultado: "LIBERADO", usuarioId });
      return { resultado: "LIBERADO", alunoNome: a.nome, valorCobradoCentavos: preco };
    },
  };
  return { repo, leituras, transacoes };
}

const cardapioRepo: CardapioRepositorio = { salvar: async (data) => ({ data, itens: [] }), buscar: async () => null };
const qr = criarServicoQr({ segredo: SEGREDO, agora: () => T0 });

async function montar(alunos: Record<string, Aluno>, perfil: "OPERADOR" | "USUARIO" | "ADMIN" | null = "OPERADOR", preco: number | null = PRECO) {
  const falso = criarRepoFalso(alunos, preco);
  const identificar: Identificador = (request) => {
    if (perfil) request.usuario = { id: OPERADOR, perfil };
  };
  const app = await buildApp({ cardapioRepo, qr, leituraRepo: falso.repo, identificar, hoje: () => "2026-11-12" });
  const ler = (token: string) => app.inject({ method: "POST", url: "/leituras", payload: { token } });
  return { app, ler, ...falso };
}
const aluno = (extra: Partial<Aluno> = {}): Aluno => ({ nome: "Maria da Silva", status: "ATIVO", perfil: "USUARIO", pae: false, saldo: 1000, ...extra });
const novoQr = async (id = ALUNO) => (await qr.gerar(id)).token;

describe("POST /leituras: liberar e debitar", () => {
  it("QR válido com saldo: libera, debita o preço e mostra só o nome", async () => {
    const estado = aluno();
    const { ler, transacoes } = await montar({ [ALUNO]: estado });
    const r = await ler(await novoQr());
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ resultado: "LIBERADO", liberado: true, mensagem: "Liberado", aluno: { nome: "Maria da Silva" }, valorCobradoCentavos: 350 });
    expect(estado.saldo).toBe(650);
    expect(transacoes).toEqual([{ usuarioId: ALUNO, valor: 350, saldoApos: 650 }]);
    expect(r.headers["cache-control"]).toBe("no-store");
  });

  it("saldo exatamente igual ao preço: libera e zera", async () => {
    const estado = aluno({ saldo: 350 });
    const { ler } = await montar({ [ALUNO]: estado });
    expect((await ler(await novoQr())).json().liberado).toBe(true);
    expect(estado.saldo).toBe(0);
  });

  it("saldo 1 centavo abaixo do preço: nega e não debita", async () => {
    const estado = aluno({ saldo: 349 });
    const { ler, transacoes } = await montar({ [ALUNO]: estado });
    const r = (await ler(await novoQr())).json();
    expect(r).toMatchObject({ resultado: "NEGADO_SALDO", liberado: false, mensagem: "Saldo insuficiente", aluno: { nome: "Maria da Silva" } });
    expect(estado.saldo).toBe(349);
    expect(transacoes).toHaveLength(0);
  });

  it("aluno PAE: libera sem cobrar", async () => {
    const estado = aluno({ pae: true, saldo: 0 });
    const { ler, transacoes } = await montar({ [ALUNO]: estado });
    const r = (await ler(await novoQr())).json();
    expect(r).toMatchObject({ liberado: true, valorCobradoCentavos: 0 });
    expect(estado.saldo).toBe(0);
    expect(transacoes).toHaveLength(0);
  });

  it.each(["PENDENTE_APROVACAO", "PENDENTE_EMAIL", "REJEITADO", "DESATIVADO"])("cadastro %s: nega", async (status) => {
    const estado = aluno({ status });
    const { ler } = await montar({ [ALUNO]: estado });
    const r = (await ler(await novoQr())).json();
    expect(r).toMatchObject({ resultado: "NEGADO_CADASTRO_INATIVO", liberado: false });
    expect(estado.saldo).toBe(1000);
  });

  it("sem preço configurado: 409 e o código NÃO é consumido", async () => {
    const estado = aluno();
    const { ler, app } = await montar({ [ALUNO]: estado }, "OPERADOR", null);
    const token = await novoQr();
    const r = await ler(token);
    expect(r.statusCode).toBe(409);
    expect(r.json().mensagem).toMatch(/preço/);
    expect(estado.saldo).toBe(1000);
    await app.close();
  });
});

describe("uso único, expiração e adulteração", () => {
  it("o mesmo QR lido duas vezes: a segunda é negada e só debita uma vez (print/reuso)", async () => {
    const estado = aluno();
    const { ler, transacoes } = await montar({ [ALUNO]: estado });
    const token = await novoQr();
    expect((await ler(token)).json().liberado).toBe(true);
    const segunda = (await ler(token)).json();
    expect(segunda).toMatchObject({ resultado: "NEGADO_TOKEN_USADO", liberado: false });
    expect(estado.saldo).toBe(650);
    expect(transacoes).toHaveLength(1);
  });

  it("dois QR diferentes do mesmo aluno: cada um debita uma vez", async () => {
    const estado = aluno();
    const { ler } = await montar({ [ALUNO]: estado });
    expect((await ler(await novoQr())).json().liberado).toBe(true);
    expect((await ler(await novoQr())).json().liberado).toBe(true);
    expect(estado.saldo).toBe(300);
  });

  it("QR expirado: nega com a mensagem de expirado e não debita", async () => {
    const estado = aluno();
    const antigo = criarServicoQr({ segredo: SEGREDO, agora: () => new Date(T0.getTime() - 3600_000) });
    const { ler, leituras } = await montar({ [ALUNO]: estado });
    const r = (await ler((await antigo.gerar(ALUNO)).token)).json();
    expect(r).toMatchObject({ resultado: "NEGADO_TOKEN_EXPIRADO", liberado: false, mensagem: MENSAGENS.NEGADO_TOKEN_EXPIRADO });
    expect(estado.saldo).toBe(1000);
    expect(leituras.at(-1)?.resultado).toBe("NEGADO_TOKEN_EXPIRADO");
  });

  it.each(["lixo", "a.b.c", "x".repeat(500)])("código adulterado ou lixo (%s): inválido", async (token) => {
    const estado = aluno();
    const { ler } = await montar({ [ALUNO]: estado });
    expect((await ler(token)).json()).toMatchObject({ resultado: "NEGADO_TOKEN_INVALIDO", liberado: false });
    expect(estado.saldo).toBe(1000);
  });

  it("payload trocado para outro aluno com a assinatura antiga: inválido, ninguém é debitado", async () => {
    const outro = "00000000-0000-4000-8000-0000000000aa";
    const alvo = aluno();
    const { ler } = await montar({ [ALUNO]: aluno(), [outro]: alvo });
    const [cab, carga, assin] = (await novoQr()).split(".") as [string, string, string];
    const obj = JSON.parse(Buffer.from(carga, "base64url").toString());
    const falso = `${cab}.${Buffer.from(JSON.stringify({ ...obj, sub: outro })).toString("base64url")}.${assin}`;
    expect((await ler(falso)).json().resultado).toBe("NEGADO_TOKEN_INVALIDO");
    expect(alvo.saldo).toBe(1000);
  });

  it("token válido de alguém que não é aluno ou não existe: inválido", async () => {
    const { ler } = await montar({ [ALUNO]: aluno({ perfil: "ADMIN" }) });
    expect((await ler(await novoQr())).json().resultado).toBe("NEGADO_TOKEN_INVALIDO");
    expect((await ler(await novoQr("00000000-0000-4000-8000-0000000000bb"))).json().resultado).toBe("NEGADO_TOKEN_INVALIDO");
  });

  it("a resposta nunca contém o RA nem o saldo", async () => {
    const { ler } = await montar({ [ALUNO]: aluno() });
    const texto = (await ler(await novoQr())).body;
    expect(texto).not.toMatch(/a2345678|identificador|saldo/i);
  });
});

describe("entrada e perfis", () => {
  it.each([{}, { token: "" }, { token: 5 }, { token: "x".repeat(2001) }])("corpo inválido %j: 400", async (corpo) => {
    const { app } = await montar({});
    const r = await app.inject({ method: "POST", url: "/leituras", payload: corpo });
    expect(r.statusCode).toBe(400);
  });

  it("sem login: 401; Usuário e Admin: 403 (só o Operador lê)", async () => {
    for (const [perfil, status] of [[null, 401], ["USUARIO", 403], ["ADMIN", 403]] as const) {
      const { ler } = await montar({ [ALUNO]: aluno() }, perfil);
      expect((await ler(await novoQr())).statusCode).toBe(status);
    }
  });
});
