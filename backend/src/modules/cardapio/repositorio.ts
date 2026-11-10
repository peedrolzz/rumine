import type { PrismaClient } from "../../../generated/prisma/client.js";

export type ItemCardapio = { categoria: string; descricao: string };
export type CardapioDia = { data: string; itens: ItemCardapio[] };

export interface CardapioRepositorio {
  /** Cria o cardápio da data ou substitui o existente (versão nova substitui a anterior). */
  salvar(data: string, publicadoPor: string, itens: ItemCardapio[]): Promise<CardapioDia>;
  buscar(data: string): Promise<CardapioDia | null>;
}

const CAMPUS_MVP = "Dois Vizinhos";
const paraDataBanco = (data: string) => new Date(`${data}T00:00:00.000Z`);

export function criarRepositorioPrisma(prisma: PrismaClient): CardapioRepositorio {
  const campusId = async () => {
    const campus = await prisma.campus.findUnique({ where: { nome: CAMPUS_MVP } });
    if (!campus) throw new Error(`Câmpus "${CAMPUS_MVP}" não encontrado. Rode o seed do banco.`);
    return campus.id;
  };

  return {
    async salvar(data, publicadoPor, itens) {
      const campus = await campusId();
      await prisma.$transaction(async (tx) => {
        const c = await tx.cardapio.upsert({
          where: { campusId_data: { campusId: campus, data: paraDataBanco(data) } },
          create: { campusId: campus, data: paraDataBanco(data), publicadoPor },
          update: { publicadoPor },
        });
        await tx.itemCardapio.deleteMany({ where: { cardapioId: c.id } });
        await tx.itemCardapio.createMany({
          data: itens.map((i) => ({ cardapioId: c.id, ...i })),
        });
      });
      return { data, itens: itens.map((i) => ({ ...i })) };
    },

    async buscar(data) {
      const cardapio = await prisma.cardapio.findUnique({
        where: { campusId_data: { campusId: await campusId(), data: paraDataBanco(data) } },
        include: { itens: true },
      });
      if (!cardapio) return null;
      return {
        data,
        itens: cardapio.itens.map((i) => ({ categoria: i.categoria, descricao: i.descricao })),
      };
    },
  };
}
