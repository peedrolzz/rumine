import type { PerfilUsuario, StatusUsuario } from "../../../generated/prisma/enums.js";
import { CATEGORIA_CADASTRO, type DadosCadastro } from "./esquemas.js";
import type { Limitador } from "./limitador.js";
import { EMAIL_JA_CADASTRADO, type IdentidadeRepositorio, type UsuarioRegistro } from "./repositorio.js";
import type { Hasher } from "./senha.js";
import type { ServicoEmail } from "./servicoEmail.js";
import { gerarToken, hashToken } from "./tokens.js";

export const VALIDADE_TOKEN_EMAIL_MS = 24 * 3_600_000; // 24 horas
export const VALIDADE_SESSAO_MS = 45 * 24 * 3_600_000; // 45 dias: reautenticação (RF-01)

export type UsuarioPublico = Pick<UsuarioRegistro, "id" | "nome" | "email" | "perfil" | "categoria" | "status">;

export type ResultadoLogin =
  | { tipo: "OK"; token: string; usuario: UsuarioPublico }
  | { tipo: "CREDENCIAIS" | "BLOQUEADO" | "DESATIVADO" | "EMAIL_NAO_CONFIRMADO" };

export type ResultadoSessao =
  | { tipo: "OK"; usuario: { id: string; perfil: PerfilUsuario; status: StatusUsuario } }
  | { tipo: "EXPIRADA" | "NENHUMA" };

export type DependenciasServico = {
  repo: IdentidadeRepositorio;
  hasher: Hasher;
  email: ServicoEmail;
  limitador: Limitador;
  /** Endereço do front, base do link de confirmação enviado por e-mail. */
  urlFrontend: string;
  agora: () => Date;
};

const publico = ({ id, nome, email, perfil, categoria, status }: UsuarioRegistro): UsuarioPublico => ({
  id,
  nome,
  email,
  perfil,
  categoria,
  status,
});

export function criarServicoIdentidade({ repo, hasher, email, limitador, urlFrontend, agora }: DependenciasServico) {
  // Hash de uma senha que ninguém tem: serve para gastar o mesmo tempo quando o e-mail não existe.
  let hashFalso: Promise<string> | undefined;
  const obterHashFalso = () => (hashFalso ??= hasher.hash("senha-que-ninguem-tem"));

  async function enviarConfirmacao(usuario: Pick<UsuarioRegistro, "id" | "nome" | "email">) {
    const token = gerarToken();
    await repo.salvarTokenEmail({
      usuarioId: usuario.id,
      tokenHash: hashToken(token),
      expiraEm: new Date(agora().getTime() + VALIDADE_TOKEN_EMAIL_MS),
    });
    await email.enviar({
      para: usuario.email,
      assunto: "Confirme seu e-mail - RU Mine",
      texto:
        `Olá, ${usuario.nome}!\n\n` +
        `Para concluir seu cadastro no RU Mine, confirme seu e-mail abrindo o link abaixo (vale por 24 horas):\n` +
        `${urlFrontend}/confirmar-email?token=${token}\n\n` +
        `Se você não pediu este cadastro, ignore esta mensagem.`,
    });
  }

  return {
    /**
     * Cadastra (ou reenvia a confirmação de) um usuário. Não diz se o e-mail já tinha conta:
     * quem chama responde sempre igual, e o aviso vai por e-mail para o dono da caixa.
     */
    async cadastrar({ nome, email: endereco, senha }: DadosCadastro): Promise<void> {
      // O hash é calculado sempre, para o tempo de resposta não revelar se o e-mail já existe.
      const senhaHash = await hasher.hash(senha);
      let existente = await repo.buscarPorEmail(endereco);

      if (!existente) {
        const criado = await repo.criarUsuario({ nome, email: endereco, senhaHash, categoria: CATEGORIA_CADASTRO });
        if (criado !== EMAIL_JA_CADASTRADO) return enviarConfirmacao(criado);
        existente = await repo.buscarPorEmail(endereco); // outro cadastro igual chegou na frente
      }
      if (!existente) return;

      if (existente.status === "PENDENTE_EMAIL") {
        // Ainda não confirmou: vale o último cadastro e um novo link (o anterior deixa de valer).
        await repo.atualizarPendente(existente.id, { nome, senhaHash });
        return enviarConfirmacao({ id: existente.id, nome, email: existente.email });
      }

      await email.enviar({
        para: existente.email,
        assunto: "Você já tem uma conta no RU Mine",
        texto:
          `Olá, ${existente.nome}!\n\n` +
          `Alguém tentou criar uma conta no RU Mine com este e-mail, mas ele já está cadastrado.\n` +
          `Se foi você, basta entrar em ${urlFrontend}/entrar. Se não foi, ignore esta mensagem.`,
      });
    },

    /** Confirma o e-mail pelo token do link. Falso se o link é inválido, expirou ou já foi usado. */
    confirmarEmail: (token: string) => repo.confirmarEmail(hashToken(token), agora()),

    async login({ email: endereco, senha, ip }: { email: string; senha: string; ip: string }): Promise<ResultadoLogin> {
      const chave = `${ip}|${endereco}`;
      if (limitador.bloqueado(chave)) return { tipo: "BLOQUEADO" };

      const usuario = await repo.buscarPorEmail(endereco);
      // Sem usuário, compara com o hash falso: mesmo custo, mesma resposta.
      const confere = await hasher.verify(usuario?.senhaHash ?? (await obterHashFalso()), senha);
      if (!usuario || !confere) {
        limitador.registrarFalha(chave);
        return { tipo: "CREDENCIAIS" };
      }

      // Daqui em diante a senha está certa, então já não há o que esconder sobre a conta.
      if (usuario.status === "DESATIVADO") return { tipo: "DESATIVADO" };
      if (usuario.status === "PENDENTE_EMAIL") return { tipo: "EMAIL_NAO_CONFIRMADO" };

      limitador.limpar(chave);
      const token = gerarToken();
      const agoraData = agora();
      await repo.criarSessao({
        usuarioId: usuario.id,
        tokenHash: hashToken(token),
        expiraEm: new Date(agoraData.getTime() + VALIDADE_SESSAO_MS),
        agora: agoraData,
      });
      return { tipo: "OK", token, usuario: publico(usuario) };
    },

    /** Descobre quem é o dono do token do cookie. Confere validade, revogação e se a conta segue ativa. */
    async identificar(token: string): Promise<ResultadoSessao> {
      const sessao = await repo.buscarSessao(hashToken(token));
      if (!sessao || sessao.revogadaEm) return { tipo: "NENHUMA" };
      if (sessao.expiraEm.getTime() <= agora().getTime()) return { tipo: "EXPIRADA" };
      if (sessao.usuario.status === "DESATIVADO") return { tipo: "NENHUMA" };
      return { tipo: "OK", usuario: { id: sessao.usuario.id, perfil: sessao.usuario.perfil, status: sessao.usuario.status } };
    },

    sair: (token: string) => repo.revogarSessao(hashToken(token), agora()),

    async dadosDoUsuario(id: string): Promise<UsuarioPublico | null> {
      const usuario = await repo.buscarPorId(id);
      return usuario ? publico(usuario) : null;
    },
  };
}

export type ServicoIdentidade = ReturnType<typeof criarServicoIdentidade>;
