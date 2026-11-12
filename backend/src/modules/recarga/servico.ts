import { z } from "zod";
import type { EventoPagamento, GatewayPagamento } from "./gateway.js";
import type { CobrancaRegistro, RecargaRepositorio, ResultadoEvento } from "./repositorio.js";

// Limites por recarga (HU-05): decisão do P.O.
export const VALOR_MINIMO_CENTAVOS = 500; // R$ 5,00
export const VALOR_MAXIMO_CENTAVOS = 20000; // R$ 200,00
/** Prazo para pagar o Pix; depois disso a tela mostra a recarga como expirada. */
export const VALIDADE_COBRANCA_MS = 30 * 60_000;
/** Quantas recargas aguardando pagamento cada pessoa pode ter ao mesmo tempo. */
export const MAX_PENDENTES = 3;

const reais = (centavos: number) => `R$ ${(centavos / 100).toFixed(2).replace(".", ",")}`;
const MSG_VALOR = "Informe o valor da recarga.";

export const esquemaNovaRecarga = z.object(
  {
    valorCentavos: z
      .number({ error: MSG_VALOR })
      .int("Informe o valor em reais e centavos.")
      .min(VALOR_MINIMO_CENTAVOS, `O valor mínimo da recarga é ${reais(VALOR_MINIMO_CENTAVOS)}.`)
      .max(VALOR_MAXIMO_CENTAVOS, `O valor máximo da recarga é ${reais(VALOR_MAXIMO_CENTAVOS)}.`),
  },
  { error: MSG_VALOR },
);

export const esquemaIdRecarga = z.uuid({ error: "Recarga inválida." });

/** Como a recarga aparece para o usuário. Pendente depois do prazo vale como expirada. */
export type RecargaPublica = {
  id: string;
  valorCentavos: number;
  status: "PENDENTE" | "CONFIRMADA" | "RECUSADA" | "EXPIRADA";
  motivoFalha: string | null;
  codigoPagamento: string | null;
  expiraEm: string;
  criadaEm: string;
  confirmadaEm: string | null;
};

export type ResultadoCriar =
  | { tipo: "OK"; recarga: RecargaPublica }
  | { tipo: "MUITAS_PENDENTES" }
  | { tipo: "PROVEDOR_INDISPONIVEL" };

type Dependencias = {
  repo: RecargaRepositorio;
  gateway: GatewayPagamento;
  agora?: () => Date;
};

export function criarServicoRecarga({ repo, gateway, agora = () => new Date() }: Dependencias) {
  const publica = (c: CobrancaRegistro): RecargaPublica => {
    const expiraEm = new Date(c.criadaEm.getTime() + VALIDADE_COBRANCA_MS);
    const vencida = c.status === "PENDENTE" && expiraEm.getTime() <= agora().getTime();
    return {
      id: c.id,
      valorCentavos: c.valorCentavos,
      status: vencida ? "EXPIRADA" : c.status,
      motivoFalha: vencida ? "O prazo para pagar terminou. Gere uma nova recarga." : c.motivoFalha,
      // Depois de paga, recusada ou vencida não há mais o que pagar com este código.
      codigoPagamento: c.status === "PENDENTE" && !vencida ? c.codigoPagamento : null,
      expiraEm: expiraEm.toISOString(),
      criadaEm: c.criadaEm.toISOString(),
      confirmadaEm: c.confirmadaEm?.toISOString() ?? null,
    };
  };

  return {
    /** Cria a cobrança. NUNCA credita: o saldo só muda quando o provedor confirma (RN-03). */
    async criar(usuarioId: string, valorCentavos: number): Promise<ResultadoCriar> {
      const desde = new Date(agora().getTime() - VALIDADE_COBRANCA_MS);
      if ((await repo.contarPendentes(usuarioId, desde)) >= MAX_PENDENTES) return { tipo: "MUITAS_PENDENTES" };

      let cobrancaExterna;
      try {
        cobrancaExterna = await gateway.criarCobranca({ valorCentavos, referencia: usuarioId });
      } catch {
        return { tipo: "PROVEDOR_INDISPONIVEL" };
      }
      const cobranca = await repo.criarCobranca({
        usuarioId,
        valorCentavos,
        provedor: gateway.nome,
        idExterno: cobrancaExterna.idExterno,
        codigoPagamento: cobrancaExterna.codigoPagamento,
      });
      return { tipo: "OK", recarga: publica(cobranca) };
    },

    /** Recarga do próprio usuário; a de outra pessoa não existe para ele (404, sem revelar nada). */
    async consultar(id: string, usuarioId: string): Promise<RecargaPublica | null> {
      const cobranca = await repo.buscarDoUsuario(id, usuarioId);
      return cobranca ? publica(cobranca) : null;
    },

    /** Aplica o aviso do provedor (webhook). Idempotente: repetir o mesmo aviso não credita de novo. */
    receberEvento: (evento: EventoPagamento): Promise<ResultadoEvento> => repo.aplicarEvento(evento, agora()),

    /**
     * Só desenvolvimento: faz de conta que o provedor avisou. Passa pelo mesmo `aplicarEvento` do
     * webhook de verdade, só sem a assinatura (o servidor é quem "fala" pelo provedor simulado).
     */
    async simularPagamento(
      id: string,
      usuarioId: string,
      resultado: "CONFIRMADA" | "RECUSADA",
    ): Promise<ResultadoEvento | "NAO_ENCONTRADA"> {
      const dono = await repo.buscarDoUsuario(id, usuarioId);
      if (!dono) return "NAO_ENCONTRADA";
      const cobranca = await repo.buscarPorId(id);
      if (!cobranca) return "NAO_ENCONTRADA";
      return repo.aplicarEvento(
        {
          idExterno: cobranca.idExterno,
          resultado,
          valorCentavos: cobranca.valorCentavos,
          ...(resultado === "RECUSADA" && { motivo: "Pagamento recusado pelo banco (simulação)." }),
        },
        agora(),
      );
    },
  };
}

export type ServicoRecarga = ReturnType<typeof criarServicoRecarga>;
