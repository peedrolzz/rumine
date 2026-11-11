import { describe, expect, it } from "vitest";
import { criarLimitador } from "./limitador.js";

const JANELA = 15 * 60_000;

function comRelogio(opcoes: { max?: number } = {}) {
  let t = 1_000_000;
  const limitador = criarLimitador({ ...opcoes, janelaMs: JANELA, agora: () => t });
  return { limitador, avancar: (ms: number) => (t += ms) };
}

describe("limitador de tentativas", () => {
  it("bloqueia só na 5ª falha (4 ainda passam)", () => {
    const { limitador } = comRelogio();
    for (let i = 0; i < 4; i++) limitador.registrarFalha("a");
    expect(limitador.bloqueado("a")).toBe(false);
    limitador.registrarFalha("a");
    expect(limitador.bloqueado("a")).toBe(true);
  });

  it("respeita o máximo configurado", () => {
    const { limitador } = comRelogio({ max: 2 });
    limitador.registrarFalha("a");
    expect(limitador.bloqueado("a")).toBe(false);
    limitador.registrarFalha("a");
    expect(limitador.bloqueado("a")).toBe(true);
  });

  it("libera depois da janela de 15 minutos", () => {
    const { limitador, avancar } = comRelogio();
    for (let i = 0; i < 5; i++) limitador.registrarFalha("a");
    avancar(JANELA - 1);
    expect(limitador.bloqueado("a")).toBe(true);
    avancar(1);
    expect(limitador.bloqueado("a")).toBe(false);
  });

  it("a janela é deslizante: falhas antigas saem uma a uma", () => {
    const { limitador, avancar } = comRelogio();
    for (let i = 0; i < 3; i++) limitador.registrarFalha("a");
    avancar(JANELA - 10);
    for (let i = 0; i < 2; i++) limitador.registrarFalha("a"); // 5 dentro da janela: bloqueia
    expect(limitador.bloqueado("a")).toBe(true);
    avancar(11); // as 3 primeiras saem; sobram 2
    expect(limitador.bloqueado("a")).toBe(false);
  });

  it("chaves diferentes não se afetam", () => {
    const { limitador } = comRelogio();
    for (let i = 0; i < 5; i++) limitador.registrarFalha("ip1|a@x");
    expect(limitador.bloqueado("ip1|a@x")).toBe(true);
    expect(limitador.bloqueado("ip2|a@x")).toBe(false);
    expect(limitador.bloqueado("ip1|b@x")).toBe(false);
  });

  it("limpar zera a contagem (login bem-sucedido)", () => {
    const { limitador } = comRelogio();
    for (let i = 0; i < 4; i++) limitador.registrarFalha("a");
    limitador.limpar("a");
    for (let i = 0; i < 4; i++) limitador.registrarFalha("a");
    expect(limitador.bloqueado("a")).toBe(false);
  });

  it("limpar uma chave que não existe não dá erro", () => {
    const { limitador } = comRelogio();
    expect(() => limitador.limpar("nunca-vista")).not.toThrow();
    expect(limitador.bloqueado("nunca-vista")).toBe(false);
  });

  it("não cresce sem limite sob ataque com chaves diferentes (faxina dos vencidos)", () => {
    const { limitador, avancar } = comRelogio();
    for (let i = 0; i < 10_001; i++) limitador.registrarFalha(`ip-${i}`);
    avancar(JANELA + 1); // todas vencem
    limitador.registrarFalha("nova"); // dispara a faxina
    // depois da faxina, as antigas já não bloqueiam nem ocupam espaço
    expect(limitador.bloqueado("ip-0")).toBe(false);
    expect(limitador.bloqueado("nova")).toBe(false);
  });
});
