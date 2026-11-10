import type { CardapioRepositorio, CardapioDia } from "./repositorio.js";
import { CAMPOS_CARDAPIO, type CorpoCardapio } from "./esquemas.js";

export type CardapioResposta = { data: string } & CorpoCardapio;

const paraResposta = (c: CardapioDia): CardapioResposta => {
  const resposta: Record<string, string> = { data: c.data };
  for (const campo of CAMPOS_CARDAPIO) {
    resposta[campo.chave] = c.itens.find((i) => i.categoria === campo.categoria)?.descricao ?? "";
  }
  return resposta as CardapioResposta;
};

export function criarServicoCardapio(repo: CardapioRepositorio) {
  return {
    async salvar(data: string, usuarioId: string, corpo: CorpoCardapio) {
      const itens = CAMPOS_CARDAPIO.map((c) => ({ categoria: c.categoria, descricao: corpo[c.chave] }));
      return paraResposta(await repo.salvar(data, usuarioId, itens));
    },
    async consultar(data: string) {
      const cardapio = await repo.buscar(data);
      return cardapio ? paraResposta(cardapio) : null;
    },
  };
}

export type ServicoCardapio = ReturnType<typeof criarServicoCardapio>;
