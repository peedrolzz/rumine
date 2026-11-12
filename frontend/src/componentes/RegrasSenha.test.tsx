// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import RegrasSenha from "./RegrasSenha";

afterEach(cleanup);

const itens = () => within(screen.getByRole("list", { name: "Regras da senha" })).getAllByRole("listitem");
const estado = (i: number) => (itens()[i]!.textContent!.includes("(cumprida)") ? "cumprida" : "pendente");

describe("RegrasSenha", () => {
  it("lista as três regras", () => {
    render(<RegrasSenha senha="" />);
    expect(itens().map((i) => i.textContent!.replace(/ \((cumprida|pendente)\)/, ""))).toEqual([
      "Pelo menos 8 caracteres",
      "Pelo menos um número",
      "Pelo menos um caractere especial (! @ # $ %)",
    ]);
  });

  it("senha vazia: nenhuma cumprida", () => {
    render(<RegrasSenha senha="" />);
    expect([0, 1, 2].map(estado)).toEqual(["pendente", "pendente", "pendente"]);
  });

  it.each([
    ["abcdefgh", ["cumprida", "pendente", "pendente"]],
    ["abc1", ["pendente", "cumprida", "pendente"]],
    ["ab!", ["pendente", "pendente", "cumprida"]],
    ["abcdefg1", ["cumprida", "cumprida", "pendente"]],
    ["Senha@123", ["cumprida", "cumprida", "cumprida"]],
  ])("senha %j -> %j", (senha, esperado) => {
    render(<RegrasSenha senha={senha} />);
    expect([0, 1, 2].map(estado)).toEqual(esperado);
  });

  it("atualiza quando a senha muda", () => {
    const { rerender } = render(<RegrasSenha senha="abc" />);
    expect(estado(0)).toBe("pendente");
    rerender(<RegrasSenha senha="abcdefgh" />);
    expect(estado(0)).toBe("cumprida");
    rerender(<RegrasSenha senha="abc" />);
    expect(estado(0)).toBe("pendente");
  });

  it("o estado não depende só de cor: há texto para leitores de tela e ícone decorativo", () => {
    render(<RegrasSenha senha="Senha@123" />);
    for (const item of itens()) {
      expect(item.textContent).toContain("(cumprida)");
      expect(item.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    }
  });
});
