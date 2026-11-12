import { z } from "zod";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import type { PerfilUsuario } from "../../../generated/prisma/enums.js";
import { registrarLog } from "../auditoria/registro.js";
import { SENHA_MAX, primeiraRegraQuebrada } from "../identidade/esquemas.js";
import type { Hasher } from "../identidade/senha.js";

/** Perfis que o Mestre pode criar pela API. Mestre novo só pelo script de instalação. */
export const PERFIS_CRIAVEIS = ["ADMIN", "OPERADOR"] as const;
export type PerfilCriavel = (typeof PERFIS_CRIAVEIS)[number];

export const esquemaNovaConta = z.object(
  {
    nome: z
      .string({ error: "Informe o nome." })
      .trim()
      .min(3, "Informe o nome completo.")
      .max(100, "O nome pode ter no máximo 100 caracteres."),
    // Contas internas não são limitadas ao domínio dos alunos.
    email: z
      .string({ error: "Informe o e-mail." })
      .trim()
      .toLowerCase()
      .max(254, "O e-mail é longo demais.")
      .pipe(z.email("Informe um e-mail válido.")),
    senha: z
      .string({ error: "Informe a senha temporária." })
      .max(SENHA_MAX, `A senha pode ter no máximo ${SENHA_MAX} caracteres.`)
      .superRefine((senha, ctx) => {
        const mensagem = primeiraRegraQuebrada(senha);
        if (mensagem) ctx.addIssue({ code: "custom", message: mensagem });
      }),
    perfil: z.enum(PERFIS_CRIAVEIS, { error: "Escolha o perfil: Admin ou Operador." }),
  },
  { error: "Corpo da requisição inválido." },
);

export type DadosNovaConta = z.infer<typeof esquemaNovaConta>;

export type ContaCriada = { id: string; nome: string; email: string; perfil: PerfilUsuario };

export const EMAIL_JA_CADASTRADO = "EMAIL_JA_CADASTRADO" as const;

export interface ContasRepositorio {
  /**
   * Cria a conta já ATIVA (o Mestre garante a identidade) e grava o log na mesma transação.
   * `atorId` null = criação do primeiro Mestre pelo script.
   */
  criarConta(dados: {
    nome: string;
    email: string;
    senhaHash: string;
    perfil: PerfilUsuario;
    atorId: string | null;
  }): Promise<ContaCriada | typeof EMAIL_JA_CADASTRADO>;
  /** Existe algum Mestre que consegue entrar (hash válido)? Os usuários de exemplo do seed não contam. */
  existeMestreComLogin(): Promise<boolean>;
}

const ACAO_POR_PERFIL: Record<string, string> = { MESTRE: "CRIAR_MESTRE" };

export function criarRepositorioContasPrisma(prisma: PrismaClient): ContasRepositorio {
  return {
    async criarConta({ nome, email, senhaHash, perfil, atorId }) {
      try {
        return await prisma.$transaction(async (tx) => {
          const usuario = await tx.usuario.create({
            data: { nome, email, senhaHash, perfil, categoria: "SERVIDOR", status: "ATIVO" },
            select: { id: true, nome: true, email: true, perfil: true },
          });
          await registrarLog(tx, {
            atorId,
            acao: ACAO_POR_PERFIL[perfil] ?? "CRIAR_CONTA",
            entidade: "usuario",
            entidadeId: usuario.id,
            detalhes: { perfil, email },
          });
          return usuario;
        });
      } catch (e) {
        if ((e as { code?: string }).code === "P2002") return EMAIL_JA_CADASTRADO;
        throw e;
      }
    },

    async existeMestreComLogin() {
      const n = await prisma.usuario.count({
        where: { perfil: "MESTRE", status: "ATIVO", senhaHash: { startsWith: "$argon2" } },
      });
      return n > 0;
    },
  };
}

export function criarServicoContas(repo: ContasRepositorio, hasher: Hasher) {
  return {
    async criar(dados: DadosNovaConta, atorId: string): Promise<ContaCriada | typeof EMAIL_JA_CADASTRADO> {
      const senhaHash = await hasher.hash(dados.senha);
      return repo.criarConta({ nome: dados.nome, email: dados.email, senhaHash, perfil: dados.perfil, atorId });
    },
  };
}

export type ServicoContas = ReturnType<typeof criarServicoContas>;

export const MESTRE_JA_EXISTE = "MESTRE_JA_EXISTE" as const;

/** Cria o primeiro Mestre (script de instalação). Recusa se já houver um que consiga entrar. */
export async function criarPrimeiroMestre(
  repo: ContasRepositorio,
  hasher: Hasher,
  dados: { nome: string; email: string; senha: string },
): Promise<ContaCriada | typeof MESTRE_JA_EXISTE | typeof EMAIL_JA_CADASTRADO> {
  if (await repo.existeMestreComLogin()) return MESTRE_JA_EXISTE;
  const senhaHash = await hasher.hash(dados.senha);
  return repo.criarConta({ nome: dados.nome, email: dados.email, senhaHash, perfil: "MESTRE", atorId: null });
}

export const esquemaPrimeiroMestre = esquemaNovaConta.omit({ perfil: true });
