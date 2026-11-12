import type { PrismaClient } from "../../../generated/prisma/client.js";
import type { StatusUsuario } from "../../../generated/prisma/enums.js";
import { registrarLog } from "../auditoria/registro.js";

export type Vinculo = {
  status: StatusUsuario;
  identificador: string | null;
  declaracaoEnviadaEm: Date | null;
  /** Só preenchido enquanto o cadastro está REJEITADO. */
  motivoRejeicao: string | null;
};

export type DadosEnvio = {
  usuarioId: string;
  identificador: string;
  arquivoChave: string;
  mime: string;
  tamanhoBytes: number;
};

export type ResultadoEnvio = "OK" | "JA_APROVADO" | "EMAIL_NAO_CONFIRMADO" | "EM_ANALISE" | "RA_EM_USO" | "USUARIO_INEXISTENTE";

export type DeclaracaoArquivo = { id: string; usuarioId: string; arquivoChave: string; mime: string };

export interface VinculoRepositorio {
  buscar(usuarioId: string): Promise<Vinculo | null>;
  /**
   * Em uma transação com a linha do usuário travada: confere se a conta pode enviar, grava o RA e
   * a declaração e deixa o cadastro PENDENTE_APROVACAO (inclusive no reenvio após rejeição).
   */
  registrarEnvio(dados: DadosEnvio): Promise<ResultadoEnvio>;
  buscarDeclaracao(id: string): Promise<DeclaracaoArquivo | null>;
  /** Registra no log de auditoria que o Admin abriu a declaração. */
  registrarVisualizacao(dados: { adminId: string; declaracaoId: string; usuarioId: string }): Promise<void>;
}

export function criarRepositorioVinculoPrisma(prisma: PrismaClient): VinculoRepositorio {
  return {
    async buscar(usuarioId) {
      const u = await prisma.usuario.findUnique({
        where: { id: usuarioId },
        select: {
          status: true,
          identificador: true,
          declaracoes: { orderBy: { enviadaEm: "desc" }, take: 1, select: { enviadaEm: true } },
          analises: { where: { decisao: "REJEITADO" }, orderBy: { decididaEm: "desc" }, take: 1, select: { motivo: true } },
        },
      });
      if (!u) return null;
      return {
        status: u.status,
        identificador: u.identificador,
        declaracaoEnviadaEm: u.declaracoes[0]?.enviadaEm ?? null,
        motivoRejeicao: u.status === "REJEITADO" ? (u.analises[0]?.motivo ?? null) : null,
      };
    },

    async registrarEnvio({ usuarioId, identificador, arquivoChave, mime, tamanhoBytes }) {
      try {
        return await prisma.$transaction(async (tx): Promise<ResultadoEnvio> => {
          // Trava a linha: dois envios simultâneos da mesma conta entram um de cada vez.
          const linha = await tx.$queryRaw<{ status: StatusUsuario }[]>`
            SELECT status FROM usuario WHERE id = ${usuarioId}::uuid FOR UPDATE`;
          const status = linha[0]?.status;
          if (!status) return "USUARIO_INEXISTENTE";
          if (status === "ATIVO") return "JA_APROVADO";
          if (status === "PENDENTE_EMAIL" || status === "DESATIVADO") return "EMAIL_NAO_CONFIRMADO";
          if (status === "PENDENTE_APROVACAO" && (await tx.declaracao.count({ where: { usuarioId } })) > 0) {
            return "EM_ANALISE"; // já enviou e aguarda o Admin: o arquivo em análise não muda
          }
          const dono = await tx.usuario.findUnique({ where: { identificador }, select: { id: true } });
          if (dono && dono.id !== usuarioId) return "RA_EM_USO";

          await tx.declaracao.create({ data: { usuarioId, arquivoChave, mime, tamanhoBytes } });
          await tx.usuario.update({ where: { id: usuarioId }, data: { identificador, status: "PENDENTE_APROVACAO" } });
          return "OK";
        });
      } catch (e) {
        // P2002 = o mesmo RA foi gravado por outra conta no mesmo instante.
        if ((e as { code?: string }).code === "P2002") return "RA_EM_USO";
        throw e;
      }
    },

    buscarDeclaracao: (id) =>
      prisma.declaracao.findUnique({ where: { id }, select: { id: true, usuarioId: true, arquivoChave: true, mime: true } }),

    async registrarVisualizacao({ adminId, declaracaoId, usuarioId }) {
      await registrarLog(prisma, {
        atorId: adminId,
        acao: "VER_DECLARACAO",
        entidade: "declaracao",
        entidadeId: declaracaoId,
        detalhes: { usuarioId },
      });
    },
  };
}
