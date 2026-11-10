// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CadastrarCardapio from "./CadastrarCardapio";
import { criarApiFalsa, type ApiFalsa } from "../../testes/apiFalsa";

const CARDAPIO = {
  proteinaAnimal: "Frango grelhado",
  proteinaVegetariana: "Omelete",
  carboidrato1: "Arroz",
  carboidrato2: "Feijão",
  carboidrato3: "Batata",
  salada1: "Alface",
  salada2: "Cenoura",
  sobremesa: "Banana",
  suco: "Laranja",
};
const ROTULOS = [
  "Proteína animal",
  "Proteína vegetariana",
  "Carboidrato 1",
  "Carboidrato 2",
  "Carboidrato 3",
  "Salada 1",
  "Salada 2",
  "Sobremesa",
  "Suco",
];

let api: ApiFalsa;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 10, 12, 0, 0)); // hoje = 10/11/2026
  api = criarApiFalsa();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const campo = (rotulo: string) => screen.getByLabelText(new RegExp(`^${rotulo}`)) as HTMLInputElement;
const campoData = () => screen.getByLabelText(/^Data/) as HTMLInputElement;
const salvar = () => screen.getByRole("button", { name: /Salvar cardápio|Salvando/ }) as HTMLButtonElement;
const digitarData = (v: string) => fireEvent.change(campoData(), { target: { value: v } });
const preencherTudo = async () => {
  for (const [rotulo, valor] of ROTULOS.map((r, i) => [r, Object.values(CARDAPIO)[i]!] as const)) {
    await userEvent.type(campo(rotulo), valor);
  }
};

