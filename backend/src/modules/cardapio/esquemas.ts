import { z } from "zod";

// Fonte única dos campos do cardápio: chave da API, categoria gravada no banco e rótulo na tela.
export const CAMPOS_CARDAPIO = [
  { chave: "proteinaAnimal", categoria: "Proteína animal", rotulo: "Proteína animal" },
  { chave: "proteinaVegetariana", categoria: "Proteína vegetariana", rotulo: "Proteína vegetariana" },
  { chave: "carboidrato1", categoria: "Carboidrato 1", rotulo: "Carboidrato 1" },
  { chave: "carboidrato2", categoria: "Carboidrato 2", rotulo: "Carboidrato 2" },
  { chave: "carboidrato3", categoria: "Carboidrato 3", rotulo: "Carboidrato 3" },
  { chave: "salada1", categoria: "Salada 1", rotulo: "Salada 1" },
  { chave: "salada2", categoria: "Salada 2", rotulo: "Salada 2" },
  { chave: "sobremesa", categoria: "Sobremesa", rotulo: "Sobremesa" },
  { chave: "suco", categoria: "Suco", rotulo: "Suco" },
] as const;

export type ChaveCardapio = (typeof CAMPOS_CARDAPIO)[number]["chave"];

const obrigatorio = (rotulo: string) => {
  const mensagem = `Preencha o campo "${rotulo}".`;
  return z.string({ error: mensagem }).trim().min(1, mensagem).max(200, "Use no máximo 200 caracteres.");
};

export const corpoCardapio = z.object(
  Object.fromEntries(CAMPOS_CARDAPIO.map((c) => [c.chave, obrigatorio(c.rotulo)])) as Record<
    ChaveCardapio,
    ReturnType<typeof obrigatorio>
  >,
  { error: "Corpo da requisição inválido." },
);

// Anos aceitos: o PostgreSQL não aceita ano 0 e datas muito distantes só poluem os dados.
const ANO_MIN = 2000;
const ANO_MAX = 2100;

/** Confere se "aaaa-mm-dd" é uma data real dentro do intervalo. Nunca lança exceção. */
function dataReal(texto: string): boolean {
  const [ano, mes, dia] = texto.split("-").map(Number);
  if (ano === undefined || mes === undefined || dia === undefined) return false;
  if (!(ano >= ANO_MIN && ano <= ANO_MAX)) return false;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

export const paramsData = z.object({
  data: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida. Use o formato aaaa-mm-dd.")
    .refine(dataReal, `Data inválida. Informe uma data real entre os anos ${ANO_MIN} e ${ANO_MAX}.`),
});

export type CorpoCardapio = z.infer<typeof corpoCardapio>;
