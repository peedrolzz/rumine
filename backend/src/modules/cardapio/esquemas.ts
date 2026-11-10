import { z } from "zod";

const texto = (mensagem: string) =>
  z.string({ error: mensagem }).trim().min(1, mensagem).max(500, "Use no máximo 500 caracteres.");

export const corpoCardapio = z.object({
  pratoPrincipal: texto("Informe o prato principal."),
  acompanhamentos: texto("Informe os acompanhamentos."),
  sobremesa: texto("Informe a sobremesa."),
});

export const paramsData = z.object({
  data: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida. Use o formato aaaa-mm-dd.")
    .refine((d) => new Date(`${d}T00:00:00.000Z`).toISOString().startsWith(d), "Data inválida."),
});

export type CorpoCardapio = z.infer<typeof corpoCardapio>;
