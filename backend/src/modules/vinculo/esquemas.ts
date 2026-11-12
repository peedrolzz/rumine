import { z } from "zod";

const MSG_ID = "Informe seu RA (ou SIAPE) com letras e números, sem espaços ou símbolos (6 a 12 caracteres).";

// RA do discente (ex.: a2345678) ou SIAPE do docente (números). Normalizado em minúsculas.
export const esquemaIdentificador = z
  .string({ error: "Informe seu RA." })
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]{6,12}$/, MSG_ID);

export const esquemaIdArquivo = z.uuid({ error: "Declaração inválida." });
