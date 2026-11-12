export const LIMITE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MENSAGEM_FORMATO = "Envie a declaração em PDF, JPG ou PNG.";
export const MENSAGEM_TAMANHO = "O arquivo é grande demais. O limite é de 5 MB.";

export type TipoArquivo = { mime: "application/pdf" | "image/jpeg" | "image/png"; extensao: "pdf" | "jpg" | "png" };

const comecaCom = (b: Buffer, assinatura: number[]) => assinatura.every((byte, i) => b[i] === byte);

/**
 * Descobre o tipo pelo conteúdo (os primeiros bytes do arquivo), nunca pelo nome ou pelo tipo
 * que o cliente disse: um .exe renomeado para .pdf não passa.
 */
export function detectarTipo(conteudo: Buffer): TipoArquivo | null {
  if (comecaCom(conteudo, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { mime: "application/pdf", extensao: "pdf" }; // %PDF-
  if (comecaCom(conteudo, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", extensao: "jpg" };
  if (comecaCom(conteudo, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", extensao: "png" };
  return null;
}
