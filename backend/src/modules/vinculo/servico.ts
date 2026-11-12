import { randomUUID } from "node:crypto";
import type { Armazenamento } from "../../shared/armazenamento.js";
import { LIMITE_BYTES, detectarTipo } from "./arquivo.js";
import type { ResultadoEnvio, VinculoRepositorio } from "./repositorio.js";

export type ResultadoServicoEnvio = ResultadoEnvio | "ARQUIVO_VAZIO" | "FORMATO_INVALIDO" | "ARQUIVO_GRANDE";

export function criarServicoVinculo(repo: VinculoRepositorio, armazenamento: Armazenamento) {
  return {
    consultar: (usuarioId: string) => repo.buscar(usuarioId),

    async enviar(dados: { usuarioId: string; identificador: string; arquivo: Buffer }): Promise<ResultadoServicoEnvio> {
      const { usuarioId, identificador, arquivo } = dados;
      if (arquivo.length === 0) return "ARQUIVO_VAZIO";
      if (arquivo.length > LIMITE_BYTES) return "ARQUIVO_GRANDE";
      const tipo = detectarTipo(arquivo);
      if (!tipo) return "FORMATO_INVALIDO";

      // Arquivo primeiro, banco depois: se o banco recusar (ou falhar), o arquivo é apagado e
      // não sobra nada solto. Chave aleatória: o nome original nunca é usado.
      const chave = randomUUID();
      await armazenamento.salvar(chave, arquivo);
      let resultado: ResultadoEnvio;
      try {
        resultado = await repo.registrarEnvio({
          usuarioId,
          identificador,
          arquivoChave: chave,
          mime: tipo.mime,
          tamanhoBytes: arquivo.length,
        });
      } catch (e) {
        await armazenamento.remover(chave).catch(() => undefined);
        throw e;
      }
      if (resultado !== "OK") await armazenamento.remover(chave);
      return resultado;
    },

    /** Declaração para o Admin abrir. Devolve null se não existir (ou se o arquivo sumiu). */
    async abrirParaAdmin(declaracaoId: string, adminId: string) {
      const declaracao = await repo.buscarDeclaracao(declaracaoId);
      if (!declaracao) return null;
      const conteudo = await armazenamento.ler(declaracao.arquivoChave);
      if (!conteudo) return null;
      await repo.registrarVisualizacao({ adminId, declaracaoId, usuarioId: declaracao.usuarioId });
      return { conteudo, mime: declaracao.mime };
    },
  };
}

export type ServicoVinculo = ReturnType<typeof criarServicoVinculo>;
