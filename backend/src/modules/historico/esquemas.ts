import { z } from "zod";

export const FILTROS = ["todos", "recargas", "consumo", "estornos"] as const;
export type Filtro = (typeof FILTROS)[number];

const MSG_LIMITE = "Limite inválido. Use um número de 1 a 50.";

export const consultaHistorico = z.object({
  tipo: z.enum(FILTROS, { error: "Filtro inválido. Use todos, recargas, consumo ou estornos." }).default("todos"),
  limite: z.coerce
    .number({ error: MSG_LIMITE })
    .int(MSG_LIMITE)
    .min(1, MSG_LIMITE)
    .max(50, MSG_LIMITE)
    .default(20),
  cursor: z.string().optional(),
  // Aceito só para negar: o histórico é sempre o do usuário logado.
  usuarioId: z.string().optional(),
});
