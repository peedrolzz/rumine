import { describe, expect, it } from "vitest";
import { formatarReais } from "./moeda";

describe("formatarReais", () => {
  it.each([
    [0, "R$ 0,00"],
    [1, "R$ 0,01"],
    [9, "R$ 0,09"],
    [10, "R$ 0,10"],
    [99, "R$ 0,99"],
    [100, "R$ 1,00"],
    [350, "R$ 3,50"],
    [2000, "R$ 20,00"],
    [99999, "R$ 999,99"],
    [100000, "R$ 1.000,00"],
    [123450, "R$ 1.234,50"],
    [100000000, "R$ 1.000.000,00"],
    [123456789, "R$ 1.234.567,89"],
  ])("%i centavos = %s", (centavos, esperado) => {
    expect(formatarReais(centavos)).toBe(esperado);
  });

  it("valor negativo leva o sinal na frente", () => {
    expect(formatarReais(-350)).toBe("-R$ 3,50");
    expect(formatarReais(-123450)).toBe("-R$ 1.234,50");
  });

  it("zero negativo não vira '-R$ 0,00'", () => {
    expect(formatarReais(-0)).toBe("R$ 0,00");
  });

  it("arredonda centavos fracionados em vez de mostrar casas a mais", () => {
    expect(formatarReais(349.6)).toBe("R$ 3,50");
  });

  it.each([NaN, Infinity, -Infinity])("valor inválido (%s) vira travessão, nunca 'NaN'", (v) => {
    expect(formatarReais(v)).toBe("—");
  });

  it("usa vírgula nos centavos e ponto no milhar (padrão brasileiro)", () => {
    const s = formatarReais(1234567);
    expect(s).toMatch(/^R\$ \d{1,3}(\.\d{3})*,\d{2}$/);
  });
});
