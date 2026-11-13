import { SignJWT, base64url } from "jose";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import type { Identificador } from "../../shared/auth.js";
import type { CardapioRepositorio } from "../cardapio/repositorio.js";
import { criarServicoQr, VALIDADE_QR_SEGUNDOS } from "./qrToken.js";

const SEGREDO = "segredo-de-teste-com-mais-de-32-caracteres!";
const USUARIO = "00000000-0000-4000-8000-000000000003";
const RA = "a2345678";
const T0 = new Date("2026-11-12T12:00:00.000Z");

function relogio(inicio = T0) {
  let ms = inicio.getTime();
  return { agora: () => new Date(ms), avancar: (s: number) => (ms += s * 1000) };
}

function decodificar(token: string) {
  const [cab, carga] = token.split(".") as [string, string];
  return {
    cabecalho: JSON.parse(new TextDecoder().decode(base64url.decode(cab))),
    carga: JSON.parse(new TextDecoder().decode(base64url.decode(carga))),
  };
}

describe("token do QR", () => {
  it("tem sub, jti, exp de 30 s e emissor; não tem RA, e-mail nem nome", async () => {
    const qr = criarServicoQr({ segredo: SEGREDO, agora: () => T0 });
    const emitido = await qr.gerar(USUARIO);
    const { cabecalho, carga } = decodificar(emitido.token);
    expect(cabecalho.alg).toBe("HS256");
    expect(carga.sub).toBe(USUARIO);
    expect(carga.jti).toMatch(/^[0-9a-f-]{36}$/);
    expect(carga.exp - carga.iat).toBe(30);
    expect(carga.iss).toBe("rumine");
    expect(Object.keys(carga).sort()).toEqual(["exp", "iat", "iss", "jti", "sub"]);
    expect(emitido.validadeSegundos).toBe(VALIDADE_QR_SEGUNDOS);
    expect(emitido.expiraEm).toBe("2026-11-12T12:00:30.000Z");
    // O QR decodificado nunca contém o RA (critério do issue).
    expect(Buffer.from(emitido.token.split(".")[1]!, "base64url").toString()).not.toContain(RA);
  });

  it("cada token tem um jti único", async () => {
    const qr = criarServicoQr({ segredo: SEGREDO });
    const jtis = new Set<string>();
    for (let i = 0; i < 200; i++) jtis.add(decodificar((await qr.gerar(USUARIO)).token).carga.jti);
    expect(jtis.size).toBe(200);
  });

  it("verifica um token válido e devolve usuário e jti", async () => {
    const qr = criarServicoQr({ segredo: SEGREDO, agora: () => T0 });
    const { token } = await qr.gerar(USUARIO);
    const r = await qr.verificar(token);
    expect(r).toMatchObject({ tipo: "OK", usuarioId: USUARIO, jti: decodificar(token).carga.jti });
  });

  it("vale até o fim da validade (com tolerância de 2 s) e depois expira", async () => {
    const rel = relogio();
    const qr = criarServicoQr({ segredo: SEGREDO, agora: rel.agora });
    const { token } = await qr.gerar(USUARIO);
    rel.avancar(29);
    expect((await qr.verificar(token)).tipo).toBe("OK");
    rel.avancar(1); // exatamente no instante de expirar
    expect((await qr.verificar(token)).tipo).toBe("OK"); // dentro da tolerância de relógio
    rel.avancar(1);
    expect((await qr.verificar(token)).tipo).toBe("OK");
    rel.avancar(1); // 3 s depois de vencer: fora da tolerância
    expect((await qr.verificar(token)).tipo).toBe("EXPIRADO");
    rel.avancar(3600);
    expect((await qr.verificar(token)).tipo).toBe("EXPIRADO"); // print lido muito depois
  });

  it("rejeita assinatura trocada, payload adulterado, segredo errado e lixo", async () => {
    const qr = criarServicoQr({ segredo: SEGREDO, agora: () => T0 });
    const outro = criarServicoQr({ segredo: "outro-segredo-com-mais-de-32-caracteres!!", agora: () => T0 });
    const { token } = await qr.gerar(USUARIO);
    const [cab, carga, assin] = token.split(".") as [string, string, string];

    const outraCarga = base64url.encode(JSON.stringify({ ...decodificar(token).carga, sub: "00000000-0000-4000-8000-0000000000ff" }));
    const assinTrocada = assin.slice(0, -2) + (assin.endsWith("AA") ? "BB" : "AA");

    for (const ruim of [
      `${cab}.${outraCarga}.${assin}`, // payload adulterado com a assinatura antiga
      `${cab}.${carga}.${assinTrocada}`, // assinatura adulterada
      `${cab}.${carga}.`, // sem assinatura
      (await outro.gerar(USUARIO)).token, // assinado com outro segredo
      "lixo",
      "",
      "a.b.c",
    ]) {
      expect((await qr.verificar(ruim)).tipo).toBe("INVALIDO");
    }
  });

  it("rejeita alg none e outros algoritmos", async () => {
    const qr = criarServicoQr({ segredo: SEGREDO, agora: () => T0 });
    const cabNone = base64url.encode(JSON.stringify({ alg: "none", typ: "JWT" }));
    const carga = base64url.encode(
      JSON.stringify({ sub: USUARIO, jti: "x", iss: "rumine", exp: Math.floor(T0.getTime() / 1000) + 30 }),
    );
    expect((await qr.verificar(`${cabNone}.${carga}.`)).tipo).toBe("INVALIDO");

    const hs512 = await new SignJWT({})
      .setProtectedHeader({ alg: "HS512" })
      .setSubject(USUARIO)
      .setJti("x")
      .setIssuer("rumine")
      .setExpirationTime(Math.floor(T0.getTime() / 1000) + 30)
      .sign(new TextEncoder().encode(SEGREDO));
    expect((await qr.verificar(hs512)).tipo).toBe("INVALIDO");
  });

  it("rejeita token assinado certo mas sem jti, sem sub, sem exp ou de outro emissor", async () => {
    const qr = criarServicoQr({ segredo: SEGREDO, agora: () => T0 });
    const chave = new TextEncoder().encode(SEGREDO);
    const exp = Math.floor(T0.getTime() / 1000) + 30;
    const base = () => new SignJWT({}).setProtectedHeader({ alg: "HS256" });
    const semJti = await base().setSubject(USUARIO).setIssuer("rumine").setExpirationTime(exp).sign(chave);
    const semSub = await base().setJti("x").setIssuer("rumine").setExpirationTime(exp).sign(chave);
    const semExp = await base().setSubject(USUARIO).setJti("x").setIssuer("rumine").sign(chave);
    const outroEmissor = await base().setSubject(USUARIO).setJti("x").setIssuer("outro").setExpirationTime(exp).sign(chave);
    for (const t of [semJti, semSub, semExp, outroEmissor]) expect((await qr.verificar(t)).tipo).toBe("INVALIDO");
  });

  it("recusa segredo curto", () => {
    expect(() => criarServicoQr({ segredo: "curto" })).toThrow(/32/);
  });
});

