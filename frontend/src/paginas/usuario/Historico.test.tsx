// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Historico from "./Historico";

type Tipo = "RECARGA" | "DEBITO_REFEICAO" | "ESTORNO" | "REFEICAO_ISENTA";
type Item = { id: string; tipo: Tipo; valorCentavos: number; saldoAposCentavos: number | null; data: string };
type Filtro = "todos" | "recargas" | "consumo" | "estornos";

// ---------- API falsa que pagina de verdade (cursor = posição na lista) ----------
const filtrar = (itens: Item[], f: Filtro) =>
  itens.filter((i) =>
    f === "todos"
      ? true
      : f === "recargas"
        ? i.tipo === "RECARGA"
        : f === "consumo"
          ? i.tipo === "DEBITO_REFEICAO" || i.tipo === "REFEICAO_ISENTA"
          : i.tipo === "ESTORNO",
  );

type Resposta = { status: number; corpo: unknown } | Error;
let itens: Item[];
let pedidos: URL[];
let travas: Map<string, (r?: Resposta) => void>;
let falhas: Map<string, Resposta>;

const chave = (u: URL) => `${u.searchParams.get("tipo")}|${u.searchParams.get("cursor") ?? ""}`;

function instalarApi() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (endereco: string) => {
      const u = new URL(endereco);
      pedidos.push(u);
      const k = chave(u);

      const falha = falhas.get(k);
      if (falha) {
        falhas.delete(k); // falha só uma vez; o "tentar de novo" funciona
        if (falha instanceof Error) throw falha;
        return new Response(JSON.stringify(falha.corpo), { status: falha.status });
      }
      if (travas.has(k)) await new Promise<Resposta | void>((ok) => travas.set(k, ok as never));

      const filtro = u.searchParams.get("tipo") as Filtro;
      const limite = Number(u.searchParams.get("limite"));
      const inicio = Number(u.searchParams.get("cursor") ?? 0);
      const todos = filtrar(itens, filtro);
      const pagina = todos.slice(inicio, inicio + limite);
      const proximo = inicio + limite < todos.length ? String(inicio + limite) : null;
      return new Response(JSON.stringify({ itens: pagina, proximoCursor: proximo }), { status: 200 });
    }),
  );
}

// ---------- dados ----------
let n = 0;
const quando = (minutosAtras: number) => new Date(2026, 10, 10, 15, 0 - minutosAtras).toISOString();
const item = (tipo: Tipo, minutosAtras: number, valorCentavos = 350, saldo: number | null = 1650): Item => ({
  id: `item-${++n}`,
  tipo,
  valorCentavos,
  saldoAposCentavos: tipo === "REFEICAO_ISENTA" ? null : saldo,
  data: quando(minutosAtras),
});

