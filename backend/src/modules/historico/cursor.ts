import { z } from "zod";

// Cursor de paginação = posição do último item entregue: (data, id).
// Vai para o cliente como texto opaco (base64url de um JSON).
export type Posicao = { data: Date; id: string };

const formato = z.object({ d: z.iso.datetime(), i: z.uuid() });

export const codificarCursor = (p: Posicao): string =>
  Buffer.from(JSON.stringify({ d: p.data.toISOString(), i: p.id })).toString("base64url");

/** Devolve a posição, ou null se o texto não for um cursor válido (nunca lança exceção). */
export function decodificarCursor(texto: string): Posicao | null {
  try {
    const r = formato.safeParse(JSON.parse(Buffer.from(texto, "base64url").toString("utf-8")));
    return r.success ? { data: new Date(r.data.d), id: r.data.i } : null;
  } catch {
    return null;
  }
}
