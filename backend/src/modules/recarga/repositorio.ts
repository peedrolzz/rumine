import type { PrismaClient } from "../../../generated/prisma/client.js";
import type { StatusCobranca } from "../../../generated/prisma/enums.js";
import type { EventoPagamento } from "./gateway.js";

export type CobrancaRegistro = {
  id: string;
  usuarioId: string;
  valorCentavos: number;
  status: StatusCobranca;
  provedor: string;
  codigoPagamento: string | null;
  motivoFalha: string | null;
  criadaEm: Date;
  confirmadaEm: Date | null;
};

export type NovaCobranca = {
  usuarioId: string;
  valorCentavos: number;
  provedor: string;
  idExterno: string;
  codigoPagamento: string;
};

/**
 * O que aconteceu ao aplicar um aviso do provedor:
 * - CREDITADA: o saldo foi aumentado agora (primeira confirmação);
 * - RECUSADA: a cobrança foi marcada como recusada/expirada, sem tocar no saldo;
 * - JA_PROCESSADA: aviso repetido, nada mudou (idempotência);
 * - DESCONHECIDA: nenhuma cobrança com esse id; VALOR_DIVERGENTE: o provedor cobrou outro valor.
 */
export type ResultadoEvento = "CREDITADA" | "RECUSADA" | "JA_PROCESSADA" | "DESCONHECIDA" | "VALOR_DIVERGENTE";

export interface RecargaRepositorio {
  criarCobranca(dados: NovaCobranca): Promise<CobrancaRegistro>;
  /** Cobranças do usuário ainda PENDENTES e criadas depois de `desde`. */
  contarPendentes(usuarioId: string, desde: Date): Promise<number>;
  /** Só devolve a cobrança se ela for do usuário (a de outra pessoa vale como inexistente). */
  buscarDoUsuario(id: string, usuarioId: string): Promise<CobrancaRegistro | null>;
  /** Busca pelo id interno, sem conferir o dono (uso interno da simulação de desenvolvimento). */
  buscarPorId(id: string): Promise<(CobrancaRegistro & { idExterno: string }) | null>;
  aplicarEvento(evento: EventoPagamento, agora: Date): Promise<ResultadoEvento>;
}

const SELECAO = {
  id: true,
  usuarioId: true,
  valorCentavos: true,
  status: true,
  provedor: true,
  codigoPagamento: true,
  motivoFalha: true,
  criadaEm: true,
  confirmadaEm: true,
} as const;

type LinhaCobranca = { id: string; usuario_id: string; valor_centavos: number; status: StatusCobranca };

export function criarRepositorioRecargaPrisma(prisma: PrismaClient): RecargaRepositorio {
  return {
    criarCobranca: ({ usuarioId, valorCentavos, provedor, idExterno, codigoPagamento }) =>
      prisma.cobrancaRecarga.create({
        data: { usuarioId, valorCentavos, provedor, idExterno, codigoPagamento, status: "PENDENTE" },
        select: SELECAO,
      }),

    contarPendentes: (usuarioId, desde) =>
      prisma.cobrancaRecarga.count({ where: { usuarioId, status: "PENDENTE", criadaEm: { gt: desde } } }),

    buscarDoUsuario: (id, usuarioId) => prisma.cobrancaRecarga.findFirst({ where: { id, usuarioId }, select: SELECAO }),

    buscarPorId: (id) => prisma.cobrancaRecarga.findUnique({ where: { id }, select: { ...SELECAO, idExterno: true } }),

    aplicarEvento(evento, agora) {
      return prisma.$transaction(async (tx): Promise<ResultadoEvento> => {
        // Trava a cobrança: dois avisos do mesmo pagamento (retentativa do provedor, clique duplo,
        // processos diferentes) entram um de cada vez, e o segundo já encontra tudo processado.
        const linhas = await tx.$queryRaw<LinhaCobranca[]>`
          SELECT id, usuario_id, valor_centavos, status FROM cobranca_recarga
          WHERE id_externo = ${evento.idExterno} FOR UPDATE`;
        const cobranca = linhas[0];
        if (!cobranca) return "DESCONHECIDA";
        if (cobranca.valor_centavos !== evento.valorCentavos) return "VALOR_DIVERGENTE";

        if (evento.resultado !== "CONFIRMADA") {
          // Recusa e expiração só valem para o que ainda está pendente.
          if (cobranca.status !== "PENDENTE") return "JA_PROCESSADA";
          await tx.cobrancaRecarga.update({
            where: { id: cobranca.id },
            data: { status: evento.resultado, motivoFalha: evento.motivo ?? null },
          });
          return "RECUSADA";
        }

        // Confirmação: credita uma única vez. Pendente ou expirada (pagou depois do prazo) podem
        // ser creditadas, porque o dinheiro entrou; confirmada ou recusada, não.
        if (cobranca.status === "CONFIRMADA" || cobranca.status === "RECUSADA") return "JA_PROCESSADA";

        // A carteira nasce na aprovação do cadastro; se faltar, cria com saldo zero.
        await tx.carteira.upsert({
          where: { usuarioId: cobranca.usuario_id },
          create: { usuarioId: cobranca.usuario_id, saldoCentavos: 0 },
          update: {},
        });
        const [carteira] = await tx.$queryRaw<{ id: string; saldo_centavos: number }[]>`
          SELECT id, saldo_centavos FROM carteira WHERE usuario_id = ${cobranca.usuario_id}::uuid FOR UPDATE`;
        const novoSaldo = carteira!.saldo_centavos + cobranca.valor_centavos;

        const transacao = await tx.transacao.create({
          data: {
            carteiraId: carteira!.id,
            tipo: "RECARGA",
            valorCentavos: cobranca.valor_centavos,
            saldoAposCentavos: novoSaldo,
          },
          select: { id: true },
        });
        await tx.carteira.update({ where: { id: carteira!.id }, data: { saldoCentavos: novoSaldo } });
        await tx.cobrancaRecarga.update({
          where: { id: cobranca.id },
          data: { status: "CONFIRMADA", transacaoId: transacao.id, confirmadaEm: agora, motivoFalha: null },
        });
        return "CREDITADA";
      });
    },
  };
}
