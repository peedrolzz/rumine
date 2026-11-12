import type { PrismaClient } from "../../../generated/prisma/client.js";
import type { StatusUsuario } from "../../../generated/prisma/enums.js";
import type { Posicao } from "../../shared/cursor.js";
import { registrarLog } from "../auditoria/registro.js";

export type CadastroPendente = {
  usuarioId: string;
  nome: string;
  email: string;
  identificador: string | null;
  declaracaoId: string;
  enviadaEm: Date;
};

export type ResultadoDecisao = "OK" | "NAO_ENCONTRADO" | "JA_DECIDIDO" | "SEM_DECLARACAO";

export type Decisao =
  | { tipo: "APROVADO" }
  | { tipo: "REJEITADO"; motivo: string };

export interface CadastrosRepositorio {
  /** Fila de cadastros em análise (já enviaram a declaração), do mais antigo ao mais novo, depois do cursor. */
  listarPendentes(busca: { depois?: Posicao | undefined; quantidade: number }): Promise<CadastroPendente[]>;
  /**
   * Em uma transação com a linha do usuário travada: confere que ainda está em análise, grava quem
   * decidiu e quando (AnaliseCadastro), muda o status e registra o log. Aprovar também cria a carteira.
   */
  decidir(dados: { usuarioId: string; adminId: string; decisao: Decisao }): Promise<ResultadoDecisao>;
}

export function criarRepositorioCadastrosPrisma(prisma: PrismaClient): CadastrosRepositorio {
  return {
    listarPendentes({ depois, quantidade }) {
      // Só a declaração mais recente de cada conta conta (houve reenvio após rejeição).
      const filtroCursor = depois
        ? prisma.$queryRaw<CadastroPendente[]>`
            SELECT u.id AS "usuarioId", u.nome, u.email, u.identificador, d.id AS "declaracaoId", d.enviada_em AS "enviadaEm"
            FROM usuario u
            JOIN LATERAL (
              SELECT id, enviada_em FROM declaracao WHERE usuario_id = u.id ORDER BY enviada_em DESC, id DESC LIMIT 1
            ) d ON true
            WHERE u.status = 'PENDENTE_APROVACAO'::status_usuario
              AND (d.enviada_em, d.id) > (${depois.data}::timestamp, ${depois.id}::uuid)
            ORDER BY d.enviada_em ASC, d.id ASC
            LIMIT ${quantidade}`
        : prisma.$queryRaw<CadastroPendente[]>`
            SELECT u.id AS "usuarioId", u.nome, u.email, u.identificador, d.id AS "declaracaoId", d.enviada_em AS "enviadaEm"
            FROM usuario u
            JOIN LATERAL (
              SELECT id, enviada_em FROM declaracao WHERE usuario_id = u.id ORDER BY enviada_em DESC, id DESC LIMIT 1
            ) d ON true
            WHERE u.status = 'PENDENTE_APROVACAO'::status_usuario
            ORDER BY d.enviada_em ASC, d.id ASC
            LIMIT ${quantidade}`;
      return filtroCursor;
    },

    decidir({ usuarioId, adminId, decisao }) {
      return prisma.$transaction(async (tx): Promise<ResultadoDecisao> => {
        // Trava a linha: dois Admins decidindo o mesmo cadastro entram um de cada vez, e o segundo
        // encontra o cadastro já analisado.
        const linha = await tx.$queryRaw<{ status: StatusUsuario }[]>`
          SELECT status FROM usuario WHERE id = ${usuarioId}::uuid FOR UPDATE`;
        const status = linha[0]?.status;
        if (!status) return "NAO_ENCONTRADO";
        if (status !== "PENDENTE_APROVACAO") return "JA_DECIDIDO";

        const declaracao = await tx.declaracao.findFirst({
          where: { usuarioId },
          orderBy: [{ enviadaEm: "desc" }, { id: "desc" }],
          select: { id: true },
        });
        if (!declaracao) return "SEM_DECLARACAO";

        const aprovado = decisao.tipo === "APROVADO";
        await tx.analiseCadastro.create({
          data: {
            usuarioId,
            declaracaoId: declaracao.id,
            adminId,
            decisao: decisao.tipo,
            motivo: decisao.tipo === "REJEITADO" ? decisao.motivo : null,
          },
        });
        await tx.usuario.update({ where: { id: usuarioId }, data: { status: aprovado ? "ATIVO" : "REJEITADO" } });
        // A carteira nasce na aprovação, com saldo zero (a recarga e o saldo contam com ela).
        if (aprovado) {
          await tx.carteira.upsert({ where: { usuarioId }, create: { usuarioId, saldoCentavos: 0 }, update: {} });
        }
        await registrarLog(tx, {
          atorId: adminId,
          acao: aprovado ? "APROVAR_CADASTRO" : "REJEITAR_CADASTRO",
          entidade: "usuario",
          entidadeId: usuarioId,
          detalhes: { declaracaoId: declaracao.id, ...(decisao.tipo === "REJEITADO" && { motivo: decisao.motivo }) },
        });
        return "OK";
      });
    },
  };
}
