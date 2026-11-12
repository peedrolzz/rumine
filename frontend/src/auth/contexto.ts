import { createContext, useContext } from "react";

export type Usuario = {
  id: string;
  nome: string;
  email: string;
  perfil: "USUARIO" | "OPERADOR" | "ADMIN" | "MESTRE";
  categoria: "DISCENTE" | "DOCENTE" | "SERVIDOR" | "VISITANTE";
  status: "PENDENTE_EMAIL" | "PENDENTE_APROVACAO" | "ATIVO" | "REJEITADO" | "DESATIVADO";
};

export type EstadoAuth =
  /** Descobrindo se há sessão (primeira abertura do app). */
  | { tipo: "carregando" }
  /** Não foi possível saber (servidor fora do ar): não é o mesmo que estar deslogado. */
  | { tipo: "erro"; mensagem: string }
  /** Sem sessão. `expirou`: tinha uma e ela acabou. `saiu`: a pessoa clicou em Sair. */
  | { tipo: "anonimo"; expirou: boolean; saiu: boolean }
  | { tipo: "autenticado"; usuario: Usuario };

export type Auth = {
  estado: EstadoAuth;
  /** Faz o login. Lança ErroApi com a mensagem do servidor se falhar. */
  entrar(email: string, senha: string): Promise<Usuario>;
  /** Encerra a sessão no servidor. Se falhar (ex.: sem internet), lança e a pessoa continua logada. */
  sair(): Promise<void>;
  /** Consulta a sessão de novo. `silencioso` não troca a tela por "carregando". */
  recarregar(opcoes?: { silencioso?: boolean }): Promise<void>;
};

export const AuthContexto = createContext<Auth | null>(null);

export function useAuth(): Auth {
  const auth = useContext(AuthContexto);
  if (!auth) throw new Error("useAuth precisa estar dentro do AuthProvider.");
  return auth;
}
