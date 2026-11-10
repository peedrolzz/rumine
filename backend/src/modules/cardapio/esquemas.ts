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
);

export const paramsData = z.object({
  data: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida. Use o formato aaaa-mm-dd.")
    .refine((d) => new Date(`${d}T00:00:00.000Z`).toISOString().startsWith(d), "Data inválida."),
});

export type CorpoCardapio = z.infer<typeof corpoCardapio>;
