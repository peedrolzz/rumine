// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { criarBackendFalso, USUARIO_ATIVO, type BackendFalso } from "../../testes/backendFalso";
import { renderApp } from "../../testes/renderApp";
import type { Usuario } from "../../auth/contexto";

let backend: BackendFalso;

const PENDENTE: Usuario = { ...USUARIO_ATIVO, status: "PENDENTE_APROVACAO" };
const REJEITADO: Usuario = { ...USUARIO_ATIVO, status: "REJEITADO" };

const comoSemDeclaracao = () => {
  backend.sessao.usuario = PENDENTE;
  backend.sessao.vinculo = { identificador: null, declaracaoEnviadaEm: null, motivoRejeicao: null };
};
const comoRejeitado = (motivo: string | null = "Arquivo ilegível.") => {
  backend.sessao.usuario = REJEITADO;
  backend.sessao.vinculo = { identificador: "a1111111", declaracaoEnviadaEm: "2026-11-09T10:00:00.000Z", motivoRejeicao: motivo };
};

/** Faz o backend falso se comportar como o de verdade: envio aceito = conta vai para análise. */
const aceitarEnvio = () =>
  backend.rota(
    "POST",
    "/vinculo",
    (corpo) => {
      backend.sessao.usuario = PENDENTE;
      backend.sessao.vinculo = {
        identificador: String(corpo["identificador"]).toLowerCase(),
        declaracaoEnviadaEm: "2026-11-10T16:20:00.000Z",
        motivoRejeicao: null,
      };
      return { status: 201, corpo: { status: "PENDENTE_APROVACAO" } };
    },
    { protegida: true },
  );

beforeEach(() => {
  backend = criarBackendFalso({ logado: true });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const abrir = async (titulo: string) => {
  renderApp("/status-cadastro");
  await screen.findByRole("heading", { name: titulo });
  return userEvent.setup({ applyAccept: false });
};
type Usr = Awaited<ReturnType<typeof abrir>>;

const PDF = () => new File(["%PDF-1.7 conteudo"], "declaracao.pdf", { type: "application/pdf" });
const arquivoGrande = (bytes: number) => {
  const f = new File(["x"], "grande.pdf", { type: "application/pdf" });
  Object.defineProperty(f, "size", { value: bytes });
  return f;
};
const campoArquivo = () => screen.getByTestId("campo-arquivo");
const escolher = (u: Usr, f: File) => u.upload(campoArquivo(), f);
const preencherRa = async (u: Usr, ra: string) => {
  const campo = screen.getByLabelText(/RA/);
  await u.clear(campo);
  if (ra) await u.type(campo, ra);
};
const enviar = (u: Usr, nome = "Enviar para análise") => u.click(screen.getByRole("button", { name: nome }));
const envios = () => backend.chamadas.filter((c) => c.metodo === "POST" && c.caminho === "/vinculo");

describe("carregando e erro", () => {
  it("mostra carregando enquanto busca a situação do vínculo", async () => {
    backend.sessao.usuario = PENDENTE;
    const lenta = backend.adiar("GET", "/vinculo");
    renderApp("/status-cadastro");
    expect(await screen.findByRole("status", { name: "Carregando seu cadastro" })).toBeTruthy();
    lenta.resolver({ status: 200, corpo: { status: "PENDENTE_APROVACAO", ...backend.sessao.vinculo } });
    expect(await screen.findByRole("heading", { name: "Cadastro em análise" })).toBeTruthy();
  });

  it("falha ao buscar: mensagem, Tentar de novo e Sair (nunca tela em branco)", async () => {
    backend.sessao.usuario = PENDENTE;
    let falhar = true;
    backend.rota(
      "GET",
      "/vinculo",
      () =>
        falhar
          ? { status: 500, corpo: { mensagem: "Erro interno. Tente novamente em instantes." } }
          : { status: 200, corpo: { status: "PENDENTE_APROVACAO", ...backend.sessao.vinculo } },
      { protegida: true },
    );
    renderApp("/status-cadastro");
    expect(await screen.findByText("Erro interno. Tente novamente em instantes.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sair" })).toBeTruthy();
    falhar = false;
    await userEvent.setup().click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByRole("heading", { name: "Cadastro em análise" })).toBeTruthy();
  });

  it("sem conexão: mensagem em português", async () => {
    backend.sessao.usuario = PENDENTE;
    backend.rota("GET", "/vinculo", new Error("rede"), { protegida: true });
    renderApp("/status-cadastro");
    expect(await screen.findByText(/Não foi possível conectar ao servidor/)).toBeTruthy();
  });

  it("sessão vencida ao buscar: vai para o login", async () => {
    backend.sessao.usuario = PENDENTE;
    backend.rota(
      "GET",
      "/vinculo",
      () => {
        backend.sessao.logado = false;
        backend.sessao.expirada = true;
        return { status: 401, corpo: { codigo: "SESSAO_EXPIRADA", mensagem: "Sua sessão expirou. Entre novamente." } };
      },
      { protegida: true },
    );
    renderApp("/status-cadastro");
    expect(await screen.findByRole("heading", { name: "Entrar" })).toBeTruthy();
  });
});

