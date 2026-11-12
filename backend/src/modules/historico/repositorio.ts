import type { PrismaClient } from "../../../generated/prisma/client.js";
import type { TipoTransacao } from "../../../generated/prisma/enums.js";
import type { Posicao } from "../../shared/cursor.js";

// REFEICAO_ISENTA = refeição de aluno PAE: gera consumo, mas nenhuma transação (valor zero).
export type TipoMovimento = TipoTransacao | "REFEICAO_ISENTA";

export type Movimento = {
  id: string;
  tipo: TipoMovimento;
  valorCentavos: number;
  saldoAposCentavos: number | null;
  data: Date;
};

type Busca = { usuarioId: string; depois?: Posicao | undefined; quantidade: number };

/** Cada método devolve até `quantidade` itens, do mais recente para o mais antigo, depois do cursor. */
export interface HistoricoRepositorio {
  transacoes(busca: Busca & { tipos: TipoTransacao[] }): Promise<Movimento[]>;
  refeicoesIsentas(busca: Busca): Promise<Movimento[]>;
}

export function criarRepositorioHistoricoPrisma(prisma: PrismaClient): HistoricoRepositorio {
  return {
    async transacoes({ usuarioId, tipos, depois, quantidade }) {
      const linhas = await prisma.transacao.findMany({
        where: {
          carteira: { usuarioId },
          tipo: { in: tipos },
          // Estritamente "depois" do cursor na ordem (data desc, id desc).
          ...(depois && {
            OR: [{ criadaEm: { lt: depois.data } }, { criadaEm: depois.data, id: { lt: depois.id } }],
          }),
        },
        orderBy: [{ criadaEm: "desc" }, { id: "desc" }],
        take: quantidade,
      });
      return linhas.map((t) => ({
        id: t.id,
        tipo: t.tipo,
        valorCentavos: t.valorCentavos,
        saldoAposCentavos: t.saldoAposCentavos,
        data: t.criadaEm,
      }));
    },

    async refeicoesIsentas({ usuarioId, depois, quantidade }) {
      const linhas = await prisma.consumo.findMany({
        where: {
          usuarioId,
          transacaoId: null, // só PAE: as refeições pagas já aparecem pelo débito da transação
          ...(depois && {
            OR: [{ consumidoEm: { lt: depois.data } }, { consumidoEm: depois.data, id: { lt: depois.id } }],
          }),
        },
        orderBy: [{ consumidoEm: "desc" }, { id: "desc" }],
        take: quantidade,
      });
      return linhas.map((c) => ({
        id: c.id,
        tipo: "REFEICAO_ISENTA" as const,
        valorCentavos: 0,
        saldoAposCentavos: null,
        data: c.consumidoEm,
      }));
    },
  };
}
