// Leitura do QR pelo Operador e débito da refeição (HU-07 e HU-08).
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import type { CategoriaPreco, CategoriaUsuario, ResultadoLeitura } from "../../../generated/prisma/enums.js";
import type { ServicoQr } from "./qrToken.js";

export const esquemaLeitura = z.object(
  { token: z.string({ error: "Informe o código lido." }).trim().min(1, "Informe o código lido.").max(2000, "Código inválido.") },
  { error: "Corpo da requisição inválido." },
);

export const MENSAGENS: Record<ResultadoLeitura, string> = {
  LIBERADO: "Liberado",
  NEGADO_SALDO: "Saldo insuficiente",
  NEGADO_TOKEN_INVALIDO: "QR Code inválido",
  NEGADO_TOKEN_EXPIRADO: "QR Code expirado. Peça para o aluno atualizar o código.",
  NEGADO_TOKEN_USADO: "QR Code já utilizado. Peça um código novo.",
  NEGADO_CADASTRO_INATIVO: "Cadastro do aluno não está ativo",
};

export type RespostaLeitura = {
  resultado: ResultadoLeitura;
  liberado: boolean;
  mensagem: string;
  /** Só quando o aluno foi identificado. Nunca o RA. */
  aluno?: { nome: string };
  valorCobradoCentavos?: number;
};

export type ResultadoProcessamento =
  | { resultado: ResultadoLeitura; alunoNome?: string; valorCobradoCentavos?: number }
  | { resultado: "SEM_PRECO" };

export interface LeituraRepositorio {
  /** Registra uma leitura negada sem aluno identificado (token inválido ou expirado). */
  registrarNegada(dados: { operadorId: string; resultado: ResultadoLeitura; agora: Date }): Promise<void>;
  /**
   * Decide e grava, numa única transação: uso único do `jti`, cadastro ativo, preço, saldo e
   * débito (trava da carteira com FOR UPDATE). Devolve "SEM_PRECO" sem consumir o código.
   */
  processar(dados: { operadorId: string; usuarioId: string; jti: string; hoje: string; agora: Date }): Promise<ResultadoProcessamento>;
}

export type ServicoLeitura = { ler(operadorId: string, token: string): Promise<RespostaLeitura | { tipo: "SEM_PRECO" }> };

const resposta = (r: { resultado: ResultadoLeitura; alunoNome?: string | undefined; valorCobradoCentavos?: number | undefined }): RespostaLeitura => ({
  resultado: r.resultado,
  liberado: r.resultado === "LIBERADO",
  mensagem: MENSAGENS[r.resultado],
  ...(r.alunoNome !== undefined && { aluno: { nome: r.alunoNome } }),
  ...(r.valorCobradoCentavos !== undefined && { valorCobradoCentavos: r.valorCobradoCentavos }),
});

export function criarServicoLeitura(deps: {
  qr: ServicoQr;
  repo: LeituraRepositorio;
  agora?: () => Date;
  hoje: () => string;
}): ServicoLeitura {
  const agora = deps.agora ?? (() => new Date());
  return {
    async ler(operadorId, token) {
      const verificado = await deps.qr.verificar(token);
      if (verificado.tipo !== "OK") {
        const resultado = verificado.tipo === "EXPIRADO" ? "NEGADO_TOKEN_EXPIRADO" : "NEGADO_TOKEN_INVALIDO";
        await deps.repo.registrarNegada({ operadorId, resultado, agora: agora() });
        return resposta({ resultado });
      }
      const r = await deps.repo.processar({
        operadorId,
        usuarioId: verificado.usuarioId,
        jti: verificado.jti,
        hoje: deps.hoje(),
        agora: agora(),
      });
      if (r.resultado === "SEM_PRECO") return { tipo: "SEM_PRECO" };
      return resposta(r);
    },
  };
}

// ---------- Prisma ----------

const CATEGORIA_PRECO: Record<CategoriaUsuario, CategoriaPreco> = {
  DISCENTE: "ESTUDANTE",
  DOCENTE: "SERVIDOR",
  SERVIDOR: "SERVIDOR",
  VISITANTE: "VISITANTE",
};

const ehViolacaoUnica = (e: unknown) => (e as { code?: string } | null)?.code === "P2002";

