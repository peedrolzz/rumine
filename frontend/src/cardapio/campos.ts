// Campos do cardápio do RU, compartilhados pela tela do Admin (T15) e pela do Usuário (T14).
// A mesma lista existe no backend (backend/src/modules/cardapio/esquemas.ts).
export const CAMPOS = [
  { chave: "proteinaAnimal", rotulo: "Proteína animal" },
  { chave: "proteinaVegetariana", rotulo: "Proteína vegetariana" },
  { chave: "carboidrato1", rotulo: "Carboidrato 1" },
  { chave: "carboidrato2", rotulo: "Carboidrato 2" },
  { chave: "carboidrato3", rotulo: "Carboidrato 3" },
  { chave: "salada1", rotulo: "Salada 1" },
  { chave: "salada2", rotulo: "Salada 2" },
  { chave: "sobremesa", rotulo: "Sobremesa" },
  { chave: "suco", rotulo: "Suco" },
] as const;

export type Campo = (typeof CAMPOS)[number]["chave"];
export type Cardapio = Record<Campo, string>;

export const ROTULOS = Object.fromEntries(CAMPOS.map((c) => [c.chave, c.rotulo])) as Record<Campo, string>;

// Agrupamento usado só na exibição para o usuário.
export const GRUPOS: { titulo: string; campos: Campo[] }[] = [
  { titulo: "Proteínas", campos: ["proteinaAnimal", "proteinaVegetariana"] },
  { titulo: "Carboidratos", campos: ["carboidrato1", "carboidrato2", "carboidrato3"] },
  { titulo: "Saladas", campos: ["salada1", "salada2"] },
  { titulo: "Sobremesa e suco", campos: ["sobremesa", "suco"] },
];
