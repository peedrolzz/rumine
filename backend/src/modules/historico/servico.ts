import { codificarCursor, type Posicao } from "./cursor.js";
import type { Filtro } from "./esquemas.js";
import type { HistoricoRepositorio, Movimento } from "./repositorio.js";

export type ItemHistorico = Omit<Movimento, "data"> & { data: string };
export type PaginaHistorico = { itens: ItemHistorico[]; proximoCursor: string | null };

// Qual tipo de transação cada aba mostra. Refeições isentas (PAE) entram em "todos" e "consumo".
const TIPOS = {
  todos: ["RECARGA", "DEBITO_REFEICAO", "ESTORNO"],
  recargas: ["RECARGA"],
  consumo: ["DEBITO_REFEICAO"],
  estornos: ["ESTORNO"],
} as const;
const COM_ISENTAS: Filtro[] = ["todos", "consumo"];

// Mais recente primeiro; empate de data desempata pelo id (mesma ordem do banco).
const maisRecentePrimeiro = (a: Movimento, b: Movimento) =>
  b.data.getTime() - a.data.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

export function criarServicoHistorico(repo: HistoricoRepositorio) {
  return {
    async listar(usuarioId: string, filtro: Filtro, limite: number, depois?: Posicao): Promise<PaginaHistorico> {
      // Pede um item a mais de cada fonte: se sobrar, existe próxima página.
      const quantidade = limite + 1;
      const [transacoes, isentas] = await Promise.all([
        repo.transacoes({ usuarioId, tipos: [...TIPOS[filtro]], depois, quantidade }),
        COM_ISENTAS.includes(filtro) ? repo.refeicoesIsentas({ usuarioId, depois, quantidade }) : [],
      ]);

      // Cada fonte já vem ordenada e limitada; o topo da união é o topo das duas juntas.
      const unidos = [...transacoes, ...isentas].sort(maisRecentePrimeiro);
      const pagina = unidos.slice(0, limite);
      const ultimo = pagina.at(-1);

      return {
        // Campos escolhidos um a um: nada além disto pode vazar para a resposta.
        itens: pagina.map((m) => ({
          id: m.id,
          tipo: m.tipo,
          valorCentavos: Math.abs(m.valorCentavos),
          saldoAposCentavos: m.saldoAposCentavos,
          data: m.data.toISOString(),
        })),
        proximoCursor: unidos.length > limite && ultimo ? codificarCursor({ data: ultimo.data, id: ultimo.id }) : null,
      };
    },
  };
}

export type ServicoHistorico = ReturnType<typeof criarServicoHistorico>;
