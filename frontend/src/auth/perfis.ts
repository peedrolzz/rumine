import type { Usuario } from "./contexto";

export type Perfil = Usuario["perfil"];

/** Tela inicial de cada perfil: onde cai quem entra, e para onde vai quem abre uma tela que não é sua. */
export const INICIO_POR_PERFIL: Record<Perfil, string> = {
  USUARIO: "/",
  OPERADOR: "/operador/leitura",
  ADMIN: "/admin/cardapio",
  MESTRE: "/mestre/logs",
};

/**
 * Isto só escolhe o que mostrar: quem barra de verdade é o backend (401/403 por rota).
 * Os rótulos e os caminhos do menu estão em layout/LayoutApp.tsx.
 */
export const NOME_PERFIL: Record<Perfil, string> = {
  USUARIO: "Usuário",
  OPERADOR: "Operador",
  ADMIN: "Admin",
  MESTRE: "Mestre",
};
