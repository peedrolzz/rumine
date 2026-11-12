import { z } from "zod";
import { codificarCursor, decodificarCursor, type Posicao } from "../../shared/cursor.js";
import type { CadastrosRepositorio, ResultadoDecisao } from "./repositorio.js";

const MSG_MOTIVO = "Informe o motivo da rejeição (de 5 a 300 caracteres).";
export const esquemaRejeicao = z.object(
  { motivo: z.string({ error: MSG_MOTIVO }).trim().min(5, MSG_MOTIVO).max(300, MSG_MOTIVO) },
  { error: MSG_MOTIVO },
);

const MSG_LIMITE = "Limite inválido. Use um número de 1 a 50.";
export const consultaCadastros = z.object({
  limite: z.coerce.number({ error: MSG_LIMITE }).int(MSG_LIMITE).min(1, MSG_LIMITE).max(50, MSG_LIMITE).default(20),
  cursor: z.string().optional(),
});

export const esquemaIdUsuario = z.uuid({ error: "Cadastro inválido." });

export const CURSOR_INVALIDO = "CURSOR_INVALIDO" as const;

export type ItemPendente = {
  usuarioId: string;
  nome: string;
  email: string;
  identificador: string | null;
  declaracaoId: string;
  enviadaEm: string;
};

export function criarServicoCadastros(repo: CadastrosRepositorio) {
  return {
    async listar(limite: number, cursor?: string): Promise<{ itens: ItemPendente[]; proximoCursor: string | null } | typeof CURSOR_INVALIDO> {
      let depois: Posicao | undefined;
      if (cursor !== undefined) {
        const posicao = decodificarCursor(cursor);
        if (!posicao) return CURSOR_INVALIDO;
        depois = posicao;
      }
      const linhas = await repo.listarPendentes({ depois, quantidade: limite + 1 });
      const pagina = linhas.slice(0, limite);
      const ultima = pagina.at(-1);
      return {
        // Campos escolhidos um a um: nada além disto sai pela API (nunca o hash da senha).
        itens: pagina.map((l) => ({
          usuarioId: l.usuarioId,
          nome: l.nome,
          email: l.email,
          identificador: l.identificador,
          declaracaoId: l.declaracaoId,
          enviadaEm: l.enviadaEm.toISOString(),
        })),
        proximoCursor: linhas.length > limite && ultima ? codificarCursor({ data: ultima.enviadaEm, id: ultima.declaracaoId }) : null,
      };
    },

    aprovar: (usuarioId: string, adminId: string): Promise<ResultadoDecisao> =>
      repo.decidir({ usuarioId, adminId, decisao: { tipo: "APROVADO" } }),

    rejeitar: (usuarioId: string, adminId: string, motivo: string): Promise<ResultadoDecisao> =>
      repo.decidir({ usuarioId, adminId, decisao: { tipo: "REJEITADO", motivo } }),
  };
}

export type ServicoCadastros = ReturnType<typeof criarServicoCadastros>;
