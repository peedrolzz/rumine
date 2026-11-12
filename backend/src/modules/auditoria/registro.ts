import type { PrismaClient } from "../../../generated/prisma/client.js";

export type EntradaLog = {
  /** Quem fez. Null só para ações sem usuário logado (ex.: criação do primeiro Mestre pelo script). */
  atorId: string | null;
  /** Verbo em maiúsculas, por exemplo CRIAR_CONTA. */
  acao: string;
  entidade: string;
  entidadeId?: string;
  /** Dados úteis para investigar. Nunca coloque senha, hash ou token aqui. */
  detalhes?: Record<string, string | number | boolean | null>;
};

/**
 * Grava uma linha de log de auditoria (RF-03). Receba o cliente da própria transação para a ação
 * e o log serem gravados juntos: se um falhar, o outro também não fica.
 */
export async function registrarLog(db: Pick<PrismaClient, "logAuditoria">, entrada: EntradaLog): Promise<void> {
  await db.logAuditoria.create({
    data: {
      atorId: entrada.atorId,
      acao: entrada.acao,
      entidade: entrada.entidade,
      entidadeId: entrada.entidadeId ?? null,
      ...(entrada.detalhes && { detalhes: entrada.detalhes }),
    },
  });
}
