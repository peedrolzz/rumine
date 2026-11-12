// Conferências do envio de vínculo feitas no aparelho, antes de enviar. O servidor repete todas
// (e confere o conteúdo real do arquivo): aqui é só para a pessoa saber logo o que corrigir.
export const LIMITE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MENSAGEM_FORMATO = "Envie a declaração em PDF, JPG ou PNG.";
export const MENSAGEM_TAMANHO = "O arquivo é grande demais. O limite é de 5 MB.";
export const MENSAGEM_RA = "Informe seu RA com letras e números, sem espaços ou símbolos (6 a 12 caracteres).";

export const EXTENSOES = [".pdf", ".jpg", ".jpeg", ".png"];
export const ACEITA = [...EXTENSOES, "application/pdf", "image/jpeg", "image/png"].join(",");

export type ErrosVinculo = { identificador?: string; declaracao?: string };

export function validarVinculo(identificador: string, arquivo: File | null): ErrosVinculo {
  const erros: ErrosVinculo = {};
  if (!identificador.trim()) erros.identificador = "Informe seu RA.";
  else if (!/^[a-z0-9]{6,12}$/i.test(identificador.trim())) erros.identificador = MENSAGEM_RA;

  if (!arquivo) erros.declaracao = "Escolha o arquivo da declaração.";
  else if (!EXTENSOES.some((e) => arquivo.name.toLowerCase().endsWith(e))) erros.declaracao = MENSAGEM_FORMATO;
  else if (arquivo.size === 0) erros.declaracao = "O arquivo está vazio.";
  else if (arquivo.size > LIMITE_BYTES) erros.declaracao = MENSAGEM_TAMANHO;
  return erros;
}

/** 1536 -> "1,5 KB"; 2 MB -> "2,0 MB" (vírgula decimal, como no Brasil). */
export function formatarTamanho(bytes: number): string {
  const casas = (n: number) => n.toFixed(1).replace(".", ",");
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${casas(bytes / 1024)} KB`;
  return `${casas(bytes / (1024 * 1024))} MB`;
}
