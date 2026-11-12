// Cria o primeiro usuário Mestre (HU-03). Uso, em backend/:
//   npm run criar-mestre -- "Nome Completo" email@exemplo.com
// A senha é pedida no terminal (não aparece na tela). Para automação, use a variável MESTRE_SENHA.
// Depois, o Mestre cria os Admins e Operadores pelo próprio app.
import "dotenv/config";
import { prisma } from "../src/shared/prisma.js";
import {
  EMAIL_JA_CADASTRADO,
  MESTRE_JA_EXISTE,
  criarPrimeiroMestre,
  criarRepositorioContasPrisma,
  esquemaPrimeiroMestre,
} from "../src/modules/mestre/contas.js";
import { hasherArgon2 } from "../src/modules/identidade/senha.js";

function lerSenhaOculta(pergunta: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const entrada = process.stdin;
    if (!entrada.isTTY) return reject(new Error("Sem terminal interativo. Defina a variável MESTRE_SENHA."));
    process.stdout.write(pergunta);
    entrada.setRawMode(true);
    entrada.resume();
    entrada.setEncoding("utf8");
    let texto = "";
    const aoTeclar = (tecla: string) => {
      for (const c of tecla) {
        if (c === "\u0003") { // Ctrl+C
          entrada.setRawMode(false);
          return reject(new Error("Cancelado."));
        }
        if (c === "\r" || c === "\n") {
          entrada.setRawMode(false);
          entrada.pause();
          entrada.removeListener("data", aoTeclar);
          process.stdout.write("\n");
          return resolve(texto);
        }
        if (c === "\u007f" || c === "\b") texto = texto.slice(0, -1);
        else texto += c;
      }
    };
    entrada.on("data", aoTeclar);
  });
}

async function principal() {
  const [nome, email] = process.argv.slice(2);
  if (!nome || !email) {
    console.error('Uso: npm run criar-mestre -- "Nome Completo" email@exemplo.com');
    return 1;
  }
  const senha = process.env.MESTRE_SENHA ?? (await lerSenhaOculta("Senha do Mestre: "));

  const dados = esquemaPrimeiroMestre.safeParse({ nome, email, senha });
  if (!dados.success) {
    console.error(dados.error.issues[0]?.message ?? "Dados inválidos.");
    return 1;
  }

  const resultado = await criarPrimeiroMestre(criarRepositorioContasPrisma(prisma), hasherArgon2, dados.data);
  if (resultado === MESTRE_JA_EXISTE) {
    console.error("Já existe um Mestre. Peça a ele para criar novos usuários pelo app.");
    return 1;
  }
  if (resultado === EMAIL_JA_CADASTRADO) {
    console.error("Já existe uma conta com este e-mail.");
    return 1;
  }
  console.log(`Mestre criado: ${resultado.nome} <${resultado.email}>. Entre pelo login do app.`);
  return 0;
}

principal()
  .then((codigo) => { process.exitCode = codigo; })
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
