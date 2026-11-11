// Contrato de autenticação/autorização usado pelos módulos.
// Quem preenche `request.usuario` é o módulo de identidade, a partir do cookie de sessão
// (HU-01). Em desenvolvimento, DEV_USUARIO (ver usuariosDev.ts) pode substituí-lo; nos
// testes de outros módulos, um identificador falso.
import type { FastifyReply, FastifyRequest } from "fastify";
import type { PerfilUsuario } from "../../generated/prisma/enums.js";

export type UsuarioAutenticado = { id: string; perfil: PerfilUsuario };

declare module "fastify" {
  interface FastifyRequest {
    usuario?: UsuarioAutenticado | undefined;
    /** Havia cookie de sessão, mas a sessão expirou (passou o prazo de reautenticação). */
    sessaoExpirada?: boolean | undefined;
  }
}

/** Hook que descobre quem está chamando e preenche `request.usuario`. */
export type Identificador = (request: FastifyRequest) => void | Promise<void>;

/** Bloqueia a rota por perfil: 401 sem login, 403 com perfil não permitido. */
export function exigirPerfil(...perfis: PerfilUsuario[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.usuario) {
      if (request.sessaoExpirada) {
        return reply.code(401).send({ codigo: "SESSAO_EXPIRADA", mensagem: "Sua sessão expirou. Entre novamente." });
      }
      return reply.code(401).send({ mensagem: "Faça login para continuar." });
    }
    if (!perfis.includes(request.usuario.perfil)) {
      return reply.code(403).send({ mensagem: "Você não tem permissão para esta ação." });
    }
  };
}
