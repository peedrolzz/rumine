// Usuários fixos de desenvolvimento (criados pelo seed). Só valem fora de produção,
// enquanto o login real (HU-01/HU-03) não existe. Uso: DEV_USUARIO=ADMIN no .env.
import type { PerfilUsuario } from "../../generated/prisma/enums.js";
import type { Identificador } from "./auth.js";

export const USUARIOS_DEV: Record<PerfilUsuario, string> = {
  ADMIN: "00000000-0000-4000-8000-000000000001",
  OPERADOR: "00000000-0000-4000-8000-000000000002",
  USUARIO: "00000000-0000-4000-8000-000000000003",
  MESTRE: "00000000-0000-4000-8000-000000000004",
};

export function identificadorDev(): Identificador | undefined {
  const perfil = process.env.DEV_USUARIO as PerfilUsuario | undefined;
  if (process.env.NODE_ENV === "production" || !perfil || !Object.hasOwn(USUARIOS_DEV, perfil)) {
    return undefined;
  }
  return (request) => {
    request.usuario = { id: USUARIOS_DEV[perfil], perfil };
  };
}
