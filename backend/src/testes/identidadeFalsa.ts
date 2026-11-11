// Apoio aos testes da identidade (HU-01): repositório e e-mail em memória, relógio controlável
// e um hasher rápido. Mantém a mesma semântica do banco (e-mail único, token de uso único).
import { vi } from "vitest";
import type { CategoriaUsuario, PerfilUsuario, StatusUsuario } from "../../generated/prisma/enums.js";
import {
  EMAIL_JA_CADASTRADO,
  type IdentidadeRepositorio,
  type UsuarioRegistro,
} from "../modules/identidade/repositorio.js";
import type { Hasher } from "../modules/identidade/senha.js";
import type { MensagemEmail, ServicoEmail } from "../modules/identidade/servicoEmail.js";

export type UsuarioFalso = UsuarioRegistro & { ultimaAutenticacao: Date | null };
type TokenFalso = { usuarioId: string; tokenHash: string; expiraEm: Date; usadoEm: Date | null };
type SessaoFalsa = { usuarioId: string; tokenHash: string; expiraEm: Date; revogadaEm: Date | null };

export const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

export function criarRepoIdentidadeFalso() {
  const usuarios = new Map<string, UsuarioFalso>();
  const tokens: TokenFalso[] = [];
  const sessoes: SessaoFalsa[] = [];
  let seq = 0;

  const repo: IdentidadeRepositorio = {
    async buscarPorEmail(email) {
      return [...usuarios.values()].find((u) => u.email === email) ?? null;
    },
    async buscarPorId(id) {
      return usuarios.get(id) ?? null;
    },
    async criarUsuario({ nome, email, senhaHash, categoria }) {
      if ([...usuarios.values()].some((u) => u.email === email)) return EMAIL_JA_CADASTRADO;
      const usuario: UsuarioFalso = {
        id: uuid(++seq),
        nome,
        email,
        senhaHash,
        categoria,
        perfil: "USUARIO",
        status: "PENDENTE_EMAIL",
        ultimaAutenticacao: null,
      };
      usuarios.set(usuario.id, usuario);
      return usuario;
    },
    async atualizarPendente(id, { nome, senhaHash }) {
      const u = usuarios.get(id);
      if (u?.status === "PENDENTE_EMAIL") Object.assign(u, { nome, senhaHash });
    },
    async salvarTokenEmail({ usuarioId, tokenHash, expiraEm }) {
      for (let i = tokens.length - 1; i >= 0; i--) {
        if (tokens[i]!.usuarioId === usuarioId && tokens[i]!.usadoEm === null) tokens.splice(i, 1);
      }
      tokens.push({ usuarioId, tokenHash, expiraEm, usadoEm: null });
    },
    async confirmarEmail(tokenHash, agora) {
      const t = tokens.find((x) => x.tokenHash === tokenHash && x.usadoEm === null && x.expiraEm > agora);
      if (!t) return false;
      t.usadoEm = agora;
      const u = usuarios.get(t.usuarioId);
      if (u?.status === "PENDENTE_EMAIL") u.status = "PENDENTE_APROVACAO";
      return true;
    },
    async criarSessao({ usuarioId, tokenHash, expiraEm, agora }) {
      sessoes.push({ usuarioId, tokenHash, expiraEm, revogadaEm: null });
      const u = usuarios.get(usuarioId);
      if (u) u.ultimaAutenticacao = agora;
    },
    async buscarSessao(tokenHash) {
      const s = sessoes.find((x) => x.tokenHash === tokenHash);
      const u = s && usuarios.get(s.usuarioId);
      if (!s || !u) return null;
      return {
        expiraEm: s.expiraEm,
        revogadaEm: s.revogadaEm,
        usuario: { id: u.id, perfil: u.perfil, status: u.status },
      };
    },
    async revogarSessao(tokenHash, agora) {
      const s = sessoes.find((x) => x.tokenHash === tokenHash && x.revogadaEm === null);
      if (s) s.revogadaEm = agora;
    },
  };

  /** Insere um usuário já pronto (ex.: um admin ativo), com a senha dada. */
  const semear = (dados: {
    email: string;
    senha: string;
    nome?: string;
    perfil?: PerfilUsuario;
    status?: StatusUsuario;
    categoria?: CategoriaUsuario;
  }): UsuarioFalso => {
    const usuario: UsuarioFalso = {
      id: uuid(++seq + 1000),
      nome: dados.nome ?? "Fulano de Tal",
      email: dados.email,
      senhaHash: hasherFalso.hashSync(dados.senha),
      perfil: dados.perfil ?? "USUARIO",
      categoria: dados.categoria ?? "DISCENTE",
      status: dados.status ?? "ATIVO",
      ultimaAutenticacao: null,
    };
    usuarios.set(usuario.id, usuario);
    return usuario;
  };

  return { repo, usuarios, tokens, sessoes, semear };
}

// Hasher rápido e previsível, só para os testes (o Argon2 de verdade tem testes próprios).
export const hasherFalso = {
  hashSync: (senha: string) => `hash(${senha})`,
};

export function criarHasherFalso(): Hasher & { hash: ReturnType<typeof vi.fn>; verify: ReturnType<typeof vi.fn> } {
  return {
    hash: vi.fn(async (senha: string) => hasherFalso.hashSync(senha)),
    verify: vi.fn(async (hash: string, senha: string) => hash === hasherFalso.hashSync(senha)),
  };
}

export function criarEmailFalso() {
  const enviados: MensagemEmail[] = [];
  const servico: ServicoEmail = {
    async enviar(m) {
      enviados.push(m);
    },
  };
  /** Token do link da última mensagem enviada (ou undefined se não houver link). */
  const ultimoToken = () => /token=([\w-]+)/.exec(enviados.at(-1)?.texto ?? "")?.[1];
  return { servico, enviados, ultimoToken };
}

export function criarRelogio(inicio = "2026-11-10T12:00:00.000Z") {
  let agora = new Date(inicio);
  return {
    agora: () => new Date(agora),
    avancar: (ms: number) => {
      agora = new Date(agora.getTime() + ms);
    },
  };
}
