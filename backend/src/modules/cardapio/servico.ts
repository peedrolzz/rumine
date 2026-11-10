import type { CardapioRepositorio, CardapioDia } from "./repositorio.js";
import type { CorpoCardapio } from "./esquemas.js";

const CATEGORIAS = {
  pratoPrincipal: "Prato principal",
  acompanhamentos: "Acompanhamentos",
  sobremesa: "Sobremesa",
} as const;

export type CardapioResposta = { data: string } & CorpoCardapio;

const paraResposta = (c: CardapioDia): CardapioResposta => {
  const descricao = (categoria: string) =>
    c.itens.find((i) => i.categoria === categoria)?.descricao ?? "";
  return {
    data: c.data,
    pratoPrincipal: descricao(CATEGORIAS.pratoPrincipal),
    acompanhamentos: descricao(CATEGORIAS.acompanhamentos),
    sobremesa: descricao(CATEGORIAS.sobremesa),
  };
};

export function criarServicoCardapio(repo: CardapioRepositorio) {
  return {
    async salvar(data: string, usuarioId: string, corpo: CorpoCardapio) {
      const itens = [
        { categoria: CATEGORIAS.pratoPrincipal, descricao: corpo.pratoPrincipal },
        { categoria: CATEGORIAS.acompanhamentos, descricao: corpo.acompanhamentos },
        { categoria: CATEGORIAS.sobremesa, descricao: corpo.sobremesa },
      ];
      return paraResposta(await repo.salvar(data, usuarioId, itens));
    },
    async consultar(data: string) {
      const cardapio = await repo.buscar(data);
      return cardapio ? paraResposta(cardapio) : null;
    },
  };
}

export type ServicoCardapio = ReturnType<typeof criarServicoCardapio>;
