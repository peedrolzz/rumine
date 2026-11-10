// Cliente HTTP único do front: envia o cookie de sessão e traduz erros para português claro.
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export class ErroApi extends Error {
  status: number;
  campo: string | undefined;
  constructor(mensagem: string, status: number, campo?: string) {
    super(mensagem);
    this.status = status;
    this.campo = campo;
  }
}

export async function requisitar<T>(caminho: string, opcoes: { metodo?: string; corpo?: unknown } = {}): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(`${API_URL}${caminho}`, {
      method: opcoes.metodo ?? "GET",
      credentials: "include",
      headers: opcoes.corpo ? { "Content-Type": "application/json" } : {},
      body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : null,
    });
  } catch {
    throw new ErroApi("Não foi possível conectar ao servidor. Verifique sua internet e tente de novo.", 0);
  }

  if (resposta.ok) return (await resposta.json()) as T;

  const dados = (await resposta.json().catch(() => ({}))) as { mensagem?: string; campo?: string };
  throw new ErroApi(dados.mensagem ?? "Algo deu errado. Tente novamente.", resposta.status, dados.campo);
}
