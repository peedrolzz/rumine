import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { exigirCadastroAtivo, exigirPerfil } from "../../shared/auth.js";
import { validar } from "../../shared/validacao.js";
import { CABECALHO_ASSINATURA, type GatewayPagamento } from "./gateway.js";
import { MAX_PENDENTES, esquemaIdRecarga, esquemaNovaRecarga, type ServicoRecarga } from "./servico.js";

const podeRecarregar = { preHandler: [exigirPerfil("USUARIO"), exigirCadastroAtivo()] };

type Opcoes = {
  /** Habilita o "simular pagamento" de desenvolvimento. Nunca em produção. */
  simulacao: boolean;
};

export function rotasRecarga(servico: ServicoRecarga, { simulacao }: Opcoes) {
  return async (app: FastifyInstance) => {
    // Cria a recarga. Não credita nada: o saldo só muda quando o provedor confirma (RN-03).
    app.post("/recargas", podeRecarregar, async (request, reply) => {
      const dados = validar(esquemaNovaRecarga, request.body ?? {}, reply);
      if (!dados) return;
      const r = await servico.criar(request.usuario!.id, dados.valorCentavos);
      if (r.tipo === "MUITAS_PENDENTES") {
        return reply.code(429).send({
          mensagem: `Você já tem ${MAX_PENDENTES} recargas aguardando pagamento. Pague uma delas ou espere o prazo terminar.`,
        });
      }
      if (r.tipo === "PROVEDOR_INDISPONIVEL") {
        return reply.code(502).send({ mensagem: "Não foi possível gerar o pagamento agora. Tente de novo em instantes." });
      }
      return reply.code(201).header("Cache-Control", "no-store").send({ ...r.recarga, simulacao });
    });

    // Situação de uma recarga do próprio usuário (a tela consulta enquanto espera o pagamento).
    app.get("/recargas/:id", podeRecarregar, async (request, reply) => {
      const id = esquemaIdRecarga.safeParse((request.params as { id?: string }).id);
      if (!id.success) return reply.code(400).send({ campo: "id", mensagem: "Recarga inválida." });
      const recarga = await servico.consultar(id.data, request.usuario!.id);
      if (!recarga) return reply.code(404).send({ mensagem: "Recarga não encontrada." });
      return reply.header("Cache-Control", "no-store").send({ ...recarga, simulacao });
    });

    if (simulacao) {
      // Só desenvolvimento: finge o aviso do provedor, pelo mesmo caminho do webhook de verdade.
      const esquema = z.object(
        { resultado: z.enum(["CONFIRMADA", "RECUSADA"], { error: "Informe CONFIRMADA ou RECUSADA." }) },
        { error: "Informe CONFIRMADA ou RECUSADA." },
      );
      app.post("/dev/recargas/:id/simular", podeRecarregar, async (request, reply) => {
        const id = esquemaIdRecarga.safeParse((request.params as { id?: string }).id);
        if (!id.success) return reply.code(400).send({ campo: "id", mensagem: "Recarga inválida." });
        const dados = validar(esquema, request.body ?? {}, reply);
        if (!dados) return;
        const r = await servico.simularPagamento(id.data, request.usuario!.id, dados.resultado);
        if (r === "NAO_ENCONTRADA") return reply.code(404).send({ mensagem: "Recarga não encontrada." });
        return { resultado: r };
      });
    }
  };
}

/**
 * Aviso do provedor de pagamento. Rota pública (quem chama é o provedor, sem sessão): a
 * autenticidade vem da assinatura do corpo. Fica em um plugin à parte porque lê o corpo
 * "cru" (a assinatura é calculada sobre os bytes exatos, não sobre o JSON já interpretado).
 */
export function rotasWebhookPagamento(servico: ServicoRecarga, gateway: GatewayPagamento) {
  return async (app: FastifyInstance) => {
    app.addContentTypeParser("application/json", { parseAs: "string" }, (_request, corpo, feito) => feito(null, corpo));

    app.post("/webhooks/pagamento", async (request, reply) => {
      const assinatura = request.headers[CABECALHO_ASSINATURA];
      const evento = gateway.lerWebhook({
        corpoBruto: typeof request.body === "string" ? request.body : "",
        assinatura: typeof assinatura === "string" ? assinatura : undefined,
      });
      // Sem assinatura válida nada é creditado.
      if (!evento) return reply.code(401).send({ mensagem: "Assinatura inválida." });

      const resultado = await servico.receberEvento(evento);
      if (resultado === "DESCONHECIDA") request.log.warn({ idExterno: evento.idExterno }, "Webhook de cobrança desconhecida");
      if (resultado === "VALOR_DIVERGENTE") {
        request.log.error({ idExterno: evento.idExterno, valor: evento.valorCentavos }, "Webhook com valor diferente do cobrado: nada foi creditado");
      }
      // 200 sempre que o aviso era autêntico: o provedor não precisa insistir em reenviar.
      return { resultado };
    });
  };
}
