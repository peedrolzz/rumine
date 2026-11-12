// Armazenamento privado de arquivos (declarações de vínculo). Fica atrás de uma interface: em
// desenvolvimento grava em disco; o serviço de produção (volume ou bucket) entra no deploy.
// Os arquivos nunca são servidos diretamente: só uma rota com perfil Admin os lê.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export interface Armazenamento {
  salvar(chave: string, conteudo: Buffer): Promise<void>;
  /** Devolve null se a chave não existir. */
  ler(chave: string): Promise<Buffer | null>;
  /** Idempotente: remover o que não existe não é erro. */
  remover(chave: string): Promise<void>;
}

// Chaves são UUIDs gerados pelo servidor. Conferir o formato impede que uma chave maliciosa
// (ex.: "../../.env") escape da pasta.
const CHAVE_VALIDA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function criarArmazenamentoEmDisco(pasta: string): Armazenamento {
  const raiz = path.resolve(pasta);
  const caminho = (chave: string) => {
    if (!CHAVE_VALIDA.test(chave)) throw new Error("Chave de arquivo inválida.");
    return path.join(raiz, chave);
  };
  return {
    async salvar(chave, conteudo) {
      const destino = caminho(chave);
      await mkdir(raiz, { recursive: true });
      // "wx": nunca sobrescreve um arquivo existente.
      await writeFile(destino, conteudo, { flag: "wx", mode: 0o600 });
    },
    async ler(chave) {
      try {
        return await readFile(caminho(chave));
      } catch (e) {
        if ((e as { code?: string }).code === "ENOENT") return null;
        throw e;
      }
    },
    async remover(chave) {
      await rm(caminho(chave), { force: true });
    },
  };
}
