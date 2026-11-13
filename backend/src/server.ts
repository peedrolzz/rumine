import "dotenv/config";
import { buildApp } from "./app.js";
import { prisma } from "./shared/prisma.js";
import { identificadorDev } from "./shared/usuariosDev.js";
import { criarRepositorioLogsPrisma } from "./modules/auditoria/consulta.js";
import { criarRepositorioContasPrisma } from "./modules/mestre/contas.js";
import { criarArmazenamentoEmDisco } from "./shared/armazenamento.js";
import { criarRepositorioVinculoPrisma } from "./modules/vinculo/repositorio.js";
import { criarRepositorioCadastrosPrisma } from "./modules/cadastros/repositorio.js";
import { criarRepositorioCarteiraPrisma } from "./modules/carteira/repositorio.js";
import { simulacaoDemoEmProducao, simulacaoHabilitada } from "./modules/recarga/config.js";
import { criarGatewaySimulado } from "./modules/recarga/gateway.js";
import { criarRepositorioRecargaPrisma } from "./modules/recarga/repositorio.js";
import { criarServicoQr } from "./modules/acesso/qrToken.js";
import { criarRepositorioPrisma } from "./modules/cardapio/repositorio.js";
import { criarRepositorioHistoricoPrisma } from "./modules/historico/repositorio.js";
import { criarRepositorioIdentidadePrisma } from "./modules/identidade/repositorio.js";

// Provedor de pagamento: no MVP só o simulado (provedor real fica fora do MVP; entraria no mesmo contrato).
const segredoWebhook = process.env.PAGAMENTO_WEBHOOK_SEGREDO ?? (process.env.NODE_ENV === "production" ? undefined : "segredo-de-desenvolvimento");
if (!segredoWebhook) throw new Error("Defina PAGAMENTO_WEBHOOK_SEGREDO para rodar em produção.");

// Segredo que assina o QR Code (HU-06): obrigatório em produção; em desenvolvimento há um padrão.
const segredoQr = process.env.QR_SEGREDO ?? (process.env.NODE_ENV === "production" ? undefined : "segredo-do-qr-so-para-desenvolvimento");
if (!segredoQr) throw new Error("Defina QR_SEGREDO (mínimo 32 caracteres) para rodar em produção.");

const identificar = identificadorDev();
const app = await buildApp({
  cardapioRepo: criarRepositorioPrisma(prisma),
  historicoRepo: criarRepositorioHistoricoPrisma(prisma),
  identidade: { repo: criarRepositorioIdentidadePrisma(prisma) },
  mestre: { contasRepo: criarRepositorioContasPrisma(prisma), logsRepo: criarRepositorioLogsPrisma(prisma) },
  vinculo: {
    repo: criarRepositorioVinculoPrisma(prisma),
    armazenamento: criarArmazenamentoEmDisco(process.env.ARMAZENAMENTO_DIR ?? "armazenamento-privado"),
  },
  cadastrosRepo: criarRepositorioCadastrosPrisma(prisma),
  carteiraRepo: criarRepositorioCarteiraPrisma(prisma),
  recarga: {
    repo: criarRepositorioRecargaPrisma(prisma),
    gateway: criarGatewaySimulado(segredoWebhook),
    // Fora de produção sempre; em produção só com PAGAMENTO_SIMULACAO_DEMO=true (ambiente de demonstração).
    simulacao: simulacaoHabilitada(process.env),
  },
  qr: criarServicoQr({ segredo: segredoQr }),
  identificar,
  logger: true,
});
if (identificar) {
  app.log.warn(`Modo desenvolvimento: usuário fixo ${process.env.DEV_USUARIO}. O login real fica ignorado.`);
}
if (simulacaoDemoEmProducao(process.env)) {
  app.log.warn(
    "MODO DEMONSTRAÇÃO: o pagamento simulado está LIGADO em produção. Qualquer conta aprovada pode creditar saldo de mentira. Nunca use com dinheiro real.",
  );
}
await app.listen({ port: Number(process.env.PORT ?? 3000), host: "0.0.0.0" });
