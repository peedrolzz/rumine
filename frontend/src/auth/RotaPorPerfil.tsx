import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./contexto";
import { INICIO_POR_PERFIL, type Perfil } from "./perfis";

export const AVISO_SEM_ACESSO = "Você não tem acesso a essa tela.";

/**
 * Só deixa passar os perfis indicados; os demais vão para a tela inicial do próprio perfil,
 * com um aviso. Vem depois da RotaProtegida (que garante a sessão). O backend também barra
 * a rota: aqui é só para a pessoa não ficar em uma tela que não é dela.
 */
export default function RotaPorPerfil({ perfis }: { perfis: Perfil[] }) {
  const { estado } = useAuth();
  if (estado.tipo !== "autenticado") return null; // a RotaProtegida já trata esses casos

  const perfil = estado.usuario.perfil;
  if (perfis.includes(perfil)) return <Outlet />;
  return <Navigate to={INICIO_POR_PERFIL[perfil]} replace state={{ aviso: AVISO_SEM_ACESSO }} />;
}

/** Rota "/": o Usuário vê o Início; os outros perfis vão para a tela inicial deles. */
export function InicioPorPerfil({ inicioUsuario }: { inicioUsuario: React.ReactNode }) {
  const { estado } = useAuth();
  if (estado.tipo !== "autenticado") return null;
  const perfil = estado.usuario.perfil;
  return perfil === "USUARIO" ? inicioUsuario : <Navigate to={INICIO_POR_PERFIL[perfil]} replace />;
}
