import { describe, expect, it } from "vitest";
import { aplicarMascara, dentroDoIntervalo, diaDaSemana, formatarDataHora, hoje, hojeIso, paraBr, paraIso, somarDias } from "./data";

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

describe("somarDias", () => {
  it("avança e volta um dia", () => {
    expect(somarDias("2026-11-10", 1)).toBe("2026-11-11");
    expect(somarDias("2026-11-10", -1)).toBe("2026-11-09");
  });

  it("atravessa virada de mês e de ano", () => {
    expect(somarDias("2026-11-30", 1)).toBe("2026-12-01");
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(somarDias("2027-01-01", -1)).toBe("2026-12-31");
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("respeita ano bissexto", () => {
    expect(somarDias("2028-02-28", 1)).toBe("2028-02-29");
    expect(somarDias("2028-02-29", 1)).toBe("2028-03-01");
    expect(somarDias("2027-02-28", 1)).toBe("2027-03-01");
  });

  it("não sofre com mudança de horário de verão", () => {
    // Datas em que o Brasil já teve horário de verão e o EUA/Europa ainda têm.
    expect(somarDias("2026-03-29", 1)).toBe("2026-03-30");
    expect(somarDias("2026-10-25", 1)).toBe("2026-10-26");
    expect(somarDias("2026-11-01", -1)).toBe("2026-10-31");
  });

  it("soma vários dias e zero", () => {
    expect(somarDias("2026-11-10", 0)).toBe("2026-11-10");
    expect(somarDias("2026-11-10", 30)).toBe("2026-12-10");
    expect(somarDias("2026-11-10", -365)).toBe("2025-11-10");
  });
});

describe("paraBr", () => {
  it("inverte para dd/mm/aaaa e é o oposto de paraIso", () => {
    expect(paraBr("2026-11-10")).toBe("10/11/2026");
    expect(paraBr("2026-03-05")).toBe("05/03/2026");
    expect(paraIso(paraBr("2028-02-29"))).toBe("2028-02-29");
  });
});

describe("diaDaSemana", () => {
  it.each([
    ["2026-11-08", "dom"],
    ["2026-11-09", "seg"],
    ["2026-11-10", "ter"],
    ["2026-11-11", "qua"],
    ["2026-11-12", "qui"],
    ["2026-11-13", "sex"],
    ["2026-11-14", "sáb"],
  ])("%s é %s", (iso, esperado) => {
    expect(diaDaSemana(iso)).toBe(esperado);
  });
});

describe("dentroDoIntervalo", () => {
  it("aceita de 2000 a 2100 e recusa fora", () => {
    expect(dentroDoIntervalo("2000-01-01")).toBe(true);
    expect(dentroDoIntervalo("2100-12-31")).toBe(true);
    expect(dentroDoIntervalo("1999-12-31")).toBe(false);
    expect(dentroDoIntervalo("2101-01-01")).toBe(false);
  });

  it("os limites batem com as setas: um dia antes do mínimo e depois do máximo ficam fora", () => {
    expect(dentroDoIntervalo(somarDias("2000-01-01", -1))).toBe(false);
    expect(dentroDoIntervalo(somarDias("2100-12-31", 1))).toBe(false);
  });
});

describe("formatarDataHora", () => {
  it("formata dd/mm/aaaa hh:mm no horário local, com zeros à esquerda", () => {
    expect(formatarDataHora(new Date(2026, 2, 5, 7, 4).toISOString())).toBe("05/03/2026 07:04");
    expect(formatarDataHora(new Date(2026, 10, 10, 23, 59).toISOString())).toBe("10/11/2026 23:59");
  });

  it("meia-noite aparece como 00:00 (e não 24:00)", () => {
    expect(formatarDataHora(new Date(2026, 0, 1, 0, 0).toISOString())).toBe("01/01/2026 00:00");
  });

  it("texto que não é data devolve vazio, sem lançar exceção", () => {
    expect(formatarDataHora("")).toBe("");
    expect(formatarDataHora("ontem")).toBe("");
  });
});
