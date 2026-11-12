import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// Provedor de pagamento atrás de uma interface (ADR-006, CLAUDE.md). Hoje existe a versão
// simulada (o provedor real, como o Mercado Pago, está fora do MVP); um adaptador real entraria no mesmo contrato, sem mudar quem usa.

export type CobrancaCriada = {
  /** Identificador da cobrança no provedor. Único: é a chave da idempotência. */
  idExterno: string;
  /** Código Pix "copia e cola" para o usuário pagar. */
  codigoPagamento: string;
};

export type ResultadoPagamento = "CONFIRMADA" | "RECUSADA" | "EXPIRADA";

/** O que o provedor avisa por webhook. */
export type EventoPagamento = {
  idExterno: string;
  resultado: ResultadoPagamento;
  /** Valor que o provedor diz ter cobrado, em centavos (conferido contra o que foi pedido). */
  valorCentavos: number;
  /** Motivo, quando o pagamento não foi concluído. */
  motivo?: string | undefined;
};

export interface GatewayPagamento {
  /** Nome gravado em cobranca_recarga.provedor. */
  readonly nome: string;
  criarCobranca(dados: { valorCentavos: number; referencia: string }): Promise<CobrancaCriada>;
  /**
   * Confere a autenticidade do webhook e devolve o evento. Devolve null se a assinatura não
   * confere ou o corpo é inválido: nesse caso nada pode ser creditado.
   */
  lerWebhook(dados: { corpoBruto: string; assinatura: string | undefined }): EventoPagamento | null;
}

// ---------------------------------------------------------------------------------------------
// Versão simulada: não fala com ninguém. Serve aos testes automáticos, ao desenvolvimento e como
// plano B da apresentação. O webhook dela é assinado com HMAC-SHA256, como os de provedores reais.
// ---------------------------------------------------------------------------------------------

export const CABECALHO_ASSINATURA = "x-assinatura";

const esquemaEvento = z.object({
  idExterno: z.string().min(1).max(200),
  resultado: z.enum(["CONFIRMADA", "RECUSADA", "EXPIRADA"]),
  valorCentavos: z.number().int().nonnegative(),
  motivo: z.string().max(300).optional(),
});

export type GatewaySimulado = GatewayPagamento & {
  /** Corpo e assinatura de um webhook válido (para testes e para o "simular pagamento" de desenvolvimento). */
  assinar(evento: EventoPagamento): { corpoBruto: string; assinatura: string };
};

export function criarGatewaySimulado(segredo: string): GatewaySimulado {
  const assinatura = (corpo: string) => createHmac("sha256", segredo).update(corpo).digest("hex");

  return {
    nome: "simulado",

    async criarCobranca({ valorCentavos }) {
      const idExterno = `sim_${randomUUID()}`;
      return { idExterno, codigoPagamento: `PIX-SIMULADO-${valorCentavos}-${idExterno.slice(4, 12).toUpperCase()}` };
    },

    lerWebhook({ corpoBruto, assinatura: recebida }) {
      if (!recebida) return null;
      const esperada = Buffer.from(assinatura(corpoBruto));
      const dada = Buffer.from(recebida);
      // Comparação em tempo constante (e de mesmo tamanho) para não vazar a assinatura por tempo.
      if (esperada.length !== dada.length || !timingSafeEqual(esperada, dada)) return null;
      try {
        const r = esquemaEvento.safeParse(JSON.parse(corpoBruto));
        return r.success ? r.data : null;
      } catch {
        return null;
      }
    },

    assinar(evento) {
      const corpoBruto = JSON.stringify(evento);
      return { corpoBruto, assinatura: assinatura(corpoBruto) };
    },
  };
}
