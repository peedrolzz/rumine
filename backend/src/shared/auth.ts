// Contrato de autenticação/autorização usado pelos módulos.
// Quem preenche `request.usuario` é o módulo de identidade (HU-01/HU-03).
// Enquanto ele não existe, a aplicação usa um identificador de desenvolvimento
// (ver usuariosDev.ts) ou, nos testes, um identificador falso.
import type { FastifyReply, FastifyRequest } from "fastify";
import type { PerfilUsuario } from "../../generated/prisma/enums.js";

export type UsuarioAutenticado = { id: string; perfil: PerfilUsuario };

declare module "fastify" {
  interface FastifyRequest {
    usuario?: UsuarioAutenticado | undefined;
  }
}

/** Hook que descobre quem está chamando e preenche `request.usuario`. */
export type Identificador = (request: FastifyRequest) => void | Promise<void>;

/** Bloqueia a rota por perfil: 401 sem login, 403 com perfil não permitido. */
export function exigirPerfil(...perfis: PerfilUsuario[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.usuario) {
      return reply.code(401).send({ mensagem: "Faça login para continuar." });
    }
    if (!perfis.includes(request.usuario.perfil)) {
      return reply.code(403).send({ mensagem: "Você não tem permissão para esta ação." });
    }
  };
}
