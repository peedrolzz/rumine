import type { PrismaClient } from "../../../generated/prisma/client.js";

export type SaldoRegistro = { saldoCentavos: number; atualizadoEm: Date };

export interface CarteiraRepositorio {
  /** Saldo da carteira do usuário, ou null se ela ainda não existe. */
  buscarSaldo(usuarioId: string): Promise<SaldoRegistro | null>;
}

export function criarRepositorioCarteiraPrisma(prisma: PrismaClient): CarteiraRepositorio {
  return {
    buscarSaldo: (usuarioId) =>
      prisma.carteira.findUnique({ where: { usuarioId }, select: { saldoCentavos: true, atualizadoEm: true } }),
  };
}