beforeEach(() => {
  n = 0;
  itens = [];
  pedidos = [];
  travas = new Map();
  falhas = new Map();
  instalarApi();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const botao = (nome: string | RegExp) => screen.getByRole("button", { name: nome }) as HTMLButtonElement;
const linhas = () => within(screen.getByRole("list")).getAllByRole("listitem");
const aba = (nome: string) => screen.getByRole("tab", { name: nome });
const muitos = (qtd: number) => Array.from({ length: qtd }, (_, i) => item("DEBITO_REFEICAO", i + 1, 350, 10000 - i));
const soltar = (k: string) => travas.get(k)?.();

describe("Histórico (usuário) - T13", () => {
  it("mostra carregando e depois as movimentações, da mais recente para a mais antiga", async () => {
    itens = [item("DEBITO_REFEICAO", 10), item("RECARGA", 300, 2000, 2000)];
    render(<Historico />);

    expect(screen.getByRole("status", { name: "Carregando histórico" })).toBeTruthy();
    await screen.findByText("Refeição");
    expect(screen.queryByRole("status", { name: "Carregando histórico" })).toBeNull();
    expect(linhas().map((l) => l.textContent)).toEqual([
      expect.stringContaining("Refeição"),
      expect.stringContaining("Recarga"),
    ]);
  });

  it("cada linha mostra tipo, data e hora (dd/mm/aaaa hh:mm), valor com sinal e saldo", async () => {
    itens = [item("DEBITO_REFEICAO", 0, 350, 1650), item("RECARGA", 60, 2000, 2000)];
    render(<Historico />);
    await screen.findByText("Refeição");

    const [refeicao, recarga] = linhas();
    expect(refeicao!.textContent).toContain("10/11/2026 15:00");
    expect(refeicao!.textContent).toContain("- R$ 3,50");
    expect(refeicao!.textContent).toContain("Saldo: R$ 16,50");
    expect(recarga!.textContent).toContain("10/11/2026 14:00");
    expect(recarga!.textContent).toContain("+ R$ 20,00");
    expect(recarga!.textContent).toContain("Saldo: R$ 20,00");
  });

  it("estorno aparece como entrada (+), não só pela cor", async () => {
    itens = [item("ESTORNO", 5, 350, 1650)];
    render(<Historico />);
    await screen.findByText("Estorno");
    expect(linhas()[0]!.textContent).toContain("+ R$ 3,50");
  });

  it("refeição de aluno PAE: valor R$ 0,00, sem sinal e sem saldo, marcada como isenta", async () => {
    itens = [item("REFEICAO_ISENTA", 5, 0, null)];
    render(<Historico />);
    await screen.findByText("Refeição (PAE)");

    const texto = linhas()[0]!.textContent!;
    expect(texto).toContain("R$ 0,00");
    expect(texto).not.toMatch(/[+-] R\$/);
    expect(texto).toContain("Isenta");
    expect(texto).not.toContain("Saldo");
  });

  it("valores grandes usam ponto no milhar", async () => {
    itens = [item("RECARGA", 1, 123450, 123450)];
    render(<Historico />);
    await screen.findByText("Recarga");
    expect(linhas()[0]!.textContent).toContain("+ R$ 1.234,50");
  });

  describe("estado vazio", () => {
    it("sem movimentações", async () => {
      render(<Historico />);
      expect(await screen.findByText("Você ainda não tem movimentações.")).toBeTruthy();
      expect(screen.queryByRole("list")).toBeNull();
      expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
    });

    it.each([
      ["Recargas", "DEBITO_REFEICAO", "Você ainda não fez nenhuma recarga."],
      ["Consumo", "RECARGA", "Você ainda não consumiu nenhuma refeição."],
      ["Estornos", "RECARGA", "Você não tem nenhum estorno."],
    ] as const)("aba %s sem itens daquele tipo: %s", async (nomeAba, tipoExistente, mensagem) => {
      itens = [item(tipoExistente, 1)]; // existe movimento, mas não do tipo da aba
      render(<Historico />);
      await screen.findByRole("list");
      await userEvent.click(aba(nomeAba));
      expect(await screen.findByText(mensagem)).toBeTruthy();
      expect(screen.queryByRole("list")).toBeNull();
    });
  });

  describe("abas (filtros)", () => {
    beforeEach(() => {
      itens = [item("ESTORNO", 10), item("REFEICAO_ISENTA", 20, 0), item("DEBITO_REFEICAO", 30), item("RECARGA", 40, 2000)];
    });

    it("abre em Tudo, com as quatro abas", async () => {
      render(<Historico />);
      await screen.findByText("Estorno");
      expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Tudo", "Recargas", "Consumo", "Estornos"]);
      expect(aba("Tudo").getAttribute("aria-selected")).toBe("true");
      expect(linhas()).toHaveLength(4);
      expect(pedidos[0]!.searchParams.get("tipo")).toBe("todos");
      expect(pedidos[0]!.searchParams.get("limite")).toBe("20");
    });

    it("Recargas: pede tipo=recargas e mostra só recargas", async () => {
      render(<Historico />);
      await screen.findByText("Estorno");
      await userEvent.click(aba("Recargas"));
      await waitFor(() => expect(linhas()).toHaveLength(1));
      expect(linhas()[0]!.textContent).toContain("Recarga");
      expect(pedidos.at(-1)!.searchParams.get("tipo")).toBe("recargas");
      expect(aba("Recargas").getAttribute("aria-selected")).toBe("true");
    });

    it("Consumo: mostra refeições pagas e PAE", async () => {
      render(<Historico />);
      await screen.findByText("Estorno");
      await userEvent.click(aba("Consumo"));
      await waitFor(() => expect(linhas()).toHaveLength(2));
      expect(linhas().map((l) => l.textContent).join("|")).toMatch(/PAE.*Refeição|Refeição.*PAE/);
    });

    it("Estornos: mostra só estornos", async () => {
      render(<Historico />);
      await screen.findByText("Estorno");
      await userEvent.click(aba("Estornos"));
      await waitFor(() => expect(linhas()).toHaveLength(1));
      expect(linhas()[0]!.textContent).toContain("Estorno");
    });

    it("trocar de aba mostra carregando e não deixa a lista da aba anterior visível", async () => {
      render(<Historico />);
      await screen.findByText("Estorno");
      travas.set("recargas|", () => {});
      await userEvent.click(aba("Recargas"));

      expect(screen.getByRole("status", { name: "Carregando histórico" })).toBeTruthy();
      expect(screen.queryByRole("list")).toBeNull();
      soltar("recargas|");
      await waitFor(() => expect(linhas()).toHaveLength(1));
    });

    it("clicar na aba que já está ativa não refaz a consulta", async () => {
      render(<Historico />);
      await screen.findByText("Estorno");
      await userEvent.click(aba("Tudo"));
      expect(pedidos).toHaveLength(1);
    });

    it("resposta atrasada de uma aba antiga não sobrescreve a aba atual (corrida)", async () => {
      travas.set("todos|", () => {});
      render(<Historico />);
      await userEvent.click(aba("Recargas")); // sai de "Tudo" antes da resposta chegar
      await waitFor(() => expect(linhas()).toHaveLength(1));

      soltar("todos|"); // agora chega a resposta antiga, com 4 itens
      await new Promise((r) => setTimeout(r, 30));
      expect(linhas()).toHaveLength(1);
      expect(aba("Recargas").getAttribute("aria-selected")).toBe("true");
    });
  });

  describe("carregar mais (paginação)", () => {
    it("45 registros: 20, depois 40, depois 45; o botão some no fim e a ordem é mantida", async () => {
      itens = muitos(45);
      render(<Historico />);
      await screen.findAllByText("Refeição");
      expect(linhas()).toHaveLength(20);

      await userEvent.click(botao("Carregar mais"));
      await waitFor(() => expect(linhas()).toHaveLength(40));

      await userEvent.click(botao("Carregar mais"));
      await waitFor(() => expect(linhas()).toHaveLength(45));

      expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
      expect(screen.getByText("Você chegou ao fim do histórico.")).toBeTruthy();

      // sem repetidos e na ordem do servidor (do mais recente para o mais antigo)
      const horas = linhas().map((l) => l.textContent!.match(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/)![0]);
      expect(new Set(horas).size).toBe(45);
      expect(pedidos.map((p) => p.searchParams.get("cursor"))).toEqual([null, "20", "40"]);
    });

    it("lista curta (até uma página) não mostra o botão", async () => {
      itens = muitos(20);
      render(<Historico />);
      await screen.findAllByText("Refeição");
      expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
      expect(screen.getByText("Você chegou ao fim do histórico.")).toBeTruthy();
    });

    it("21 registros: o botão aparece e a segunda página traz 1", async () => {
      itens = muitos(21);
      render(<Historico />);
      await screen.findAllByText("Refeição");
      await userEvent.click(botao("Carregar mais"));
      await waitFor(() => expect(linhas()).toHaveLength(21));
    });

    it("o botão fica desabilitado e mostra 'Carregando...' enquanto busca; clique duplo faz um pedido só", async () => {
      itens = muitos(45);
      render(<Historico />);
      await screen.findAllByText("Refeição");

      travas.set("todos|20", () => {});
      const b = botao("Carregar mais");
      await userEvent.dblClick(b);
      expect(botao("Carregando...").disabled).toBe(true);
      expect(pedidos.filter((p) => p.searchParams.get("cursor") === "20")).toHaveLength(1);

      soltar("todos|20");
      await waitFor(() => expect(linhas()).toHaveLength(40));
    });

    it("a lista já exibida continua na tela enquanto carrega a próxima página", async () => {
      itens = muitos(45);
      render(<Historico />);
      await screen.findAllByText("Refeição");
      travas.set("todos|20", () => {});
      await userEvent.click(botao("Carregar mais"));
      expect(linhas()).toHaveLength(20);
      expect(screen.queryByRole("status", { name: "Carregando histórico" })).toBeNull();
      soltar("todos|20");
      await waitFor(() => expect(linhas()).toHaveLength(40));
    });

    it("erro ao carregar mais mantém a lista, mostra o erro e 'Tentar de novo' completa a página", async () => {
      itens = muitos(45);
      render(<Historico />);
      await screen.findAllByText("Refeição");

      falhas.set("todos|20", { status: 500, corpo: { mensagem: "Erro interno. Tente novamente em instantes." } });
      await userEvent.click(botao("Carregar mais"));

      expect(await screen.findByText("Erro interno. Tente novamente em instantes.")).toBeTruthy();
      expect(linhas()).toHaveLength(20); // não perdeu o que já tinha

      await userEvent.click(botao("Tentar de novo"));
      await waitFor(() => expect(linhas()).toHaveLength(40));
      expect(screen.queryByText("Erro interno. Tente novamente em instantes.")).toBeNull();
    });

    it("trocar de aba enquanto carrega mais descarta a resposta antiga", async () => {
      itens = [...muitos(45), item("RECARGA", 600, 2000)];
      render(<Historico />);
      await screen.findAllByText("Refeição");

      travas.set("todos|20", () => {});
      await userEvent.click(botao("Carregar mais"));
      await userEvent.click(aba("Recargas"));
      await waitFor(() => expect(linhas()).toHaveLength(1));

      soltar("todos|20"); // chega a página antiga de "Tudo"
      await new Promise((r) => setTimeout(r, 30));
      expect(linhas()).toHaveLength(1);
      expect(linhas()[0]!.textContent).toContain("Recarga");
      expect(screen.queryByRole("button", { name: "Carregando..." })).toBeNull();
    });

    it("resposta antiga de outra aba não destrava o botão de uma carga mais nova em andamento", async () => {
      itens = Array.from({ length: 45 }, (_, i) => item("RECARGA", i + 1, 2000)); // aparece em Tudo e em Recargas
      render(<Historico />);
      await screen.findAllByText("Recarga");

      travas.set("todos|20", () => {});
      await userEvent.click(botao("Carregar mais")); // pedido antigo, em Tudo
      await userEvent.click(aba("Recargas"));
      await waitFor(() => expect(linhas()).toHaveLength(20));

      travas.set("recargas|20", () => {});
      await userEvent.click(botao("Carregar mais")); // pedido novo, em Recargas
      expect(botao("Carregando...").disabled).toBe(true);

      soltar("todos|20"); // o pedido antigo termina primeiro
      await new Promise((r) => setTimeout(r, 30));
      expect(botao("Carregando...").disabled).toBe(true); // continua travado: o pedido novo ainda não voltou
      expect(pedidos.filter((p) => p.searchParams.get("tipo") === "recargas" && p.searchParams.get("cursor") === "20")).toHaveLength(1);

      soltar("recargas|20");
      await waitFor(() => expect(linhas()).toHaveLength(40));
    });

    it("se o servidor devolver um item que já está na lista, ele não aparece duas vezes", async () => {
      itens = muitos(45);
      render(<Historico />);
      await screen.findAllByText("Refeição");

      // Entra um movimento mais novo entre as páginas: com a paginação por posição do fake,
      // o último item da 1ª página reaparece no início da 2ª.
      itens.unshift(item("DEBITO_REFEICAO", 0, 350, 9999));
      await userEvent.click(botao("Carregar mais"));
      await waitFor(() => expect(linhas()).toHaveLength(39)); // 20 + 20 - 1 repetido

      const horas = linhas().map((l) => l.textContent!.match(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/)![0]);
      expect(new Set(horas).size).toBe(horas.length);
    });

    it("cada aba pagina por conta própria, recomeçando do início", async () => {
      itens = [...muitos(25), ...Array.from({ length: 22 }, (_, i) => item("RECARGA", 1000 + i, 2000))];
      render(<Historico />);
      await screen.findAllByText("Refeição");
      await userEvent.click(botao("Carregar mais"));
      await waitFor(() => expect(linhas()).toHaveLength(40));

      await userEvent.click(aba("Recargas"));
      await waitFor(() => expect(linhas()).toHaveLength(20));
      expect(pedidos.at(-1)!.searchParams.get("cursor")).toBeNull();
      await userEvent.click(botao("Carregar mais"));
      await waitFor(() => expect(linhas()).toHaveLength(22));
      expect(pedidos.at(-1)!.searchParams.get("tipo")).toBe("recargas");
    });
  });

  describe("erros ao abrir", () => {
    it("erro do servidor: mensagem e 'Tentar de novo' refaz a consulta", async () => {
      itens = [item("RECARGA", 1, 2000)];
      falhas.set("todos|", { status: 500, corpo: { mensagem: "Erro interno. Tente novamente em instantes." } });
      render(<Historico />);

      expect(await screen.findByText("Erro interno. Tente novamente em instantes.")).toBeTruthy();
      expect(screen.queryByText("Você ainda não tem movimentações.")).toBeNull();

      await userEvent.click(botao("Tentar de novo"));
      expect(await screen.findByText("Recarga")).toBeTruthy();
      expect(screen.queryByText("Erro interno. Tente novamente em instantes.")).toBeNull();
    });

    it("sem conexão: mensagem em português, sem texto técnico", async () => {
      falhas.set("todos|", new TypeError("Failed to fetch"));
      render(<Historico />);
      expect(await screen.findByText(/Não foi possível conectar ao servidor/)).toBeTruthy();
      expect(screen.queryByText(/Failed to fetch/)).toBeNull();
    });

    it("sem login (401): mostra a mensagem da API", async () => {
      falhas.set("todos|", { status: 401, corpo: { mensagem: "Faça login para continuar." } });
      render(<Historico />);
      expect(await screen.findByText("Faça login para continuar.")).toBeTruthy();
    });

    it("erro numa aba não contamina as outras", async () => {
      itens = [item("RECARGA", 1, 2000), item("ESTORNO", 2)];
      render(<Historico />);
      await screen.findByText("Recarga");
      falhas.set("estornos|", { status: 500, corpo: { mensagem: "Erro interno. Tente novamente em instantes." } });
      await userEvent.click(aba("Estornos"));
      await screen.findByText("Erro interno. Tente novamente em instantes.");

      await userEvent.click(aba("Recargas"));
      expect(await screen.findByText("Recarga")).toBeTruthy();
      expect(screen.queryByText("Erro interno. Tente novamente em instantes.")).toBeNull();
    });
  });

  it("título principal e abas acessíveis (cabeçalho nível 1 e grupo de abas com nome)", async () => {
    render(<Historico />);
    await screen.findByText("Você ainda não tem movimentações.");
    expect(screen.getByRole("heading", { level: 1, name: "Histórico" })).toBeTruthy();
    expect(screen.getByRole("tablist", { name: "Filtrar movimentações" })).toBeTruthy();
  });
});