export function criarRepositorioLeituraPrisma(prisma: PrismaClient): LeituraRepositorio {
  const campusId = async (cliente: Pick<PrismaClient, "campus">) => {
    const campus = await cliente.campus.findFirst({ orderBy: { nome: "asc" }, select: { id: true } });
    if (!campus) throw new Error("Nenhum câmpus cadastrado. Rode o seed.");
    return campus.id;
  };
  // Leitura negada: o `jti` real não é gravado quando não há como confiar nele (ou já foi usado),
  // então ela recebe um identificador próprio, único.
  const negada = async (operadorId: string, usuarioId: string | null, resultado: ResultadoLeitura, agora: Date) => {
    await prisma.leituraAcesso.create({
      data: { operadorId, usuarioId, campusId: await campusId(prisma), tokenJti: `negada-${randomUUID()}`, resultado, lidaEm: agora },
    });
  };

  return {
    registrarNegada: ({ operadorId, resultado, agora }) => negada(operadorId, null, resultado, agora),

    async processar({ operadorId, usuarioId, jti, hoje, agora }) {
      try {
        return await prisma.$transaction(async (tx): Promise<ResultadoProcessamento> => {
          const campus = await campusId(tx);
          const registrar = (resultado: ResultadoLeitura, usuario: string | null) =>
            tx.leituraAcesso.create({
              data: { operadorId, usuarioId: usuario, campusId: campus, tokenJti: jti, resultado, lidaEm: agora },
              select: { id: true },
            });

          const usuario = await tx.usuario.findUnique({
            where: { id: usuarioId },
            select: { nome: true, status: true, perfil: true, categoria: true, pae: true },
          });
          // Assinado certo, mas sem aluno (apagado ou perfil errado): trata como inválido.
          if (!usuario || usuario.perfil !== "USUARIO") {
            await registrar("NEGADO_TOKEN_INVALIDO", null);
            return { resultado: "NEGADO_TOKEN_INVALIDO" };
          }

          // Trava a carteira: leituras do mesmo aluno entram uma de cada vez (mesmo QR repetido ou
          // dois QRs ao mesmo tempo), então o saldo nunca é gasto duas vezes.
          const [carteira] = await tx.$queryRaw<{ id: string; saldo_centavos: number }[]>`
            SELECT id, saldo_centavos FROM carteira WHERE usuario_id = ${usuarioId}::uuid FOR UPDATE`;

          // Uso único: este `jti` já foi lido? (A restrição única do banco é a garantia final.)
          const jaUsado = await tx.leituraAcesso.findUnique({ where: { tokenJti: jti }, select: { id: true } });
          if (jaUsado) {
            await tx.leituraAcesso.create({
              data: { operadorId, usuarioId, campusId: campus, tokenJti: `negada-${randomUUID()}`, resultado: "NEGADO_TOKEN_USADO", lidaEm: agora },
            });
            return { resultado: "NEGADO_TOKEN_USADO", alunoNome: usuario.nome };
          }

          if (usuario.status !== "ATIVO") {
            await registrar("NEGADO_CADASTRO_INATIVO", usuarioId);
            return { resultado: "NEGADO_CADASTRO_INATIVO", alunoNome: usuario.nome };
          }

          // PAE: refeição isenta, sem débito (o consumo fica sem transação).
          if (usuario.pae) {
            const leitura = await registrar("LIBERADO", usuarioId);
            await tx.consumo.create({
              data: { leituraId: leitura.id, usuarioId, valorCobradoCentavos: 0, categoriaPreco: "PAE", envioUtfpr: "PENDENTE", consumidoEm: agora },
            });
            return { resultado: "LIBERADO", alunoNome: usuario.nome, valorCobradoCentavos: 0 };
          }

          const categoriaPreco = CATEGORIA_PRECO[usuario.categoria];
          const preco = await tx.precoRefeicao.findFirst({
            where: { campusId: campus, categoriaPreco, vigenteDesde: { lte: new Date(`${hoje}T00:00:00.000Z`) } },
            orderBy: { vigenteDesde: "desc" },
            select: { valorCentavos: true },
          });
          if (!preco) return { resultado: "SEM_PRECO" }; // nada gravado: o código continua valendo

          if (!carteira || carteira.saldo_centavos < preco.valorCentavos) {
            await registrar("NEGADO_SALDO", usuarioId);
            return { resultado: "NEGADO_SALDO", alunoNome: usuario.nome };
          }

          const novoSaldo = carteira.saldo_centavos - preco.valorCentavos;
          const transacao = await tx.transacao.create({
            data: { carteiraId: carteira.id, tipo: "DEBITO_REFEICAO", valorCentavos: preco.valorCentavos, saldoAposCentavos: novoSaldo, criadaEm: agora },
            select: { id: true },
          });
          await tx.carteira.update({ where: { id: carteira.id }, data: { saldoCentavos: novoSaldo } });
          const leitura = await registrar("LIBERADO", usuarioId);
          await tx.consumo.create({
            data: {
              leituraId: leitura.id,
              usuarioId,
              valorCobradoCentavos: preco.valorCentavos,
              categoriaPreco,
              transacaoId: transacao.id,
              envioUtfpr: "PENDENTE",
              consumidoEm: agora,
            },
          });
          return { resultado: "LIBERADO", alunoNome: usuario.nome, valorCobradoCentavos: preco.valorCentavos };
        });
      } catch (e) {
        // Corrida rara: outro processo gravou o mesmo `jti` entre a checagem e a gravação.
        if (!ehViolacaoUnica(e)) throw e;
        await negada(operadorId, usuarioId, "NEGADO_TOKEN_USADO", agora);
        return { resultado: "NEGADO_TOKEN_USADO" };
      }
    },
  };
}
