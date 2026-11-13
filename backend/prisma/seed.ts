// Dados mínimos de desenvolvimento: câmpus do MVP e usuários fixos (um por perfil).
import { prisma } from "../src/shared/prisma.js";
import { USUARIOS_DEV } from "../src/shared/usuariosDev.js";
import type { PerfilUsuario } from "../generated/prisma/enums.js";

const campusSeed = await prisma.campus.upsert({
  where: { nome: "Dois Vizinhos" },
  create: { nome: "Dois Vizinhos" },
  update: {},
});
// Preço da refeição do estudante (HU-08): sem ele a leitura do QR responde "preço não configurado".
const temPreco = await prisma.precoRefeicao.findFirst({ where: { campusId: campusSeed.id, categoriaPreco: "ESTUDANTE" } });
if (!temPreco) {
  await prisma.precoRefeicao.create({
    data: { campusId: campusSeed.id, categoriaPreco: "ESTUDANTE", valorCentavos: 350, vigenteDesde: new Date("2026-01-01T00:00:00.000Z") },
  });
}

const NOMES_DEV: Record<PerfilUsuario, string> = {
  ADMIN: "Admin Dev",
  OPERADOR: "Operador Dev",
  USUARIO: "Usuário Dev",
  MESTRE: "Mestre Dev",
};

for (const [perfil, id] of Object.entries(USUARIOS_DEV) as [PerfilUsuario, string][]) {
  await prisma.usuario.upsert({
    where: { id },
    create: {
      id,
      nome: NOMES_DEV[perfil],
      email: `${perfil.toLowerCase()}@dev.local`,
      senhaHash: "sem-login-dev", // não é um hash válido: ninguém consegue logar com ele
      perfil,
      categoria: "DISCENTE",
      status: "ATIVO",
    },
    update: { nome: NOMES_DEV[perfil] }, // preenche o nome de usuários criados antes da coluna existir
  });
}
// Movimentos de exemplo para o usuário de desenvolvimento (testar o histórico, HU-09, sem as HUs de
// recarga e débito). Só roda se ele ainda não tiver movimentos. Inclui refeições PAE (sem transação)
// e dois eventos no mesmo instante, para exercitar a paginação.
const usuarioId = USUARIOS_DEV.USUARIO;
const campus = await prisma.campus.findUniqueOrThrow({ where: { nome: "Dois Vizinhos" } });
const carteira = await prisma.carteira.upsert({
  where: { usuarioId },
  create: { usuarioId, saldoCentavos: 0 },
  update: {},
});
const jaTemMovimentos =
  (await prisma.transacao.count({ where: { carteiraId: carteira.id } })) +
    (await prisma.consumo.count({ where: { usuarioId } })) >
  0;

if (!jaTemMovimentos) {
  const TOTAL = 45;
  const refeicao = 350;
  const agora = Date.now();
  let saldo = 0;
  let debitos = 0;

  for (let i = 0; i < TOTAL; i++) {
    // do mais antigo (i = 0) para o mais novo; os dois últimos eventos ocorrem no mesmo instante
    const quando = new Date(agora - (TOTAL - Math.min(i, TOTAL - 2)) * 3 * 3_600_000);
    const tipo =
      saldo < refeicao || i % 9 === 0 ? "RECARGA" : debitos > 0 && i % 11 === 5 ? "ESTORNO" : i % 8 === 3 ? "PAE" : "DEBITO";

    if (tipo === "PAE") {
      const leitura = await prisma.leituraAcesso.create({
        data: { usuarioId, operadorId: USUARIOS_DEV.OPERADOR, campusId: campus.id, tokenJti: `seed-${i}`, resultado: "LIBERADO", lidaEm: quando },
      });
      await prisma.consumo.create({
        data: { leituraId: leitura.id, usuarioId, valorCobradoCentavos: 0, categoriaPreco: "PAE", envioUtfpr: "PENDENTE", consumidoEm: quando },
      });
      continue;
    }

    const valor = tipo === "RECARGA" ? (i % 2 === 0 ? 2000 : 5000) : refeicao;
    saldo += tipo === "DEBITO" ? -valor : valor;
    if (tipo === "DEBITO") debitos++;
    const transacao = await prisma.transacao.create({
      data: {
        carteiraId: carteira.id,
        tipo: tipo === "DEBITO" ? "DEBITO_REFEICAO" : tipo,
        valorCentavos: valor,
        saldoAposCentavos: saldo,
        criadaEm: quando,
      },
    });
    if (tipo === "DEBITO") {
      // refeição paga: o consumo fica ligado à transação (e não deve aparecer em duplicidade no histórico)
      const leitura = await prisma.leituraAcesso.create({
        data: { usuarioId, operadorId: USUARIOS_DEV.OPERADOR, campusId: campus.id, tokenJti: `seed-${i}`, resultado: "LIBERADO", lidaEm: quando },
      });
      await prisma.consumo.create({
        data: { leituraId: leitura.id, usuarioId, valorCobradoCentavos: valor, categoriaPreco: "ESTUDANTE", transacaoId: transacao.id, envioUtfpr: "PENDENTE", consumidoEm: quando },
      });
    }
  }
  await prisma.carteira.update({ where: { id: carteira.id }, data: { saldoCentavos: saldo } });
  console.log(`Movimentos de exemplo criados para o usuário de desenvolvimento (saldo R$ ${(saldo / 100).toFixed(2)}).`);
}

console.log("Seed concluído.");
await prisma.$disconnect();
