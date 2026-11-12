// Backend falso para testes de tela: responde às rotas /auth/* como a API de verdade e guarda
// o estado da sessão (logado, expirada), para testar fluxos inteiros sem servidor.
import { vi } from "vitest";
import type { Usuario } from "../auth/contexto";

export type RespostaFalsa = { status: number; corpo?: unknown } | Error;
export type Corpo = Record<string, string | undefined>;
type Manipulador = RespostaFalsa | ((corpo: Corpo, consulta: URLSearchParams) => RespostaFalsa | Promise<RespostaFalsa>);

export const USUARIO_ATIVO: Usuario = {
  id: "00000000-0000-4000-8000-000000000003",
  nome: "Maria da Silva",
  email: "maria@alunos.utfpr.edu.br",
  perfil: "USUARIO",
  categoria: "DISCENTE",
  status: "ATIVO",
};
export const SENHA = "Senha@123";

export type Chamada = { metodo: string; caminho: string; consulta: string; corpo: Corpo | undefined };

export function criarBackendFalso(opcoes: { usuario?: Usuario; logado?: boolean } = {}) {
  const rotas = new Map<string, Manipulador>();
  const chamadas: Chamada[] = [];

  /** Estado da sessão que o teste pode mudar para simular o que acontece no servidor. */
  const sessao = {
    usuario: opcoes.usuario ?? USUARIO_ATIVO,
    logado: opcoes.logado ?? false,
    /** Quando true e não logado, /auth/me responde SESSAO_EXPIRADA em vez de "faça login". */
    expirada: false,
  };

  const naoAutenticado = (): RespostaFalsa =>
    sessao.expirada
      ? { status: 401, corpo: { codigo: "SESSAO_EXPIRADA", mensagem: "Sua sessão expirou. Entre novamente." } }
      : { status: 401, corpo: { mensagem: "Faça login para continuar." } };

  /** Define uma rota. Rotas protegidas devolvem 401 quando a sessão não está logada. */
  const rota = (metodo: string, caminho: string, manipulador: Manipulador, opcoesRota: { protegida?: boolean } = {}) => {
    rotas.set(`${metodo} ${caminho}`, async (corpo, consulta) => {
      if (opcoesRota.protegida && !sessao.logado) return naoAutenticado();
      return typeof manipulador === "function" ? manipulador(corpo, consulta) : manipulador;
    });
  };

  // Rotas de autenticação, com a mesma regra da API.
  rota("GET", "/auth/me", () => (sessao.logado ? { status: 200, corpo: { usuario: sessao.usuario } } : naoAutenticado()));
  rota("POST", "/auth/login", (corpo) => {
    if (corpo.email === sessao.usuario.email && corpo.senha === SENHA) {
      sessao.logado = true;
      sessao.expirada = false;
      return { status: 200, corpo: { usuario: sessao.usuario } };
    }
    return { status: 401, corpo: { mensagem: "E-mail ou senha incorretos." } };
  });
  rota("POST", "/auth/logout", () => {
    sessao.logado = false;
    return { status: 204 };
  });

  const fetchFalso = vi.fn(async (endereco: string, init?: RequestInit) => {
    const url = new URL(endereco);
    const metodo = init?.method ?? "GET";
    const corpo = init?.body ? (JSON.parse(String(init.body)) as Corpo) : undefined;
    chamadas.push({ metodo, caminho: url.pathname, consulta: url.search, corpo });

    const chave = `${metodo} ${url.pathname}`;
    const manipulador = rotas.get(chave);
    const resposta: RespostaFalsa = manipulador
      ? await (manipulador as (c: Corpo, q: URLSearchParams) => Promise<RespostaFalsa>)(corpo ?? {}, url.searchParams)
      : { status: 404, corpo: { mensagem: "Rota não encontrada." } };
    if (resposta instanceof Error) throw resposta;
    return new Response(resposta.status === 204 ? null : JSON.stringify(resposta.corpo ?? {}), { status: resposta.status });
  });
  vi.stubGlobal("fetch", fetchFalso);

  /** Deixa a rota esperando até chamar `resolver` (resposta lenta). */
  const adiar = (metodo: string, caminho: string) => {
    const chave = `${metodo} ${caminho}`;
    const anterior = rotas.get(chave);
    let liberar!: (r: RespostaFalsa) => void;
    const promessa = new Promise<RespostaFalsa>((ok) => (liberar = ok));
    rotas.set(chave, async () => promessa);
    return { resolver: (r: RespostaFalsa) => liberar(r), restaurar: () => anterior && rotas.set(chave, anterior) };
  };

  return {
    sessao,
    chamadas,
    rota,
    adiar,
    /** Quantas vezes a rota foi chamada. */
    vezes: (metodo: string, caminho: string) => chamadas.filter((c) => c.metodo === metodo && c.caminho === caminho).length,
  };
}

export type BackendFalso = ReturnType<typeof criarBackendFalso>;
