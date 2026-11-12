import multipart from "@fastify/multipart";
import type { FastifyInstance } from "fastify";
import { exigirPerfil } from "../../shared/auth.js";
import { LIMITE_BYTES, MENSAGEM_FORMATO, MENSAGEM_TAMANHO } from "./arquivo.js";
import { esquemaIdArquivo, esquemaIdentificador } from "./esquemas.js";
import type { ServicoVinculo } from "./servico.js";

const CAMPO_ARQUIVO = "declaracao";

export function rotasVinculo(servico: ServicoVinculo) {
  return async (app: FastifyInstance) => {
    // Os limites valem só para este plugin (encapsulado): o resto da API continua só com JSON.
    await app.register(multipart, {
      limits: { fileSize: LIMITE_BYTES, files: 1, fields: 3, fieldSize: 200, parts: 5 },
    });

    // Situação do vínculo da própria conta: o front decide entre formulário, "em análise" e "rejeitado".
    app.get("/vinculo", { preHandler: exigirPerfil("USUARIO") }, async (request, reply) => {
      const v = await servico.consultar(request.usuario!.id);
      if (!v) return reply.code(401).send({ mensagem: "Faça login para continuar." });
      return {
        status: v.status,
        identificador: v.identificador,
        declaracaoEnviadaEm: v.declaracaoEnviadaEm?.toISOString() ?? null,
        motivoRejeicao: v.motivoRejeicao,
      };
    });

    // Envio do RA e da declaração (multipart: campo "identificador" e arquivo "declaracao").
    app.post("/vinculo", { preHandler: exigirPerfil("USUARIO") }, async (request, reply) => {
      if (!request.isMultipart()) {
        return reply.code(400).send({ campo: CAMPO_ARQUIVO, mensagem: "Envie o RA e o arquivo da declaração." });
      }

      let identificador: string | undefined;
      let arquivo: Buffer | undefined;
      try {
        for await (const parte of request.parts()) {
          if (parte.type === "file") {
            const conteudo = await parte.toBuffer(); // lança se passar do limite
            if (parte.fieldname === CAMPO_ARQUIVO && !arquivo) arquivo = conteudo;
          } else if (parte.fieldname === "identificador" && typeof parte.value === "string") {
            identificador = parte.value;
          }
        }
      } catch (e) {
        const codigo = (e as { code?: string }).code;
        if (codigo === "FST_REQ_FILE_TOO_LARGE") {
          return reply.code(413).send({ campo: CAMPO_ARQUIVO, mensagem: MENSAGEM_TAMANHO });
        }
        return reply.code(400).send({ campo: CAMPO_ARQUIVO, mensagem: "Não foi possível ler o envio. Tente de novo." });
      }

      const ra = esquemaIdentificador.safeParse(identificador);
      if (!ra.success) {
        return reply.code(400).send({ campo: "identificador", mensagem: ra.error.issues[0]?.message ?? "RA inválido." });
      }
      if (!arquivo) {
        return reply.code(400).send({ campo: CAMPO_ARQUIVO, mensagem: "Escolha o arquivo da declaração." });
      }

      const resultado = await servico.enviar({ usuarioId: request.usuario!.id, identificador: ra.data, arquivo });
      switch (resultado) {
        case "OK":
          return reply.code(201).send({ status: "PENDENTE_APROVACAO" });
        case "ARQUIVO_VAZIO":
          return reply.code(400).send({ campo: CAMPO_ARQUIVO, mensagem: "O arquivo está vazio." });
        case "FORMATO_INVALIDO":
          return reply.code(400).send({ campo: CAMPO_ARQUIVO, mensagem: MENSAGEM_FORMATO });
        case "ARQUIVO_GRANDE":
          return reply.code(413).send({ campo: CAMPO_ARQUIVO, mensagem: MENSAGEM_TAMANHO });
        case "JA_APROVADO":
          return reply.code(409).send({ mensagem: "Seu vínculo já foi aprovado. Não é preciso enviar a declaração de novo." });
        case "EM_ANALISE":
          return reply.code(409).send({ mensagem: "Você já enviou sua declaração. Aguarde a análise do Admin." });
        case "EMAIL_NAO_CONFIRMADO":
          return reply.code(403).send({ mensagem: "Confirme seu e-mail antes de enviar a declaração." });
        case "RA_EM_USO":
          return reply.code(409).send({
            campo: "identificador",
            mensagem: "Este RA já está vinculado a outra conta. Se for um engano, fale com o RU.",
          });
        case "USUARIO_INEXISTENTE":
          return reply.code(401).send({ mensagem: "Faça login para continuar." });
      }
    });

    // Admin abre a declaração (a HU-20 usa esta rota). Cada abertura fica no log de auditoria.
    app.get("/admin/declaracoes/:id/arquivo", { preHandler: exigirPerfil("ADMIN") }, async (request, reply) => {
      const id = esquemaIdArquivo.safeParse((request.params as { id?: string }).id);
      if (!id.success) return reply.code(400).send({ campo: "id", mensagem: "Declaração inválida." });
      const arquivo = await servico.abrirParaAdmin(id.data, request.usuario!.id);
      if (!arquivo) return reply.code(404).send({ mensagem: "Declaração não encontrada." });
      return reply
        .header("Content-Type", arquivo.mime)
        .header("Content-Disposition", "inline")
        .header("X-Content-Type-Options", "nosniff")
        .header("Content-Security-Policy", "default-src 'none'; sandbox")
        .header("Cache-Control", "private, no-store")
        .send(arquivo.conteudo);
    });
  };
}
