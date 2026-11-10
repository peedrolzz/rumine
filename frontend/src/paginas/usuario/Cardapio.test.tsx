// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Cardapio from "./Cardapio";
import { criarApiFalsa, type ApiFalsa } from "../../testes/apiFalsa";

const dia = (extra: Partial<Record<string, string>> = {}) => ({
  proteinaAnimal: "Frango grelhado",
  proteinaVegetariana: "Omelete de legumes",
  carboidrato1: "Arroz branco",
  carboidrato2: "Feijão",
  carboidrato3: "Batata cozida",
  salada1: "Alface e tomate",
  salada2: "Cenoura ralada",
  sobremesa: "Banana",
  suco: "Laranja",
  ...extra,
});

let api: ApiFalsa;

beforeEach(() => {
  // Só a data é falsa: "hoje" = 10/11/2026. Os temporizadores reais continuam funcionando.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 10, 12, 0, 0));
  api = criarApiFalsa();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const campoData = () => screen.getByLabelText(/Ir para a data/);
const botao = (nome: string) => screen.getByRole("button", { name: nome }) as HTMLButtonElement;
const digitarData = (valor: string) => fireEvent.change(campoData(), { target: { value: valor } });

describe("Cardápio (usuário) - T14", () => {
  it("abre em hoje, mostra carregando e depois os itens agrupados", async () => {
    api.rota("2026-11-10", { status: 200, corpo: { data: "2026-11-10", ...dia() } });
    render(<Cardapio />);

    expect(screen.getByRole("status", { name: "Carregando cardápio" })).toBeTruthy();
    expect(await screen.findByText("Frango grelhado")).toBeTruthy();
    expect(screen.queryByRole("status", { name: "Carregando cardápio" })).toBeNull();

    for (const titulo of ["Proteínas", "Carboidratos", "Saladas", "Sobremesa e suco"]) {
      expect(screen.getByRole("heading", { name: titulo })).toBeTruthy();
    }
    for (const item of ["Omelete de legumes", "Arroz branco", "Feijão", "Batata cozida", "Alface e tomate", "Cenoura ralada", "Banana", "Laranja"]) {
      expect(screen.getByText(item)).toBeTruthy();
    }
    expect(api.chamadas).toEqual(["2026-11-10"]);
    expect(screen.getByText("ter, 10/11/2026")).toBeTruthy();
    expect(screen.getAllByText("Hoje")).toHaveLength(2); // legenda do dia e botão
  });

  it("sem cardápio hoje: mensagem de que ainda não foi publicado", async () => {
    render(<Cardapio />);
    expect(await screen.findByText(/O cardápio de hoje ainda não foi publicado\./)).toBeTruthy();
    expect(screen.queryByText("Proteínas")).toBeNull();
  });

  it("sem cardápio em outra data: mensagem fala em 'desta data'", async () => {
    render(<Cardapio />);
    await screen.findByText(/de hoje ainda não foi publicado/);
    await userEvent.click(botao("Próximo dia"));
    expect(await screen.findByText(/O cardápio desta data ainda não foi publicado\./)).toBeTruthy();
  });

  it("setas vão para o dia anterior e o próximo e atualizam a legenda", async () => {
    api.rota("2026-11-11", { status: 200, corpo: dia({ proteinaAnimal: "Peixe assado" }) });
    api.rota("2026-11-09", { status: 200, corpo: dia({ proteinaAnimal: "Carne moída" }) });
    render(<Cardapio />);
    await screen.findByText(/de hoje ainda não foi publicado/);

    await userEvent.click(botao("Próximo dia"));
    expect(await screen.findByText("Peixe assado")).toBeTruthy();
    expect(screen.getByText("qua, 11/11/2026")).toBeTruthy();
    expect(screen.getByText("Amanhã")).toBeTruthy();

    await userEvent.click(botao("Dia anterior"));
    await userEvent.click(botao("Dia anterior"));
    expect(await screen.findByText("Carne moída")).toBeTruthy();
    expect(screen.getByText("seg, 09/11/2026")).toBeTruthy();
    expect(screen.getByText("Ontem")).toBeTruthy();
    expect(api.chamadas).toEqual(["2026-11-10", "2026-11-11", "2026-11-10", "2026-11-09"]);
  });

  it("não mostra o cardápio do dia anterior enquanto carrega o novo dia", async () => {
    api.rota("2026-11-10", { status: 200, corpo: dia() });
    const quarta = api.pendente("2026-11-11");
    render(<Cardapio />);
    await screen.findByText("Frango grelhado");

    await userEvent.click(botao("Próximo dia"));
    expect(screen.getByRole("status", { name: "Carregando cardápio" })).toBeTruthy();
    expect(screen.queryByText("Frango grelhado")).toBeNull(); // dado de outro dia some

    quarta.resolver({ status: 200, corpo: dia({ proteinaAnimal: "Peixe assado" }) });
    expect(await screen.findByText("Peixe assado")).toBeTruthy();
  });

  it("resposta atrasada de uma data antiga não sobrescreve a data atual (corrida)", async () => {
    const hojeLento = api.pendente("2026-11-10");
    api.rota("2026-11-11", { status: 200, corpo: dia({ proteinaAnimal: "Peixe assado" }) });
    render(<Cardapio />);

    await userEvent.click(botao("Próximo dia")); // sai de hoje antes da resposta chegar
    expect(await screen.findByText("Peixe assado")).toBeTruthy();

    hojeLento.resolver({ status: 200, corpo: dia({ proteinaAnimal: "RESPOSTA ANTIGA" }) });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("RESPOSTA ANTIGA")).toBeNull();
    expect(screen.getByText("Peixe assado")).toBeTruthy();
    expect(screen.getByText("qua, 11/11/2026")).toBeTruthy();
  });

  it("erro do servidor mostra a mensagem e 'Tentar de novo' refaz a consulta", async () => {
    api.rota("2026-11-10", { status: 500, corpo: { mensagem: "Erro interno. Tente novamente em instantes." } });
    render(<Cardapio />);
    expect(await screen.findByText("Erro interno. Tente novamente em instantes.")).toBeTruthy();
    expect(screen.queryByText(/ainda não foi publicado/)).toBeNull();

    api.rota("2026-11-10", { status: 200, corpo: dia() });
    await userEvent.click(botao("Tentar de novo"));
    expect(await screen.findByText("Frango grelhado")).toBeTruthy();
    expect(screen.queryByText("Erro interno. Tente novamente em instantes.")).toBeNull();
    expect(api.chamadas).toEqual(["2026-11-10", "2026-11-10"]);
  });

  it("sem conexão: mensagem em português, sem texto técnico", async () => {
    api.rota("2026-11-10", new TypeError("Failed to fetch"));
    render(<Cardapio />);
    expect(await screen.findByText(/Não foi possível conectar ao servidor/)).toBeTruthy();
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
  });

  it("sem login (401) mostra a mensagem da API", async () => {
    api.rota("2026-11-10", { status: 401, corpo: { mensagem: "Faça login para continuar." } });
    render(<Cardapio />);
    expect(await screen.findByText("Faça login para continuar.")).toBeTruthy();
  });

  it("campo vazio no cardápio aparece como 'Não informado'", async () => {
    api.rota("2026-11-10", { status: 200, corpo: dia({ suco: "" }) });
    render(<Cardapio />);
    expect(await screen.findByText("Não informado")).toBeTruthy();
  });

  it("texto longo e sem espaços não estoura a coluna (quebra de linha liberada)", async () => {
    const longo = "x".repeat(200);
    api.rota("2026-11-10", { status: 200, corpo: dia({ sobremesa: longo }) });
    render(<Cardapio />);
    const el = await screen.findByText(longo);
    expect(getComputedStyle(el).overflowWrap).toBe("anywhere");
  });

  describe("escolher outra data pelo campo", () => {
    it("digitar uma data válida consulta aquela data", async () => {
      api.rota("2026-12-25", { status: 200, corpo: dia({ proteinaAnimal: "Peru" }) });
      render(<Cardapio />);
      await screen.findByText(/de hoje ainda não foi publicado/);

      digitarData("25122026");
      expect((campoData() as HTMLInputElement).value).toBe("25/12/2026");
      expect(await screen.findByText("Peru")).toBeTruthy();
      expect(screen.getByText("sex, 25/12/2026")).toBeTruthy();
    });

    it("data incompleta não consulta nada", async () => {
      render(<Cardapio />);
      await screen.findByText(/de hoje ainda não foi publicado/);
      digitarData("2512");
      digitarData("25/12/20");
      expect(api.chamadas).toEqual(["2026-11-10"]);
    });

    it("data que não existe (31/02) mostra erro no campo e não consulta", async () => {
      render(<Cardapio />);
      await screen.findByText(/de hoje ainda não foi publicado/);
      digitarData("31022026");
      expect(screen.getByText("Informe uma data válida, no formato dd/mm/aaaa.")).toBeTruthy();
      expect(api.chamadas).toEqual(["2026-11-10"]);
    });

    it("ano fora de 2000 a 2100 mostra erro no campo e não consulta", async () => {
      render(<Cardapio />);
      await screen.findByText(/de hoje ainda não foi publicado/);
      digitarData("01011999");
      expect(screen.getByText("Use uma data entre os anos 2000 e 2100.")).toBeTruthy();
      digitarData("01012101");
      expect(screen.getByText("Use uma data entre os anos 2000 e 2100.")).toBeTruthy();
      expect(api.chamadas).toEqual(["2026-11-10"]);
    });

    it("aceita só números e ignora letras", async () => {
      render(<Cardapio />);
      await screen.findByText(/de hoje ainda não foi publicado/);
      digitarData("abc12/ab12/2026");
      expect((campoData() as HTMLInputElement).value).toBe("12/12/2026");
    });

    it("as setas travam nos limites do intervalo aceito pela API", async () => {
      render(<Cardapio />);
      await screen.findByText(/de hoje ainda não foi publicado/);

      digitarData("01012000");
      await screen.findByText("sáb, 01/01/2000");
      expect(botao("Dia anterior").disabled).toBe(true);
      expect(botao("Próximo dia").disabled).toBe(false);

      digitarData("31122100");
      await screen.findByText("sex, 31/12/2100");
      expect(botao("Próximo dia").disabled).toBe(true);
      expect(botao("Dia anterior").disabled).toBe(false);
    });

    it("o botão Hoje volta para hoje e fica desabilitado quando já está em hoje", async () => {
      render(<Cardapio />);
      await screen.findByText(/de hoje ainda não foi publicado/);
      expect(botao("Hoje").disabled).toBe(true);

      await userEvent.click(botao("Próximo dia"));
      await screen.findByText(/desta data ainda não foi publicado/);
      expect(botao("Hoje").disabled).toBe(false);

      await userEvent.click(botao("Hoje"));
      expect(await screen.findByText(/de hoje ainda não foi publicado/)).toBeTruthy();
      expect((campoData() as HTMLInputElement).value).toBe("10/11/2026");
      expect(botao("Hoje").disabled).toBe(true);
    });

    it("o campo acompanha as setas", async () => {
      render(<Cardapio />);
      await screen.findByText(/de hoje ainda não foi publicado/);
      await userEvent.click(botao("Próximo dia"));
      await waitFor(() => expect((campoData() as HTMLInputElement).value).toBe("11/11/2026"));
    });
  });

  it("virada de mês e de ano pelas setas", async () => {
    render(<Cardapio />);
    await screen.findByText(/de hoje ainda não foi publicado/);
    digitarData("31122026");
    await screen.findByText("qui, 31/12/2026");
    await userEvent.click(botao("Próximo dia"));
    expect(await screen.findByText("sex, 01/01/2027")).toBeTruthy();
  });

  it("botões de navegação têm pelo menos 44 px e nome acessível", () => {
    render(<Cardapio />);
    for (const nome of ["Dia anterior", "Próximo dia"]) {
      const b = botao(nome);
      expect(getComputedStyle(b).width).toBe("44px");
      expect(getComputedStyle(b).height).toBe("44px");
    }
    expect(screen.getByRole("heading", { level: 1, name: "Cardápio" })).toBeTruthy();
  });
});
