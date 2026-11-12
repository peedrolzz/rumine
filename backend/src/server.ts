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
import { criarRepositorioPrisma } from "./modules/cardapio/repositorio.js";
import { criarRepositorioHistoricoPrisma } from "./modules/historico/repositorio.js";
import { criarRepositorioIdentidadePrisma } from "./modules/identidade/repositorio.js";

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
  identificar,
  logger: true,
});
if (identificar) {
  app.log.warn(`Modo desenvolvimento: usuário fixo ${process.env.DEV_USUARIO}. O login real fica ignorado.`);
}
await app.listen({ port: Number(process.env.PORT ?? 3000), host: "0.0.0.0" });
