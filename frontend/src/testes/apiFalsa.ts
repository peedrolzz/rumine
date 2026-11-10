// API falsa para testes de tela: responde às rotas /cardapios/:data e registra as chamadas.
import { vi } from "vitest";

export type RespostaFalsa = { status: number; corpo: unknown } | Error;

export type ApiFalsa = {
  /** Datas consultadas por GET, na ordem. */
  chamadas: string[];
  /** Corpos e métodos de todas as requisições (inclui PUT). */
  requisicoes: { metodo: string; data: string; corpo: unknown }[];
  /** Define a resposta de uma data para um método (padrão GET); sobrescreve a anterior. */
  rota: (data: string, resposta: RespostaFalsa, metodo?: "GET" | "PUT") => void;
  /** Deixa a data pendente até chamar `resolver`, para simular resposta lenta. */
  pendente: (data: string, metodo?: "GET" | "PUT") => { resolver: (resposta: RespostaFalsa) => void };
};

const montar = (r: RespostaFalsa) => {
  if (r instanceof Error) throw r;
  return new Response(JSON.stringify(r.corpo), { status: r.status });
};

export function criarApiFalsa(): ApiFalsa {
  const rotas = new Map<string, () => Promise<Response>>();
  const api: ApiFalsa = {
    chamadas: [],
    requisicoes: [],
    rota: (data, resposta, metodo = "GET") => {
      rotas.set(`${metodo}:${data}`, async () => montar(resposta));
    },
    pendente: (data, metodo = "GET") => {
      let resolver!: (r: RespostaFalsa) => void;
      const promessa = new Promise<RespostaFalsa>((ok) => (resolver = ok));
      rotas.set(`${metodo}:${data}`, async () => montar(await promessa));
      return { resolver };
    },
  };

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const data = String(url).replace(/^.*\/cardapios\//, "");
      const metodo = init?.method ?? "GET";
      api.requisicoes.push({ metodo, data, corpo: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (metodo === "GET") api.chamadas.push(data);
      const rota = rotas.get(`${metodo}:${data}`);
      if (rota) return rota();
      // Sem rota definida: GET = ainda não publicado; PUT = gravado com sucesso.
      if (metodo === "PUT") return new Response(JSON.stringify({}), { status: 200 });
      return new Response(JSON.stringify({ mensagem: "O cardápio desta data ainda não foi publicado." }), { status: 404 });
    }),
  );
  return api;
}
