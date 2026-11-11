import type { PrismaClient } from "../../../generated/prisma/client.js";
import type { CategoriaUsuario, PerfilUsuario, StatusUsuario } from "../../../generated/prisma/enums.js";

export type UsuarioRegistro = {
  id: string;
  nome: string;
  email: string;
  senhaHash: string;
  perfil: PerfilUsuario;
  categoria: CategoriaUsuario;
  status: StatusUsuario;
};

export type SessaoRegistro = {
  expiraEm: Date;
  revogadaEm: Date | null;
  usuario: { id: string; perfil: PerfilUsuario; status: StatusUsuario };
};

export const EMAIL_JA_CADASTRADO = "EMAIL_JA_CADASTRADO" as const;

export interface IdentidadeRepositorio {
  buscarPorEmail(email: string): Promise<UsuarioRegistro | null>;
  buscarPorId(id: string): Promise<UsuarioRegistro | null>;
  /** Cria o usuário (perfil USUARIO, status PENDENTE_EMAIL). Devolve EMAIL_JA_CADASTRADO se o e-mail já existe. */
  criarUsuario(dados: {
    nome: string;
    email: string;
    senhaHash: string;
    categoria: CategoriaUsuario;
  }): Promise<UsuarioRegistro | typeof EMAIL_JA_CADASTRADO>;
  /** Novo cadastro de uma conta ainda não confirmada: vale o último nome e a última senha informados. */
  atualizarPendente(id: string, dados: { nome: string; senhaHash: string }): Promise<void>;
  /** Guarda o token de confirmação (só o hash) e descarta os anteriores ainda não usados. */
  salvarTokenEmail(dados: { usuarioId: string; tokenHash: string; expiraEm: Date }): Promise<void>;
  /** Consome o token (uso único, dentro da validade) e passa o usuário para PENDENTE_APROVACAO. */
  confirmarEmail(tokenHash: string, agora: Date): Promise<boolean>;
  /** Cria a sessão e registra a data da última autenticação. */
  criarSessao(dados: { usuarioId: string; tokenHash: string; expiraEm: Date; agora: Date }): Promise<void>;
  buscarSessao(tokenHash: string): Promise<SessaoRegistro | null>;
  revogarSessao(tokenHash: string, agora: Date): Promise<void>;
}

const SELECAO = { id: true, nome: true, email: true, senhaHash: true, perfil: true, categoria: true, status: true } as const;

export function criarRepositorioIdentidadePrisma(prisma: PrismaClient): IdentidadeRepositorio {
  return {
    buscarPorEmail: (email) => prisma.usuario.findUnique({ where: { email }, select: SELECAO }),
    buscarPorId: (id) => prisma.usuario.findUnique({ where: { id }, select: SELECAO }),

    async criarUsuario({ nome, email, senhaHash, categoria }) {
      try {
        return await prisma.usuario.create({
          data: { nome, email, senhaHash, categoria, perfil: "USUARIO", status: "PENDENTE_EMAIL" },
          select: SELECAO,
        });
      } catch (e) {
        // P2002 = violação de unicidade: outro cadastro com o mesmo e-mail chegou primeiro.
        if ((e as { code?: string }).code === "P2002") return EMAIL_JA_CADASTRADO;
        throw e;
      }
    },

    async atualizarPendente(id, { nome, senhaHash }) {
      await prisma.usuario.updateMany({ where: { id, status: "PENDENTE_EMAIL" }, data: { nome, senhaHash } });
    },

    async salvarTokenEmail({ usuarioId, tokenHash, expiraEm }) {
      await prisma.$transaction(async (tx) => {
        // Trava a linha do usuário: cadastros simultâneos do mesmo e-mail entram um de cada vez,
        // e sobra só o último token. (Sem a trava, duas transações apagam e criam intercaladas
        // e vários links ficam válidos.)
        await tx.$queryRaw`SELECT id FROM usuario WHERE id = ${usuarioId}::uuid FOR UPDATE`;
        await tx.tokenEmail.deleteMany({ where: { usuarioId, usadoEm: null } });
        await tx.tokenEmail.create({ data: { usuarioId, tokenHash, expiraEm } });
      });
    },

    async confirmarEmail(tokenHash, agora) {
      return prisma.$transaction(async (tx) => {
        const token = await tx.tokenEmail.findUnique({ where: { tokenHash } });
        if (!token) return false;
        // Mesma ordem de travas do cadastro (usuário primeiro, depois o token): evita impasse
        // entre uma confirmação e um novo cadastro ao mesmo tempo.
        await tx.$queryRaw`SELECT id FROM usuario WHERE id = ${token.usuarioId}::uuid FOR UPDATE`;
        // O updateMany é atômico: de dois cliques simultâneos no mesmo link, só um vê count = 1.
        const usado = await tx.tokenEmail.updateMany({
          where: { tokenHash, usadoEm: null, expiraEm: { gt: agora } },
          data: { usadoEm: agora },
        });
        if (usado.count === 0) return false;
        await tx.usuario.updateMany({
          where: { id: token.usuarioId, status: "PENDENTE_EMAIL" },
          data: { status: "PENDENTE_APROVACAO" },
        });
        return true;
      });
    },

    async criarSessao({ usuarioId, tokenHash, expiraEm, agora }) {
      await prisma.$transaction([
        prisma.sessao.create({ data: { usuarioId, tokenHash, expiraEm } }),
        prisma.usuario.update({ where: { id: usuarioId }, data: { ultimaAutenticacao: agora } }),
      ]);
    },

    buscarSessao: (tokenHash) =>
      prisma.sessao.findUnique({
        where: { tokenHash },
        select: {
          expiraEm: true,
          revogadaEm: true,
          usuario: { select: { id: true, perfil: true, status: true } },
        },
      }),

    async revogarSessao(tokenHash, agora) {
      await prisma.sessao.updateMany({ where: { tokenHash, revogadaEm: null }, data: { revogadaEm: agora } });
    },
  };
}
