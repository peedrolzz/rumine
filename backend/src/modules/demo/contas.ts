import type { CategoriaUsuario, PerfilUsuario, StatusUsuario } from "../../../generated/prisma/enums.js";
import { simulacaoHabilitada } from "../recarga/config.js";

/** Senha padrão das contas de demonstração (pode ser trocada com DEMO_SENHA). É conhecida: só para ambiente de demo. */
export const SENHA_DEMO_PADRAO = "Demo@2026";

export type ContaDemo = {
  chave: "mestre" | "admin" | "operador" | "aluno" | "alunoPendente";
  nome: string;
  email: string;
  perfil: PerfilUsuario;
  categoria: CategoriaUsuario;
  status: StatusUsuario;
  /** RA do aluno (o do aluno pendente entra junto com a declaração). */
  identificador?: string;
  descricao: string;
};

export const CONTAS_DEMO: readonly ContaDemo[] = [
  {
    chave: "mestre",
    nome: "Mestre Demonstração",
    email: "mestre.demo@rumine.demo",
    perfil: "MESTRE",
    categoria: "SERVIDOR",
    status: "ATIVO",
    descricao: "Cria Admin e Operador e consulta os logs de auditoria.",
  },
  {
    chave: "admin",
    nome: "Admin Demonstração",
    email: "admin.demo@rumine.demo",
    perfil: "ADMIN",
    categoria: "SERVIDOR",
    status: "ATIVO",
    descricao: "Publica o cardápio e aprova ou rejeita cadastros.",
  },
  {
    chave: "operador",
    nome: "Operador Demonstração",
    email: "operador.demo@rumine.demo",
    perfil: "OPERADOR",
    categoria: "SERVIDOR",
    status: "ATIVO",
    descricao: "Lê o QR Code do aluno na entrada do RU.",
  },
  {
    chave: "aluno",
    nome: "Aluno Demonstração",
    email: "aluno.demo@alunos.utfpr.edu.br",
    perfil: "USUARIO",
    categoria: "DISCENTE",
    status: "ATIVO",
    identificador: "a1000001",
    descricao: "Cadastro aprovado, com saldo e histórico: mostra o QR Code, recarrega e consulta o histórico.",
  },
  {
    chave: "alunoPendente",
    nome: "Aluno Em Análise",
    email: "pendente.demo@alunos.utfpr.edu.br",
    perfil: "USUARIO",
    categoria: "DISCENTE",
    status: "PENDENTE_APROVACAO",
    identificador: "a1000002",
    descricao: "Declaração já enviada: o Admin aprova ou rejeita em Cadastros.",
  },
];

/** Valores da carga do aluno aprovado: recargas e refeições, em centavos (saldo final R$ 53,00). */
export const MOVIMENTOS_DEMO = [
  { tipo: "RECARGA", valorCentavos: 4000, horasAtras: 72 },
  { tipo: "RECARGA", valorCentavos: 2000, horasAtras: 48 },
  { tipo: "DEBITO_REFEICAO", valorCentavos: 350, horasAtras: 30 },
  { tipo: "DEBITO_REFEICAO", valorCentavos: 350, horasAtras: 6 },
] as const;

export const SALDO_FINAL_DEMO_CENTAVOS = MOVIMENTOS_DEMO.reduce(
  (saldo, m) => (m.tipo === "RECARGA" ? saldo + m.valorCentavos : saldo - m.valorCentavos),
  0,
);

/** Cardápio de exemplo, na mesma ordem e com as mesmas categorias da tela do Admin. */
export const CARDAPIO_DEMO: readonly { categoria: string; descricao: string }[] = [
  { categoria: "Proteína animal", descricao: "Frango grelhado" },
  { categoria: "Proteína vegetariana", descricao: "Hambúrguer de grão-de-bico" },
  { categoria: "Carboidrato 1", descricao: "Arroz branco" },
  { categoria: "Carboidrato 2", descricao: "Feijão carioca" },
  { categoria: "Carboidrato 3", descricao: "Purê de batata" },
  { categoria: "Salada 1", descricao: "Alface e tomate" },
  { categoria: "Salada 2", descricao: "Cenoura ralada" },
  { categoria: "Sobremesa", descricao: "Gelatina" },
  { categoria: "Suco", descricao: "Suco de laranja" },
];

/**
 * As contas de demonstração têm senha CONHECIDA: só podem ser criadas fora de produção ou no
 * ambiente de demonstração publicado (o mesmo interruptor da recarga simulada).
 */
export function demonstracaoPermitida(env: Record<string, string | undefined>): boolean {
  return simulacaoHabilitada(env);
}

/** Um PDF mínimo e inofensivo, usado como a declaração de vínculo de exemplo. */
export const DECLARACAO_DEMO = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  "latin1",
);
