import { z } from "zod";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import { codificarCursor, decodificarCursor, type Posicao } from "../../shared/cursor.js";

export type LogItem = {
  id: string;
  data: string;
  acao: string;
  entidade: string;
  entidadeId: string | null;
  detalhes: unknown;
  autor: { id: string; nome: string } | null;
};

export type PaginaLogs = { itens: LogItem[]; proximoCursor: string | null };

type LinhaLog = {
  id: string;
  criadoEm: Date;
  acao: string;
  entidade: string;
  entidadeId: string | null;
  detalhes: unknown;
  ator: { id: string; nome: string } | null;
};

export interface LogsRepositorio {
  /** Até `quantidade` linhas, da mais recente para a mais antiga, estritamente depois do cursor. */
  listar(busca: { depois?: Posicao | undefined; quantidade: number }): Promise<LinhaLog[]>;
}

export function criarRepositorioLogsPrisma(prisma: PrismaClient): LogsRepositorio {
  return {
    listar: ({ depois, quantidade }) =>
      prisma.logAuditoria.findMany({
        where: depois
          ? { OR: [{ criadoEm: { lt: depois.data } }, { criadoEm: depois.data, id: { lt: depois.id } }] }
          : {},
        orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
        take: quantidade,
        select: {
          id: true,
          criadoEm: true,
          acao: true,
          entidade: true,
          entidadeId: true,
          detalhes: true,
          ator: { select: { id: true, nome: true } },
        },
      }),
  };
}

const MSG_LIMITE = "Limite inválido. Use um número de 1 a 100.";
export const consultaLogs = z.object({
  limite: z.coerce.number({ error: MSG_LIMITE }).int(MSG_LIMITE).min(1, MSG_LIMITE).max(100, MSG_LIMITE).default(30),
  cursor: z.string().optional(),
});

export const CURSOR_INVALIDO = "CURSOR_INVALIDO" as const;

export function criarServicoLogs(repo: LogsRepositorio) {
  return {
    async listar(limite: number, cursor?: string): Promise<PaginaLogs | typeof CURSOR_INVALIDO> {
      let depois: Posicao | undefined;
      if (cursor !== undefined) {
        const posicao = decodificarCursor(cursor);
        if (!posicao) return CURSOR_INVALIDO;
        depois = posicao;
      }
      // Pede um a mais para saber se há próxima página.
      const linhas = await repo.listar({ depois, quantidade: limite + 1 });
      const pagina = linhas.slice(0, limite);
      const ultima = pagina.at(-1);
      return {
        // Campos escolhidos um a um: nada além disto sai pela API.
        itens: pagina.map((l) => ({
          id: l.id,
          data: l.criadoEm.toISOString(),
          acao: l.acao,
          entidade: l.entidade,
          entidadeId: l.entidadeId,
          detalhes: l.detalhes,
          autor: l.ator ? { id: l.ator.id, nome: l.ator.nome } : null,
        })),
        proximoCursor: linhas.length > limite && ultima ? codificarCursor({ data: ultima.criadoEm, id: ultima.id }) : null,
      };
    },
  };
}

export type ServicoLogs = ReturnType<typeof criarServicoLogs>;