describe("primeiro acesso (sem declaração)", () => {
  beforeEach(comoSemDeclaracao);

  it("mostra o formulário com RA, arquivo, formatos e limite; sem botão Atualizar", async () => {
    await abrir("Comprove seu vínculo");
    expect(screen.getByLabelText(/RA/)).toBeTruthy();
    expect(screen.getByText("Declaração de matrícula")).toBeTruthy();
    expect(screen.getByText("PDF, JPG ou PNG, até 5 MB.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Escolher arquivo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enviar para análise" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Atualizar" })).toBeNull();
    expect(screen.getByRole("button", { name: "Sair" })).toBeTruthy();
  });

  it("o campo de arquivo só oferece PDF, JPG e PNG", async () => {
    await abrir("Comprove seu vínculo");
    expect(campoArquivo().getAttribute("accept")).toBe(".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png");
  });

  it("mostra o nome e o tamanho do arquivo escolhido e troca o texto do botão", async () => {
    const u = await abrir("Comprove seu vínculo");
    await escolher(u, new File([new Uint8Array(1536)], "minha declaracao.pdf", { type: "application/pdf" }));
    expect(screen.getByText("minha declaracao.pdf (1,5 KB)")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Trocar arquivo" })).toBeTruthy();
  });

  it("envia o RA (sem espaços) e o arquivo como formulário, depois mostra 'em análise'", async () => {
    aceitarEnvio();
    const u = await abrir("Comprove seu vínculo");
    await preencherRa(u, "  A2345678 ");
    const arq = PDF();
    await escolher(u, arq);
    await enviar(u);

    expect(await screen.findByRole("heading", { name: "Cadastro em análise" })).toBeTruthy();
    expect(screen.getByText("Declaração enviada!")).toBeTruthy();
    expect(screen.getByText(/RA a2345678 · enviada em 10\/11\/2026/)).toBeTruthy();
    expect(envios()).toHaveLength(1);
    const f = envios()[0]!.formulario!;
    expect(f.get("identificador")).toBe("A2345678");
    expect(f.get("declaracao")).toBe(arq);
    expect([...f.keys()]).toEqual(["identificador", "declaracao"]);
    expect(screen.queryByRole("button", { name: "Enviar para análise" })).toBeNull();
  });

  it("tentar enviar vazio: mostra o que falta e não chama o servidor", async () => {
    const u = await abrir("Comprove seu vínculo");
    await enviar(u);
    expect(screen.getByText("Informe seu RA.")).toBeTruthy();
    expect(screen.getByText("Escolha o arquivo da declaração.")).toBeTruthy();
    expect(envios()).toHaveLength(0);
  });

  it.each(["abc", "12345", "a234 5678", "a-2345678", "a2345678901234"])("RA %j inválido: erro no campo, sem enviar", async (ra) => {
    const u = await abrir("Comprove seu vínculo");
    await preencherRa(u, ra);
    await escolher(u, PDF());
    await enviar(u);
    expect(screen.getByText(/Informe seu RA com letras e números/)).toBeTruthy();
    expect(envios()).toHaveLength(0);
  });

  it.each([
    ["declaracao.txt", "Envie a declaração em PDF, JPG ou PNG."],
    ["declaracao.exe", "Envie a declaração em PDF, JPG ou PNG."],
    ["declaracao", "Envie a declaração em PDF, JPG ou PNG."],
    ["declaracao.pdf.exe", "Envie a declaração em PDF, JPG ou PNG."],
  ])("arquivo %s: recusado no aparelho com os formatos aceitos", async (nome, mensagem) => {
    const u = await abrir("Comprove seu vínculo");
    await preencherRa(u, "a2345678");
    await escolher(u, new File(["x"], nome));
    await enviar(u);
    expect(screen.getByText(mensagem)).toBeTruthy();
    expect(envios()).toHaveLength(0);
  });

  it.each(["a.PDF", "foto.JPG", "foto.jpeg", "scan.png"])("extensão aceita: %s", async (nome) => {
    aceitarEnvio();
    const u = await abrir("Comprove seu vínculo");
    await preencherRa(u, "a2345678");
    await escolher(u, new File(["x"], nome));
    await enviar(u);
    await screen.findByRole("heading", { name: "Cadastro em análise" });
  });

  it("acima de 5 MB: recusado no aparelho informando o limite; exatamente 5 MB passa", async () => {
    aceitarEnvio();
    const u = await abrir("Comprove seu vínculo");
    await preencherRa(u, "a2345678");
    await escolher(u, arquivoGrande(5 * 1024 * 1024 + 1));
    await enviar(u);
    expect(screen.getByText("O arquivo é grande demais. O limite é de 5 MB.")).toBeTruthy();
    expect(envios()).toHaveLength(0);

    await escolher(u, arquivoGrande(5 * 1024 * 1024));
    await enviar(u);
    await screen.findByRole("heading", { name: "Cadastro em análise" });
    expect(envios()).toHaveLength(1);
  });

  it("arquivo vazio: recusado", async () => {
    const u = await abrir("Comprove seu vínculo");
    await preencherRa(u, "a2345678");
    await escolher(u, new File([], "vazio.pdf"));
    await enviar(u);
    expect(screen.getByText("O arquivo está vazio.")).toBeTruthy();
    expect(envios()).toHaveLength(0);
  });

  it("os erros só aparecem depois da tentativa de envio (nada de erro enquanto digita)", async () => {
    const u = await abrir("Comprove seu vínculo");
    await u.type(screen.getByLabelText(/RA/), "ab");
    expect(screen.queryByText(/Informe seu RA com letras/)).toBeNull();
  });

  // ----- erros do servidor -----
  it("o servidor recusa o conteúdo do arquivo (extensão boa, conteúdo falso): erro no campo do arquivo", async () => {
    backend.rota(
      "POST",
      "/vinculo",
      { status: 400, corpo: { campo: "declaracao", mensagem: "Envie a declaração em PDF, JPG ou PNG." } },
      { protegida: true },
    );
    const u = await abrir("Comprove seu vínculo");
    await preencherRa(u, "a2345678");
    await escolher(u, PDF());
    await enviar(u);
    expect(await screen.findByText("Envie a declaração em PDF, JPG ou PNG.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Comprove seu vínculo" })).toBeTruthy();
    // Trocar o arquivo limpa o erro do servidor.
    await escolher(u, PDF());
    expect(screen.queryByText("Envie a declaração em PDF, JPG ou PNG.")).toBeNull();
    expect(screen.getByText("PDF, JPG ou PNG, até 5 MB.")).toBeTruthy();
  });

  it("413 do servidor: mensagem do limite no campo do arquivo", async () => {
    backend.rota(
      "POST",
      "/vinculo",
      { status: 413, corpo: { campo: "declaracao", mensagem: "O arquivo é grande demais. O limite é de 5 MB." } },
      { protegida: true },
    );
    const u = await abrir("Comprove seu vínculo");
    await preencherRa(u, "a2345678");
    await escolher(u, PDF());
    await enviar(u);
    expect(await screen.findByText("O arquivo é grande demais. O limite é de 5 MB.")).toBeTruthy();
  });

  it("RA de outra conta: erro no campo RA, que some ao editar; o arquivo escolhido é mantido", async () => {
    backend.rota(
      "POST",
      "/vinculo",
      { status: 409, corpo: { campo: "identificador", mensagem: "Este RA já está vinculado a outra conta. Se for um engano, fale com o RU." } },
      { protegida: true },
    );
    const u = await abrir("Comprove seu vínculo");
    await preencherRa(u, "a2345678");
    await escolher(u, PDF());
    await enviar(u);
    expect(await screen.findByText(/Este RA já está vinculado a outra conta/)).toBeTruthy();
    expect(screen.getByText("declaracao.pdf (17 bytes)")).toBeTruthy();
    await u.type(screen.getByLabelText(/RA/), "9");
    expect(screen.queryByText(/Este RA já está vinculado/)).toBeNull();
  });

  it("409 sem campo (já está em análise): mostra o aviso e a tela se atualiza para 'em análise'", async () => {
    backend.rota("POST", "/vinculo", () => {
      backend.sessao.vinculo = { identificador: "a2345678", declaracaoEnviadaEm: "2026-11-10T16:20:00.000Z", motivoRejeicao: null };
      return { status: 409, corpo: { mensagem: "Você já enviou sua declaração. Aguarde a análise do Admin." } };
    }, { protegida: true });
    const u = await abrir("Comprove seu vínculo");
    await preencherRa(u, "a2345678");
    await escolher(u, PDF());
    await enviar(u);
    expect(await screen.findByRole("heading", { name: "Cadastro em análise" })).toBeTruthy();
  });

  it("erro do servidor sem campo: aviso geral, e RA e arquivo continuam preenchidos", async () => {
    backend.rota("POST", "/vinculo", { status: 500, corpo: { mensagem: "Erro interno. Tente novamente em instantes." } }, { protegida: true });
    const u = await abrir("Comprove seu vínculo");
    await preencherRa(u, "a2345678");
    await escolher(u, PDF());
    await enviar(u);
    expect(await screen.findByText("Erro interno. Tente novamente em instantes.")).toBeTruthy();
    expect((screen.getByLabelText(/RA/) as HTMLInputElement).value).toBe("a2345678");
    expect(screen.getByText(/declaracao.pdf/)).toBeTruthy();
  });

  it("sem conexão ao enviar: mensagem em português", async () => {
    backend.rota("POST", "/vinculo", new Error("rede"), { protegida: true });
    const u = await abrir("Comprove seu vínculo");
    await preencherRa(u, "a2345678");
    await escolher(u, PDF());
    await enviar(u);
    expect(await screen.findByText(/Não foi possível conectar ao servidor/)).toBeTruthy();
  });

  it("trava os campos e o botão durante o envio e não envia duas vezes", async () => {
    const lenta = backend.adiar("POST", "/vinculo");
    const u = await abrir("Comprove seu vínculo");
    await preencherRa(u, "a2345678");
    await escolher(u, PDF());
    await enviar(u);
    const botao = (await screen.findByRole("button", { name: "Enviando..." })) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    expect((screen.getByLabelText(/RA/) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Trocar arquivo" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(botao.closest("form")!);
    backend.sessao.usuario = PENDENTE;
    backend.sessao.vinculo = { identificador: "a2345678", declaracaoEnviadaEm: "2026-11-10T16:20:00.000Z", motivoRejeicao: null };
    lenta.resolver({ status: 201, corpo: { status: "PENDENTE_APROVACAO" } });
    await screen.findByRole("heading", { name: "Cadastro em análise" });
    expect(envios()).toHaveLength(1);
  });

  it("sessão vencida durante o envio leva ao login", async () => {
    backend.rota(
      "POST",
      "/vinculo",
      () => {
        backend.sessao.logado = false;
        backend.sessao.expirada = true;
        return { status: 401, corpo: { codigo: "SESSAO_EXPIRADA", mensagem: "Sua sessão expirou. Entre novamente." } };
      },
      { protegida: true },
    );
    const u = await abrir("Comprove seu vínculo");
    await preencherRa(u, "a2345678");
    await escolher(u, PDF());
    await enviar(u);
    expect(await screen.findByRole("heading", { name: "Entrar" })).toBeTruthy();
  });
});

describe("cadastro rejeitado: ver o motivo e reenviar", () => {
  it("mostra o motivo, o RA anterior preenchido e o botão de reenvio", async () => {
    comoRejeitado("Declaração vencida.");
    await abrir("Cadastro não aprovado");
    expect(screen.getByText("Declaração vencida.")).toBeTruthy();
    expect((screen.getByLabelText(/RA/) as HTMLInputElement).value).toBe("a1111111");
    expect(screen.getByRole("button", { name: "Reenviar para análise" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Atualizar" })).toBeNull();
  });

  it("sem motivo registrado: orienta a falar com o RU, e ainda deixa reenviar", async () => {
    comoRejeitado(null);
    await abrir("Cadastro não aprovado");
    expect(screen.getByText(/Fale com o RU para saber o motivo/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reenviar para análise" })).toBeTruthy();
  });

  it("o motivo é texto: HTML não é interpretado", async () => {
    comoRejeitado("<img src=x onerror=alert(1)>");
    const { container } = renderApp("/status-cadastro");
    await screen.findByRole("heading", { name: "Cadastro não aprovado" });
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
  });

  it("reenvia RA corrigido e novo arquivo: volta para 'em análise' com o novo RA", async () => {
    comoRejeitado();
    aceitarEnvio();
    const u = await abrir("Cadastro não aprovado");
    await preencherRa(u, "a7654321");
    await escolher(u, new File(["x"], "nova.png", { type: "image/png" }));
    await enviar(u, "Reenviar para análise");
    expect(await screen.findByRole("heading", { name: "Cadastro em análise" })).toBeTruthy();
    expect(screen.getByText(/RA a7654321/)).toBeTruthy();
    expect(screen.queryByText("Arquivo ilegível.")).toBeNull();
    expect(envios()[0]!.formulario!.get("identificador")).toBe("a7654321");
  });

  it("reenvio sem escolher arquivo novo: pede o arquivo", async () => {
    comoRejeitado();
    const u = await abrir("Cadastro não aprovado");
    await enviar(u, "Reenviar para análise");
    expect(screen.getByText("Escolha o arquivo da declaração.")).toBeTruthy();
    expect(envios()).toHaveLength(0);
  });
});

describe("em análise (declaração já enviada)", () => {
  beforeEach(() => {
    backend.sessao.usuario = PENDENTE;
  });

  it("mostra o RA e a data de envio no formato brasileiro, sem formulário", async () => {
    await abrir("Cadastro em análise");
    expect(screen.getByText(/RA a2345678 · enviada em 10\/11\/2026 \d{2}:\d{2}/)).toBeTruthy();
    expect(screen.queryByLabelText(/RA/)).toBeNull();
    expect(screen.queryByTestId("campo-arquivo")).toBeNull();
    expect(screen.getByRole("button", { name: "Atualizar" })).toBeTruthy();
  });

  it("não mostra 'Declaração enviada!' ao abrir de novo mais tarde", async () => {
    await abrir("Cadastro em análise");
    expect(screen.queryByText("Declaração enviada!")).toBeNull();
  });

  it("Atualizar: quando o Admin aprovou, entra no app", async () => {
    const u = await abrir("Cadastro em análise");
    backend.sessao.usuario = USUARIO_ATIVO;
    await u.click(screen.getByRole("button", { name: "Atualizar" }));
    expect(await screen.findByRole("heading", { name: "Início" })).toBeTruthy();
  });

  it("Atualizar: quando foi rejeitado, mostra o motivo e o formulário de reenvio", async () => {
    const u = await abrir("Cadastro em análise");
    comoRejeitado("Foto cortada.");
    await u.click(screen.getByRole("button", { name: "Atualizar" }));
    expect(await screen.findByRole("heading", { name: "Cadastro não aprovado" })).toBeTruthy();
    expect(screen.getByText("Foto cortada.")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: "Reenviar para análise" })).toBeTruthy());
  });
});

describe("já aprovado (vínculo único)", () => {
  it("conta ativa nunca vê o formulário: vai direto para o app, sem pedir o vínculo", async () => {
    backend.sessao.usuario = USUARIO_ATIVO;
    renderApp("/status-cadastro");
    expect(await screen.findByRole("heading", { name: "Início" })).toBeTruthy();
    expect(screen.queryByTestId("campo-arquivo")).toBeNull();
    expect(backend.vezes("POST", "/vinculo")).toBe(0);
  });
});