describe("Cadastrar cardápio (admin) - T15", () => {
  it("abre em hoje, com os 9 campos vazios e aviso de que não há cardápio", async () => {
    render(<CadastrarCardapio />);
    expect(await screen.findByText(/Ainda não há cardápio para esta data/)).toBeTruthy();
    expect(campoData().value).toBe("10/11/2026");
    for (const r of ROTULOS) expect(campo(r).value).toBe("");
    expect(api.chamadas).toEqual(["2026-11-10"]);
  });

  it("carrega o cardápio existente e avisa que salvar vai substituí-lo", async () => {
    api.rota("2026-11-10", { status: 200, corpo: { data: "2026-11-10", ...CARDAPIO } });
    render(<CadastrarCardapio />);
    expect(await screen.findByText(/Já existe cardápio para esta data/)).toBeTruthy();
    expect(campo("Proteína animal").value).toBe("Frango grelhado");
    expect(campo("Suco").value).toBe("Laranja");
  });

  it("cadastra: envia PUT com os 9 campos na data certa (aaaa-mm-dd) e mostra sucesso", async () => {
    render(<CadastrarCardapio />);
    await screen.findByText(/Ainda não há cardápio|Já existe cardápio/);
    await preencherTudo();
    await userEvent.click(salvar());

    expect(await screen.findByText(/Cardápio salvo!/)).toBeTruthy();
    const put = api.requisicoes.find((r) => r.metodo === "PUT")!;
    expect(put.data).toBe("2026-11-10");
    expect(Object.keys(put.corpo as object).sort()).toEqual(Object.keys(CARDAPIO).sort());
  });

  it("erro de validação da API aparece no campo certo e não mostra sucesso", async () => {
    api.rota("2026-11-10", { status: 400, corpo: { campo: "suco", mensagem: 'Preencha o campo "Suco".' } }, "PUT");
    render(<CadastrarCardapio />);
    await screen.findByText(/Ainda não há cardápio/);
    await userEvent.click(salvar());

    expect(await screen.findByText('Preencha o campo "Suco".')).toBeTruthy();
    expect(campo("Suco").getAttribute("aria-invalid")).toBe("true");
    expect(campo("Sobremesa").getAttribute("aria-invalid")).toBe("false");
    expect(screen.queryByText(/Cardápio salvo!/)).toBeNull();
  });

  it("o erro do campo some quando o admin volta a digitar nele", async () => {
    api.rota("2026-11-10", { status: 400, corpo: { campo: "suco", mensagem: 'Preencha o campo "Suco".' } }, "PUT");
    render(<CadastrarCardapio />);
    await screen.findByText(/Ainda não há cardápio/);
    await userEvent.click(salvar());
    await screen.findByText('Preencha o campo "Suco".');

    await userEvent.type(campo("Suco"), "L");
    expect(screen.queryByText('Preencha o campo "Suco".')).toBeNull();
  });

  it("data passada: aviso, campos e botão desabilitados, e nenhuma gravação possível", async () => {
    render(<CadastrarCardapio />);
    await screen.findByText(/Ainda não há cardápio/);
    digitarData("09112026");

    expect(await screen.findByText(/Esta data já passou/)).toBeTruthy();
    for (const r of ROTULOS) expect(campo(r).disabled).toBe(true);
    expect(salvar().disabled).toBe(true);
    expect(screen.queryByText(/Ainda não há cardápio/)).toBeNull();
    expect(screen.queryByText(/Já existe cardápio/)).toBeNull();
  });

  it("hoje e o futuro podem ser editados", async () => {
    render(<CadastrarCardapio />);
    await screen.findByText(/Ainda não há cardápio/);
    expect(salvar().disabled).toBe(false);
    digitarData("11112026");
    await screen.findByText(/Ainda não há cardápio/);
    await waitFor(() => expect(api.chamadas).toContain("2026-11-11"));
    expect(salvar().disabled).toBe(false);
  });

  it("data passada que tem cardápio mostra os valores, só para leitura", async () => {
    api.rota("2026-11-01", { status: 200, corpo: { data: "2026-11-01", ...CARDAPIO } });
    render(<CadastrarCardapio />);
    await screen.findByText(/Ainda não há cardápio/);
    digitarData("01112026");

    await waitFor(() => expect(campo("Proteína animal").value).toBe("Frango grelhado"));
    expect(campo("Proteína animal").disabled).toBe(true);
    expect(salvar().disabled).toBe(true);
  });

  it("data incompleta ou inexistente trava o formulário e mostra o erro", async () => {
    render(<CadastrarCardapio />);
    await screen.findByText(/Ainda não há cardápio/);
    digitarData("31022026");
    expect(screen.getByText("Informe uma data válida, no formato dd/mm/aaaa.")).toBeTruthy();
    expect(salvar().disabled).toBe(true);
    for (const r of ROTULOS) expect(campo(r).disabled).toBe(true);
    expect(api.chamadas).toEqual(["2026-11-10"]);
  });

  it("não deixa salvar enquanto está carregando o cardápio da data", async () => {
    const lento = api.pendente("2026-11-10");
    render(<CadastrarCardapio />);
    expect(salvar().disabled).toBe(true);
    expect(screen.getByRole("status", { name: "Carregando cardápio" })).toBeTruthy();
    lento.resolver({ status: 200, corpo: { data: "2026-11-10", ...CARDAPIO } });
    await waitFor(() => expect(salvar().disabled).toBe(false));
  });

  it("resposta atrasada de outra data não sobrescreve o formulário (corrida)", async () => {
    const hojeLento = api.pendente("2026-11-10");
    api.rota("2026-11-12", { status: 200, corpo: { data: "2026-11-12", ...CARDAPIO, proteinaAnimal: "Peixe" } });
    render(<CadastrarCardapio />);

    digitarData("12112026");
    await waitFor(() => expect(campo("Proteína animal").value).toBe("Peixe"));
    hojeLento.resolver({ status: 200, corpo: { data: "2026-11-10", ...CARDAPIO, proteinaAnimal: "ANTIGO" } });
    await new Promise((r) => setTimeout(r, 20));
    expect(campo("Proteína animal").value).toBe("Peixe");
  });

  it("o botão fica desabilitado durante o envio (sem duplo clique)", async () => {
    render(<CadastrarCardapio />);
    await screen.findByText(/Ainda não há cardápio/);
    const salvando = api.pendente("2026-11-10", "PUT");
    await userEvent.click(salvar());
    expect(salvar().disabled).toBe(true);
    expect(salvar().textContent).toBe("Salvando...");
    salvando.resolver({ status: 200, corpo: {} });
    expect(await screen.findByText(/Cardápio salvo!/)).toBeTruthy();
    expect(api.requisicoes.filter((r) => r.metodo === "PUT")).toHaveLength(1);
  });

  it("falha ao CARREGAR (servidor fora do ar): não deixa salvar às cegas por cima de um cardápio existente", async () => {
    api.rota("2026-11-10", { status: 500, corpo: { mensagem: "Erro interno. Tente novamente em instantes." } });
    render(<CadastrarCardapio />);
    expect(await screen.findByText("Erro interno. Tente novamente em instantes.")).toBeTruthy();
    // Se o GET falhou, não sabemos se já existe cardápio: salvar poderia sobrescrevê-lo sem aviso.
    expect(salvar().disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeTruthy();
  });

  it("'Tentar de novo' recarrega a data e libera o formulário", async () => {
    api.rota("2026-11-10", { status: 500, corpo: { mensagem: "Erro interno. Tente novamente em instantes." } });
    render(<CadastrarCardapio />);
    await screen.findByText("Erro interno. Tente novamente em instantes.");

    api.rota("2026-11-10", { status: 200, corpo: { data: "2026-11-10", ...CARDAPIO } });
    await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    await waitFor(() => expect(campo("Proteína animal").value).toBe("Frango grelhado"));
    expect(salvar().disabled).toBe(false);
    expect(screen.queryByText("Erro interno. Tente novamente em instantes.")).toBeNull();
  });

  it("falha ao SALVAR mostra o erro geral e mantém o que foi digitado", async () => {
    render(<CadastrarCardapio />);
    await screen.findByText(/Ainda não há cardápio/);
    await userEvent.type(campo("Suco"), "Uva");
    api.rota("2026-11-10", new TypeError("Failed to fetch"), "PUT");
    await userEvent.click(salvar());

    expect(await screen.findByText(/Não foi possível conectar ao servidor/)).toBeTruthy();
    expect(campo("Suco").value).toBe("Uva");
    expect(salvar().disabled).toBe(false); // pode tentar de novo
  });

  it("trocar de data limpa a mensagem de sucesso e o erro anterior", async () => {
    render(<CadastrarCardapio />);
    await screen.findByText(/Ainda não há cardápio/);
    await userEvent.click(salvar());
    await screen.findByText(/Cardápio salvo!/);

    digitarData("12112026");
    await waitFor(() => expect(screen.queryByText(/Cardápio salvo!/)).toBeNull());
  });
});
