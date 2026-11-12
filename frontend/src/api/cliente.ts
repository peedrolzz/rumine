// Cliente HTTP único do front: envia o cookie de sessão e traduz erros para português claro.
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export class ErroApi extends Error {
  status: number;
  campo: string | undefined;
  /** Código opcional da API, ex.: "SESSAO_EXPIRADA". */
  codigo: string | undefined;
  constructor(mensagem: string, status: number, campo?: string, codigo?: string) {
    super(mensagem);
    this.status = status;
    this.campo = campo;
    this.codigo = codigo;
  }
}

// Quem cuida da sessão (o AuthProvider) se registra aqui para ser avisado quando uma chamada
// volta 401: a sessão acabou ou venceu e é preciso ir para o login.
type TratadorNaoAutenticado = (erro: ErroApi) => void;
let tratadorNaoAutenticado: TratadorNaoAutenticado | null = null;

/** Registra o tratador de 401. Devolve a função que o remove (usar na limpeza do efeito). */
export function aoNaoAutenticado(tratador: TratadorNaoAutenticado): () => void {
  tratadorNaoAutenticado = tratador;
  return () => {
    if (tratadorNaoAutenticado === tratador) tratadorNaoAutenticado = null;
  };
}

export async function requisitar<T>(caminho: string, opcoes: { metodo?: string; corpo?: unknown } = {}): Promise<T> {
  let resposta: Response;
  try {
    // FormData (envio de arquivo) segue como está: o navegador define o Content-Type com o separador.
    const formulario = opcoes.corpo instanceof FormData ? opcoes.corpo : null;
    resposta = await fetch(`${API_URL}${caminho}`, {
      method: opcoes.metodo ?? "GET",
      credentials: "include",
      headers: opcoes.corpo && !formulario ? { "Content-Type": "application/json" } : {},
      body: formulario ?? (opcoes.corpo ? JSON.stringify(opcoes.corpo) : null),
    });
  } catch {
    throw new ErroApi("Não foi possível conectar ao servidor. Verifique sua internet e tente de novo.", 0);
  }

  if (resposta.ok) {
    // 204 (ex.: logout) não tem corpo: não há o que ler.
    if (resposta.status === 204) return undefined as T;
    return (await resposta.json()) as T;
  }

  const dados = (await resposta.json().catch(() => ({}))) as { mensagem?: string; campo?: string; codigo?: string };
  const erro = new ErroApi(dados.mensagem ?? "Algo deu errado. Tente novamente.", resposta.status, dados.campo, dados.codigo);

  // 401 fora do login = não há sessão válida. No próprio login, 401 só significa senha errada.
  if (resposta.status === 401 && !caminho.startsWith("/auth/login")) tratadorNaoAutenticado?.(erro);
  throw erro;
}
