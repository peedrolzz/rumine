import { describe, expect, it } from "vitest";
import { aplicarMascara, hoje, hojeIso, paraIso } from "./data";

describe("aplicarMascara", () => {
  it.each([
    ["", ""],
    ["1", "1"],
    ["10", "10"],
    ["101", "10/1"],
    ["1011", "10/11"],
    ["10112", "10/11/2"],
    ["10112026", "10/11/2026"],
  ])("digitando %j vira %j", (entrada, esperado) => {
    expect(aplicarMascara(entrada)).toBe(esperado);
  });

  it("ignora letras e símbolos", () => {
    expect(aplicarMascara("ab1c0-1.1x2026")).toBe("10/11/2026");
  });

  it("limita a 8 dígitos", () => {
    expect(aplicarMascara("101120261234")).toBe("10/11/2026");
  });

  it("é estável: aplicar de novo sobre o resultado não muda nada", () => {
    for (const t of ["", "10", "10/1", "10/11", "10/11/2", "10/11/2026"]) {
      expect(aplicarMascara(aplicarMascara(t))).toBe(aplicarMascara(t));
    }
  });

  it("apagar uma barra com Backspace volta ao texto anterior sem travar", () => {
    // "10/" + Backspace chega como "10": a máscara não pode readicionar a barra.
    expect(aplicarMascara("10")).toBe("10");
    expect(aplicarMascara("10/11/")).toBe("10/11");
  });
});

describe("paraIso", () => {
  it("converte dd/mm/aaaa em aaaa-mm-dd", () => {
    expect(paraIso("10/11/2026")).toBe("2026-11-10");
    expect(paraIso("01/01/2027")).toBe("2027-01-01");
  });

  it.each(["", "10", "10/11", "10/11/26", "10/11/20266", "1/1/2026", "2026-11-10", "ab/cd/efgh", " 10/11/2026"])(
    "devolve null para texto incompleto ou fora do formato: %j",
    (texto) => {
      expect(paraIso(texto)).toBeNull();
    },
  );

  it.each(["31/02/2026", "29/02/2027", "00/10/2026", "32/01/2026", "10/00/2026", "10/13/2026", "31/04/2026"])(
    "devolve null para data que não existe: %s",
    (texto) => {
      expect(paraIso(texto)).toBeNull();
    },
  );

  it("aceita 29/02 só em ano bissexto", () => {
    expect(paraIso("29/02/2028")).toBe("2028-02-29");
    expect(paraIso("29/02/2100")).toBeNull(); // 2100 não é bissexto
  });

  it("ano com menos de 4 dígitos significativos não vira 19xx (armadilha do Date)", () => {
    expect(paraIso("01/01/0050")).toBeNull();
    expect(paraIso("01/01/0000")).toBeNull();
  });
});

describe("hoje e hojeIso", () => {
  const dia = new Date(2026, 2, 5, 23, 59); // 05/03/2026, horário local

  it("formata com zeros à esquerda", () => {
    expect(hoje(dia)).toBe("05/03/2026");
    expect(hojeIso(dia)).toBe("2026-03-05");
  });

  it("um é a conversão do outro", () => {
    expect(paraIso(hoje(dia))).toBe(hojeIso(dia));
  });

  it("comparar datas em aaaa-mm-dd como texto equivale à ordem cronológica", () => {
    const passada = paraIso("04/03/2026")!;
    const futura = paraIso("06/03/2026")!;
    expect(passada < hojeIso(dia)).toBe(true);
    expect(hojeIso(dia) < hojeIso(dia)).toBe(false); // hoje não é "passada"
    expect(futura < hojeIso(dia)).toBe(false);
    // virada de mês e de ano
    expect(paraIso("31/12/2026")! < paraIso("01/01/2027")!).toBe(true);
    expect(paraIso("30/11/2026")! < paraIso("01/12/2026")!).toBe(true);
  });
});
