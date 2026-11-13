import { describe, expect, it } from "vitest";
import { CAMPOS_CARDAPIO } from "../cardapio/esquemas.js";
import { esquemaNovaConta } from "../mestre/contas.js";
import { primeiraRegraQuebrada } from "../identidade/esquemas.js";
import {
  CARDAPIO_DEMO,
  CONTAS_DEMO,
  DECLARACAO_DEMO,
  MOVIMENTOS_DEMO,
  SALDO_FINAL_DEMO_CENTAVOS,
  SENHA_DEMO_PADRAO,
  demonstracaoPermitida,
} from "./contas.js";
import { detectarTipo } from "../vinculo/arquivo.js";

describe("trava das contas de demonstração", () => {
  it.each([
    [{}, true],
    [{ NODE_ENV: "development" }, true],
    [{ NODE_ENV: "production" }, false],
    [{ NODE_ENV: "production", PAGAMENTO_SIMULACAO_DEMO: "false" }, false],
    [{ NODE_ENV: "production", PAGAMENTO_SIMULACAO_DEMO: "TRUE" }, false],
    [{ NODE_ENV: "production", PAGAMENTO_SIMULACAO_DEMO: "true" }, true],
  ])("%j → %s", (env, esperado) => {
    expect(demonstracaoPermitida(env)).toBe(esperado);
  });
});

describe("dados de demonstração", () => {
  it("a senha padrão cumpre as regras do sistema", () => {
    expect(primeiraRegraQuebrada(SENHA_DEMO_PADRAO)).toBeUndefined();
  });

  it("e-mails e RAs são únicos, e há um de cada perfil", () => {
    const emails = CONTAS_DEMO.map((c) => c.email);
    expect(new Set(emails).size).toBe(emails.length);
    const ras = CONTAS_DEMO.flatMap((c) => (c.identificador ? [c.identificador] : []));
    expect(new Set(ras).size).toBe(ras.length);
    expect(CONTAS_DEMO.map((c) => c.perfil).sort()).toEqual(["ADMIN", "MESTRE", "OPERADOR", "USUARIO", "USUARIO"]);
  });

  it("alunos têm e-mail do domínio de discentes, RA e categoria DISCENTE; internos são SERVIDOR", () => {
    for (const c of CONTAS_DEMO) {
      if (c.perfil === "USUARIO") {
        expect(c.email.endsWith("@alunos.utfpr.edu.br")).toBe(true);
        expect(c.identificador).toMatch(/^a\d{7}$/);
        expect(c.categoria).toBe("DISCENTE");
      } else {
        expect(c.categoria).toBe("SERVIDOR");
        expect(c.status).toBe("ATIVO");
      }
    }
  });

  it("um aluno aprovado (para o QR) e um em análise (para o Admin)", () => {
    const alunos = CONTAS_DEMO.filter((c) => c.perfil === "USUARIO").map((c) => c.status);
    expect(alunos.sort()).toEqual(["ATIVO", "PENDENTE_APROVACAO"]);
  });

  it("contas internas passam pela mesma validação da criação pelo Mestre", () => {
    for (const c of CONTAS_DEMO.filter((c) => c.perfil === "ADMIN" || c.perfil === "OPERADOR")) {
      expect(esquemaNovaConta.safeParse({ nome: c.nome, email: c.email, senha: SENHA_DEMO_PADRAO, perfil: c.perfil }).success).toBe(true);
    }
  });

  it("o saldo final é a soma dos movimentos e nunca fica negativo no meio do caminho", () => {
    let saldo = 0;
    for (const m of MOVIMENTOS_DEMO) {
      saldo += m.tipo === "RECARGA" ? m.valorCentavos : -m.valorCentavos;
      expect(saldo).toBeGreaterThanOrEqual(0);
    }
    expect(saldo).toBe(SALDO_FINAL_DEMO_CENTAVOS);
    expect(SALDO_FINAL_DEMO_CENTAVOS).toBe(5300);
  });

  it("o cardápio de exemplo cobre exatamente as categorias da tela do Admin", () => {
    expect(CARDAPIO_DEMO.map((i) => i.categoria)).toEqual(CAMPOS_CARDAPIO.map((c) => c.categoria));
    expect(CARDAPIO_DEMO.every((i) => i.descricao.length > 0)).toBe(true);
  });

  it("a declaração de exemplo é reconhecida como PDF pelo mesmo detector do upload", () => {
    expect(detectarTipo(DECLARACAO_DEMO)?.mime).toBe("application/pdf");
  });
});
