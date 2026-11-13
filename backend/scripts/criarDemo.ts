// Cria as contas e os dados de DEMONSTRAÇÃO (para quem vai avaliar o sistema). Uso, em backend/:
//   npm run criar-demo
// Idempotente: o que já existe não é recriado nem alterado. As contas têm senha CONHECIDA, então
// o script só roda fora de produção ou no ambiente de demonstração (PAGAMENTO_SIMULACAO_DEMO=true).
// Rode no mesmo servidor/disco da API: a declaração do aluno em análise fica no armazenamento privado.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/shared/prisma.js";
import { criarArmazenamentoEmDisco } from "../src/shared/armazenamento.js";
import { hojeNoBrasil } from "../src/shared/data.js";
import { hasherArgon2 } from "../src/modules/identidade/senha.js";
import { primeiraRegraQuebrada } from "../src/modules/identidade/esquemas.js";
import { garantirArquivoDeclaracao } from "../src/modules/demo/reparo.js";
import {
  CARDAPIO_DEMO,
  CONTAS_DEMO,
  DECLARACAO_DEMO,
  MOVIMENTOS_DEMO,
  SENHA_DEMO_PADRAO,
  demonstracaoPermitida,
  type ContaDemo,
} from "../src/modules/demo/contas.js";

async function principal() {
  if (!demonstracaoPermitida(process.env)) {
    console.error(
      "Recusado: estas contas têm senha conhecida e este ambiente é de PRODUÇÃO. " +
        "Só rode em desenvolvimento ou com PAGAMENTO_SIMULACAO_DEMO=true (ambiente de demonstração).",
    );
    return 1;
  }
  const senha = process.env.DEMO_SENHA ?? SENHA_DEMO_PADRAO;
  const regra = primeiraRegraQuebrada(senha);
  if (regra) {
    console.error(`DEMO_SENHA inválida. ${regra}`);
    return 1;
  }
  const senhaHash = await hasherArgon2.hash(senha);
  const armazenamento = criarArmazenamentoEmDisco(process.env.ARMAZENAMENTO_DIR ?? "armazenamento-privado");

  const campus = await prisma.campus.upsert({ where: { nome: "Dois Vizinhos" }, create: { nome: "Dois Vizinhos" }, update: {} });
  const situacao: string[] = [];

// Preço da refeição do estudante: sem ele a leitura do QR responde "preço não configurado".
const temPreco = await prisma.precoRefeicao.findFirst({ where: { campusId: campus.id, categoriaPreco: "ESTUDANTE" } });
if (!temPreco) {
  await prisma.precoRefeicao.create({
    data: { campusId: campus.id, categoriaPreco: "ESTUDANTE", valorCentavos: 350, vigenteDesde: new Date("2026-01-01T00:00:00.000Z") },
  });
}
situacao.push("preço da refeição (estudante): R$ 3,50");

  // Contas: cria só as que faltam (nunca mexe em senha ou dados de uma conta existente).
  const ids = new Map<ContaDemo["chave"], string>();
  for (const conta of CONTAS_DEMO) {
    const existente = await prisma.usuario.findUnique({ where: { email: conta.email }, select: { id: true } });
    if (existente) {
      ids.set(conta.chave, existente.id);
      situacao.push(`${conta.email}: já existia`);
      if (conta.chave === "alunoPendente") {
        // App recriado com volume novo: o banco lembra da declaração, mas o arquivo sumiu. Recoloca.
        const declaracao = await prisma.declaracao.findFirst({
          where: { usuarioId: existente.id, usuario: { status: "PENDENTE_APROVACAO" } },
          orderBy: { enviadaEm: "desc" },
          select: { arquivoChave: true },
        });
        if (declaracao && (await garantirArquivoDeclaracao(armazenamento, declaracao.arquivoChave, DECLARACAO_DEMO))) {
          situacao.push("declaração do aluno em análise: arquivo recolocado");
        }
      }
      continue;
    }
    const criada = await prisma.usuario.create({
      data: {
        nome: conta.nome,
        email: conta.email,
        senhaHash,
        perfil: conta.perfil,
        categoria: conta.categoria,
        status: conta.status,
        ...(conta.identificador && { identificador: conta.identificador }),
      },
      select: { id: true },
    });
    ids.set(conta.chave, criada.id);
    situacao.push(`${conta.email}: criada`);

    if (conta.chave === "alunoPendente") {
      // Declaração enviada, esperando o Admin (o arquivo vai para o armazenamento privado).
      const chave = randomUUID();
      await armazenamento.salvar(chave, DECLARACAO_DEMO);
      await prisma.declaracao.create({
        data: { usuarioId: criada.id, arquivoChave: chave, mime: "application/pdf", tamanhoBytes: DECLARACAO_DEMO.length },
      });
    }
    if (conta.chave === "aluno") {
      await prisma.carteira.upsert({ where: { usuarioId: criada.id }, create: { usuarioId: criada.id, saldoCentavos: 0 }, update: {} });
    }
  }

  // Histórico do aluno aprovado: só se a carteira ainda não tem movimentos.
  const alunoId = ids.get("aluno")!;
  const operadorId = ids.get("operador")!;
  const carteira = await prisma.carteira.upsert({ where: { usuarioId: alunoId }, create: { usuarioId: alunoId, saldoCentavos: 0 }, update: {} });
  if ((await prisma.transacao.count({ where: { carteiraId: carteira.id } })) === 0) {
    let saldo = 0;
    const agora = Date.now();
    for (const [i, m] of MOVIMENTOS_DEMO.entries()) {
      const quando = new Date(agora - m.horasAtras * 3_600_000);
      saldo += m.tipo === "RECARGA" ? m.valorCentavos : -m.valorCentavos;
      const transacao = await prisma.transacao.create({
        data: { carteiraId: carteira.id, tipo: m.tipo, valorCentavos: m.valorCentavos, saldoAposCentavos: saldo, criadaEm: quando },
      });
      if (m.tipo === "DEBITO_REFEICAO") {
        const leitura = await prisma.leituraAcesso.create({
          data: { usuarioId: alunoId, operadorId, campusId: campus.id, tokenJti: `demo-${i}`, resultado: "LIBERADO", lidaEm: quando },
        });
        await prisma.consumo.create({
          data: {
            leituraId: leitura.id,
            usuarioId: alunoId,
            valorCobradoCentavos: m.valorCentavos,
            categoriaPreco: "ESTUDANTE",
            transacaoId: transacao.id,
            envioUtfpr: "PENDENTE",
            consumidoEm: quando,
          },
        });
      }
    }
    await prisma.carteira.update({ where: { id: carteira.id }, data: { saldoCentavos: saldo } });
    situacao.push(`histórico do aluno: criado (saldo R$ ${(saldo / 100).toFixed(2).replace(".", ",")})`);
  } else {
    situacao.push("histórico do aluno: já existia");
  }

  // Cardápio de hoje: só se ainda não houver um publicado.
  const hoje = new Date(`${hojeNoBrasil()}T00:00:00.000Z`);
  const cardapio = await prisma.cardapio.findUnique({ where: { campusId_data: { campusId: campus.id, data: hoje } }, select: { id: true } });
  if (cardapio) {
    situacao.push("cardápio de hoje: já existia");
  } else {
    await prisma.cardapio.create({
      data: { campusId: campus.id, data: hoje, publicadoPor: ids.get("admin")!, itens: { create: CARDAPIO_DEMO.map((i) => ({ ...i })) } },
    });
    situacao.push("cardápio de hoje: criado");
  }

  console.log("\nContas de demonstração (senha: " + (process.env.DEMO_SENHA ? "a definida em DEMO_SENHA" : senha) + ")\n");
  for (const c of CONTAS_DEMO) console.log(`  ${c.perfil.padEnd(8)} ${c.email.padEnd(36)} ${c.descricao}`);
  console.log("\n" + situacao.map((s) => `  - ${s}`).join("\n"));
  return 0;
}

principal()
  .then((codigo) => { process.exitCode = codigo; })
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
