import { useCallback, useEffect, useMemo, useState } from "react";
import { aoNaoAutenticado, ErroApi, requisitar } from "../api/cliente";
import { AuthContexto, type Auth, type EstadoAuth, type Usuario } from "./contexto";

// Passa de "tem sessão" para "sem sessão". Se havia sessão antes, ela acabou (venceu, foi
// revogada ou a conta foi desativada): a pessoa vê o aviso de sessão expirada no login.
const perdeuSessao = (erro: ErroApi) => (atual: EstadoAuth): EstadoAuth => ({
  tipo: "anonimo",
  expirou: atual.tipo === "autenticado" || erro.codigo === "SESSAO_EXPIRADA",
  saiu: false,
});

// Resultado da consulta de sessão, como transição de estado.
const comSessao = (usuario: Usuario): EstadoAuth => ({ tipo: "autenticado", usuario });
const semConsulta = (e: unknown) => (atual: EstadoAuth): EstadoAuth =>
  e instanceof ErroApi && e.status === 401
    ? perdeuSessao(e)(atual)
    : { tipo: "erro", mensagem: e instanceof ErroApi ? e.message : "Algo deu errado. Tente novamente." };

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [estado, setEstado] = useState<EstadoAuth>({ tipo: "carregando" });

  // Primeira abertura: o estado já começa em "carregando".
  useEffect(() => {
    let cancelado = false;
    requisitar<{ usuario: Usuario }>("/auth/me")
      .then(({ usuario }) => !cancelado && setEstado(comSessao(usuario)))
      .catch((e: unknown) => !cancelado && setEstado(semConsulta(e)));
    return () => {
      cancelado = true;
    };
  }, []);

  // Qualquer chamada do app que volte 401 derruba a sessão local e leva ao login.
  useEffect(() => aoNaoAutenticado((erro) => setEstado(perdeuSessao(erro))), []);

  const entrar = useCallback(async (email: string, senha: string) => {
    const { usuario } = await requisitar<{ usuario: Usuario }>("/auth/login", {
      metodo: "POST",
      corpo: { email, senha },
    });
    setEstado({ tipo: "autenticado", usuario });
    return usuario;
  }, []);

  const sair = useCallback(async () => {
    // Só muda a tela depois que o servidor confirmou: se a chamada falhar, a sessão
    // continua valendo no aparelho e a pessoa precisa saber disso.
    await requisitar("/auth/logout", { metodo: "POST" });
    setEstado({ tipo: "anonimo", expirou: false, saiu: true });
  }, []);

  const recarregar = useCallback(async (opcoes?: { silencioso?: boolean }) => {
    if (!opcoes?.silencioso) setEstado({ tipo: "carregando" });
    try {
      const { usuario } = await requisitar<{ usuario: Usuario }>("/auth/me");
      setEstado(comSessao(usuario));
    } catch (e) {
      setEstado(semConsulta(e));
    }
  }, []);

  const valor = useMemo<Auth>(() => ({ estado, entrar, sair, recarregar }), [estado, entrar, sair, recarregar]);
  return <AuthContexto.Provider value={valor}>{children}</AuthContexto.Provider>;
}