// ---------- rota ----------
const cardapioRepo: CardapioRepositorio = { salvar: async (data) => ({ data, itens: [] }), buscar: async () => null };

async function montar(usuario?: { id: string; perfil: "USUARIO" | "OPERADOR"; status?: "ATIVO" | "PENDENTE_APROVACAO" | "PENDENTE_EMAIL" | "REJEITADO" }) {
  const identificar: Identificador = (request) => {
    if (usuario) request.usuario = usuario;
  };
  return buildApp({ cardapioRepo, qr: criarServicoQr({ segredo: SEGREDO }), identificar });
}

describe("POST /qr", () => {
  it("sem login: 401", async () => {
    const app = await montar();
    expect((await app.inject({ method: "POST", url: "/qr" })).statusCode).toBe(401);
  });

  it("operador: 403", async () => {
    const app = await montar({ id: USUARIO, perfil: "OPERADOR" });
    expect((await app.inject({ method: "POST", url: "/qr" })).statusCode).toBe(403);
  });

  it("usuário ativo recebe token de 30 s, sem cache, do próprio usuário", async () => {
    const app = await montar({ id: USUARIO, perfil: "USUARIO", status: "ATIVO" });
    const r = await app.inject({ method: "POST", url: "/qr" });
    expect(r.statusCode).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
    const corpo = r.json();
    expect(corpo.validadeSegundos).toBe(30);
    expect(decodificar(corpo.token).carga.sub).toBe(USUARIO);
    expect(JSON.stringify(corpo)).not.toContain(RA);
  });

  it("duas chamadas seguidas geram tokens diferentes", async () => {
    const app = await montar({ id: USUARIO, perfil: "USUARIO" });
    const a = (await app.inject({ method: "POST", url: "/qr" })).json().token;
    const b = (await app.inject({ method: "POST", url: "/qr" })).json().token;
    expect(a).not.toBe(b);
  });

  it.each([
    ["PENDENTE_APROVACAO", /em análise/],
    ["PENDENTE_EMAIL", /em análise/],
    ["REJEITADO", /não foi aprovado/],
  ] as const)("cadastro %s é negado com o motivo", async (status, motivo) => {
    const app = await montar({ id: USUARIO, perfil: "USUARIO", status });
    const r = await app.inject({ method: "POST", url: "/qr" });
    expect(r.statusCode).toBe(403);
    expect(r.json().codigo).toBe("CADASTRO_PENDENTE");
    expect(r.json().mensagem).toMatch(motivo);
    expect(r.json().token).toBeUndefined();
  });
});
