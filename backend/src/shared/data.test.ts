import { describe, expect, it } from "vitest";
import { hojeNoBrasil } from "./data.js";

describe("hojeNoBrasil", () => {
  it("usa o fuso de São Paulo, não o do servidor (UTC)", () => {
    // 02:00 UTC de 11/11 ainda é 23:00 de 10/11 no Brasil.
    expect(hojeNoBrasil(new Date("2026-11-11T02:00:00Z"))).toBe("2026-11-10");
  });

  it("vira o dia às 03:00 UTC (meia-noite em Brasília)", () => {
    expect(hojeNoBrasil(new Date("2026-11-11T02:59:59Z"))).toBe("2026-11-10");
    expect(hojeNoBrasil(new Date("2026-11-11T03:00:00Z"))).toBe("2026-11-11");
  });

  it("completa zeros à esquerda e atravessa a virada de ano", () => {
    expect(hojeNoBrasil(new Date("2027-01-01T02:00:00Z"))).toBe("2026-12-31");
    expect(hojeNoBrasil(new Date("2026-03-05T12:00:00Z"))).toBe("2026-03-05");
  });
});
