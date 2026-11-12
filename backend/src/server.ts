import "dotenv/config";
import { buildApp } from "./app.js";
import { prisma } from "./shared/prisma.js";
import { identificadorDev } from "./shared/usuariosDev.js";
import { criarRepositorioLogsPrisma } from "./modules/auditoria/consulta.js";
import { criarRepositorioContasPrisma } from "./modules/mestre/contas.js";
import { criarRepositorioPrisma } from "./modules/cardapio/repositorio.js";
import { criarRepositorioHistoricoPrisma } from "./modules/historico/repositorio.js";
import { criarRepositorioIdentidadePrisma } from "./modules/identidade/repositorio.js";

const identificar = identificadorDev();
const app = await buildApp({
  cardapioRepo: criarRepositorioPrisma(prisma),
  historicoRepo: criarRepositorioHistoricoPrisma(prisma),
  identidade: { repo: criarRepositorioIdentidadePrisma(prisma) },
  mestre: { contasRepo: criarRepositorioContasPrisma(prisma), logsRepo: criarRepositorioLogsPrisma(prisma) },
  identificar,
  logger: true,
});
if (identificar) {
  app.log.warn(`Modo desenvolvimento: usuário fixo ${process.env.DEV_USUARIO}. O login real fica ignorado.`);
}
await app.listen({ port: Number(process.env.PORT ?? 3000), host: "0.0.0.0" });
