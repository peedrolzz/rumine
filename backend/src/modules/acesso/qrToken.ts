import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

/** Validade do QR Code (RNF-12 / ADR-005). */
export const VALIDADE_QR_SEGUNDOS = 30;
/** Tolerância de relógio na verificação (ADR-005): poucos segundos, só para diferença entre aparelhos. */
export const TOLERANCIA_RELOGIO_SEGUNDOS = 2;
const EMISSOR = "rumine";
const MIN_SEGREDO = 32;

export type QrEmitido = { token: string; expiraEm: string; validadeSegundos: number };

export type QrVerificado =
  | { tipo: "OK"; usuarioId: string; jti: string; expiraEm: Date }
  | { tipo: "EXPIRADO" }
  | { tipo: "INVALIDO" };

export type ServicoQr = {
  /** Gera um QR novo para o usuário: JWT HS256 de 30 s com `sub` e `jti` único, e NUNCA o RA. */
  gerar(usuarioId: string): Promise<QrEmitido>;
  /**
   * Confere assinatura, emissor e validade. NÃO marca o `jti` como usado: o uso único vem da
   * restrição única de `leitura_acesso.token_jti`, gravada na leitura (HU-07/HU-08).
   */
  verificar(token: string): Promise<QrVerificado>;
};

export function criarServicoQr(opcoes: { segredo: string; agora?: () => Date }): ServicoQr {
  if (opcoes.segredo.length < MIN_SEGREDO) {
    throw new Error(`QR_SEGREDO precisa ter ao menos ${MIN_SEGREDO} caracteres.`);
  }
  const chave = new TextEncoder().encode(opcoes.segredo);
  const agora = opcoes.agora ?? (() => new Date());

  return {
    async gerar(usuarioId) {
      const emitidoEm = Math.floor(agora().getTime() / 1000);
      const expira = emitidoEm + VALIDADE_QR_SEGUNDOS;
      const token = await new SignJWT({})
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setSubject(usuarioId)
        .setJti(randomUUID())
        .setIssuer(EMISSOR)
        .setIssuedAt(emitidoEm)
        .setExpirationTime(expira)
        .sign(chave);
      return { token, expiraEm: new Date(expira * 1000).toISOString(), validadeSegundos: VALIDADE_QR_SEGUNDOS };
    },

    async verificar(token) {
      try {
        const { payload } = await jwtVerify(token, chave, {
          algorithms: ["HS256"],
          issuer: EMISSOR,
          currentDate: agora(),
          clockTolerance: TOLERANCIA_RELOGIO_SEGUNDOS,
          requiredClaims: ["sub", "jti", "exp"],
        });
        if (!payload.sub || !payload.jti || payload.exp === undefined) return { tipo: "INVALIDO" };
        return { tipo: "OK", usuarioId: payload.sub, jti: payload.jti, expiraEm: new Date(payload.exp * 1000) };
      } catch (erro) {
        // A lib marca o vencimento com este código; qualquer outra falha é token inválido/adulterado.
        const codigo = (erro as { code?: string }).code;
        return codigo === "ERR_JWT_EXPIRED" ? { tipo: "EXPIRADO" } : { tipo: "INVALIDO" };
      }
    },
  };
}
