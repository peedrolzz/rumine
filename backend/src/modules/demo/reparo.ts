import type { Armazenamento } from "../../shared/armazenamento.js";

/**
 * Garante que o arquivo de uma declaração existe no armazenamento. Quando o app é recriado com um
 * volume novo (ex.: derrubar e subir de novo para a apresentação), o banco ainda aponta para o
 * arquivo, mas ele sumiu. Devolve true se precisou recolocar o arquivo.
 */
export async function garantirArquivoDeclaracao(
  armazenamento: Pick<Armazenamento, "ler" | "salvar">,
  chave: string,
  conteudo: Buffer,
): Promise<boolean> {
  if ((await armazenamento.ler(chave)) !== null) return false;
  await armazenamento.salvar(chave, conteudo);
  return true;
}
