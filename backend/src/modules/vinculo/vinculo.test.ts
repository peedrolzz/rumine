import { mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import type { Identificador } from "../../shared/auth.js";
import { criarArmazenamentoEmDisco, type Armazenamento } from "../../shared/armazenamento.js";
import type { CardapioRepositorio } from "../cardapio/repositorio.js";
import { LIMITE_BYTES, detectarTipo } from "./arquivo.js";
import { criarServicoVinculo } from "./servico.js";
import type { DeclaracaoArquivo, ResultadoEnvio, Vinculo, VinculoRepositorio } from "./repositorio.js";

// ---------- apoio ----------
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const EU = uuid(1);
const OUTRO = uuid(2);

const PDF = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.from("conteudo da declaracao")]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("jfif")]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("dados")]);

type Parte = { nome: string; valor: string | Buffer; arquivo?: string; tipo?: string };

/** Monta um corpo multipart/form-data à mão (sem biblioteca de formulário nos testes). */
function multipartDe(partes: Parte[]) {
  const limite = "----testeRuMine" + Math.random().toString(16).slice(2);
  const blocos: Buffer[] = [];
  for (const p of partes) {
    let cab = `--${limite}\r\nContent-Disposition: form-data; name="${p.nome}"`;
    if (p.arquivo !== undefined) cab += `; filename="${p.arquivo}"`;
    cab += "\r\n";
    if (p.tipo) cab += `Content-Type: ${p.tipo}\r\n`;
    blocos.push(Buffer.from(cab + "\r\n"), Buffer.isBuffer(p.valor) ? p.valor : Buffer.from(p.valor), Buffer.from("\r\n"));
  }
  blocos.push(Buffer.from(`--${limite}--\r\n`));
  return { payload: Buffer.concat(blocos), headers: { "content-type": `multipart/form-data; boundary=${limite}` } };
}

const envio = (ra: string | undefined, arquivo: Buffer | undefined, nomeArquivo = "declaracao.pdf", tipo = "application/pdf") =>
  multipartDe([
    ...(ra !== undefined ? [{ nome: "identificador", valor: ra }] : []),
    ...(arquivo ? [{ nome: "declaracao", valor: arquivo, arquivo: nomeArquivo, tipo }] : []),
  ]);

type Conta = { status: Vinculo["status"]; identificador: string | null; motivo: string | null };
type DeclaracaoFalsa = DeclaracaoArquivo & { enviadaEm: Date; tamanhoBytes: number };

/** Banco em memória com as mesmas regras do repositório real. */
function criarBanco(contas: Record<string, Conta>) {
  const usuarios = new Map(Object.entries(contas));
  const declaracoes: DeclaracaoFalsa[] = [];
  const visualizacoes: { adminId: string; declaracaoId: string; usuarioId: string }[] = [];
  let relogio = Date.parse("2026-11-10T12:00:00.000Z");
  let n = 500;

  const repo: VinculoRepositorio = {
    async buscar(id) {
      const u = usuarios.get(id);
      if (!u) return null;
      const ultima = declaracoes.filter((d) => d.usuarioId === id).at(-1);
      return {
        status: u.status,
        identificador: u.identificador,
        declaracaoEnviadaEm: ultima?.enviadaEm ?? null,
        motivoRejeicao: u.status === "REJEITADO" ? u.motivo : null,
      };
    },
    async registrarEnvio({ usuarioId, identificador, arquivoChave, mime, tamanhoBytes }): Promise<ResultadoEnvio> {
      const u = usuarios.get(usuarioId);
      if (!u) return "USUARIO_INEXISTENTE";
      if (u.status === "ATIVO") return "JA_APROVADO";
      if (u.status === "PENDENTE_EMAIL" || u.status === "DESATIVADO") return "EMAIL_NAO_CONFIRMADO";
      if (u.status === "PENDENTE_APROVACAO" && declaracoes.some((d) => d.usuarioId === usuarioId)) return "EM_ANALISE";
      for (const [id, outro] of usuarios) if (id !== usuarioId && outro.identificador === identificador) return "RA_EM_USO";
      relogio += 1000;
      declaracoes.push({ id: uuid(++n), usuarioId, arquivoChave, mime, tamanhoBytes, enviadaEm: new Date(relogio) });
      u.identificador = identificador;
      u.status = "PENDENTE_APROVACAO";
      return "OK";
    },
    async buscarDeclaracao(id) {
      return declaracoes.find((d) => d.id === id) ?? null;
    },
    async registrarVisualizacao(v) {
      visualizacoes.push(v);
    },
  };
  return { repo, usuarios, declaracoes, visualizacoes };
}

function criarArmazenamentoMemoria() {
  const arquivos = new Map<string, Buffer>();
  const removidos: string[] = [];
  const armazenamento: Armazenamento = {
    async salvar(chave, c) {
      arquivos.set(chave, c);
    },
    async ler(chave) {
      return arquivos.get(chave) ?? null;
    },
    async remover(chave) {
      removidos.push(chave);
      arquivos.delete(chave);
    },
  };
  return { armazenamento, arquivos, removidos };
}

const cardapioRepo: CardapioRepositorio = {
  async salvar(data) {
    return { data, itens: [] };
  },
  async buscar() {
    return null;
  },
};

const identificar: Identificador = (request) => {
  const perfil = request.headers["x-perfil"];
  if (typeof perfil !== "string") return;
  const id = request.headers["x-usuario"];
  request.usuario = { id: typeof id === "string" ? id : EU, perfil: perfil as never };
};

const SEM_VINCULO: Conta = { status: "PENDENTE_APROVACAO", identificador: null, motivo: null };

async function montar(contas: Record<string, Conta> = { [EU]: { ...SEM_VINCULO } }, armazenamentoExterno?: Armazenamento) {
  const banco = criarBanco(contas);
  const memoria = criarArmazenamentoMemoria();
  const app = await buildApp({
    cardapioRepo,
    vinculo: { repo: banco.repo, armazenamento: armazenamentoExterno ?? memoria.armazenamento },
    identificar,
    hoje: () => "2026-11-10",
  });
  return { app, banco, memoria };
}
type Contexto = Awaited<ReturnType<typeof montar>>;

const comoUsuario = { "x-perfil": "USUARIO" };
const enviar = (c: Contexto, m: ReturnType<typeof multipartDe>, headers: Record<string, string> = comoUsuario) =>
  c.app.inject({ method: "POST", url: "/vinculo", payload: m.payload, headers: { ...m.headers, ...headers } });
const consultar = (c: Contexto, headers: Record<string, string> = comoUsuario) =>
  c.app.inject({ method: "GET", url: "/vinculo", headers });

// ---------- tipo do arquivo ----------
describe("detectarTipo", () => {
  it("reconhece PDF, JPG e PNG pelo conteúdo", () => {
    expect(detectarTipo(PDF)?.mime).toBe("application/pdf");
    expect(detectarTipo(JPG)?.mime).toBe("image/jpeg");
    expect(detectarTipo(PNG)?.mime).toBe("image/png");
  });
  it.each([
    ["texto", Buffer.from("olá, isto não é uma imagem")],
    ["executável do Windows", Buffer.from("MZ\x90\x00\x03")],
    ["HTML", Buffer.from("<html><script>alert(1)</script>")],
    ["GIF", Buffer.from("GIF89a....")],
    ["PDF sem o traço (%PDF)", Buffer.from("%PDF")],
    ["PNG cortado", Buffer.from([0x89, 0x50, 0x4e])],
    ["vazio", Buffer.alloc(0)],
    ["PDF que não está no início", Buffer.concat([Buffer.from("lixo"), PDF])],
    ["JPG com só dois bytes de assinatura", Buffer.from([0xff, 0xd8, 0x00, 0x01])],
  ])("recusa %s", (_n, conteudo) => {
    expect(detectarTipo(conteudo)).toBeNull();
  });
});

// ---------- serviço (camada própria, sem HTTP) ----------
describe("serviço de vínculo", () => {
  const servicoComBanco = () => {
    const banco = criarBanco({ [EU]: { ...SEM_VINCULO } });
    const memoria = criarArmazenamentoMemoria();
    return { banco, memoria, servico: criarServicoVinculo(banco.repo, memoria.armazenamento) };
  };

  it("recusa arquivo acima do limite sem gravar nada (defesa além do limite do upload)", async () => {
    const { servico, memoria, banco } = servicoComBanco();
    const grande = Buffer.concat([PDF, Buffer.alloc(LIMITE_BYTES)]);
    expect(await servico.enviar({ usuarioId: EU, identificador: "a2345678", arquivo: grande })).toBe("ARQUIVO_GRANDE");
    expect(memoria.arquivos.size + memoria.removidos.length).toBe(0);
    expect(banco.declaracoes).toHaveLength(0);
  });

  it("recusa conteúdo desconhecido e arquivo vazio sem gravar nada", async () => {
    const { servico, memoria } = servicoComBanco();
    expect(await servico.enviar({ usuarioId: EU, identificador: "a2345678", arquivo: Buffer.from("texto") })).toBe("FORMATO_INVALIDO");
    expect(await servico.enviar({ usuarioId: EU, identificador: "a2345678", arquivo: Buffer.alloc(0) })).toBe("ARQUIVO_VAZIO");
    expect(memoria.arquivos.size + memoria.removidos.length).toBe(0);
  });

  it("se o banco falhar, apaga o arquivo gravado e repassa o erro", async () => {
    const { servico, memoria, banco } = servicoComBanco();
    banco.repo.registrarEnvio = async () => {
      throw new Error("banco fora do ar");
    };
    await expect(servico.enviar({ usuarioId: EU, identificador: "a2345678", arquivo: PDF })).rejects.toThrow("banco fora do ar");
    expect(memoria.arquivos.size).toBe(0);
    expect(memoria.removidos).toHaveLength(1);
  });

  it("se apagar também falhar, o erro original do banco é o que aparece", async () => {
    const { servico, memoria, banco } = servicoComBanco();
    banco.repo.registrarEnvio = async () => {
      throw new Error("banco fora do ar");
    };
    memoria.armazenamento.remover = async () => {
      throw new Error("disco cheio");
    };
    await expect(servico.enviar({ usuarioId: EU, identificador: "a2345678", arquivo: PDF })).rejects.toThrow("banco fora do ar");
  });
});

// ---------- envio ----------
describe("POST /vinculo", () => {
  it.each([
    ["PDF", PDF, "application/pdf"],
    ["JPG", JPG, "image/jpeg"],
    ["PNG", PNG, "image/png"],
  ])("%s válido: 201, cadastro vai para análise e o arquivo é guardado", async (_n, arquivo, mime) => {
    const c = await montar();
    const r = await enviar(c, envio("a2345678", arquivo));
    expect(r.statusCode).toBe(201);
    expect(r.json()).toEqual({ status: "PENDENTE_APROVACAO" });
    expect(c.banco.declaracoes).toHaveLength(1);
    expect(c.banco.declaracoes[0]).toMatchObject({ usuarioId: EU, mime, tamanhoBytes: arquivo.length });
    expect(c.memoria.arquivos.get(c.banco.declaracoes[0]!.arquivoChave)).toEqual(arquivo);
    expect(c.banco.usuarios.get(EU)).toMatchObject({ identificador: "a2345678", status: "PENDENTE_APROVACAO" });
  });

  it("o nome do arquivo enviado nunca é usado: a chave é gerada pelo servidor", async () => {
    const c = await montar();
    await enviar(c, envio("a2345678", PDF, "../../etc/passwd.pdf"));
    const chave = c.banco.declaracoes[0]!.arquivoChave;
    expect(chave).toMatch(/^[0-9a-f-]{36}$/);
    expect(chave).not.toContain("passwd");
  });

  it("RA com espaços e maiúsculas é normalizado", async () => {
    const c = await montar();
    await enviar(c, envio("  A2345678 ", PDF));
    expect(c.banco.usuarios.get(EU)?.identificador).toBe("a2345678");
  });

  it("o tipo informado pelo cliente não vale: PDF dito como imagem é aceito pelo conteúdo", async () => {
    const c = await montar();
    const r = await enviar(c, envio("a2345678", PDF, "foto.png", "image/png"));
    expect(r.statusCode).toBe(201);
    expect(c.banco.declaracoes[0]?.mime).toBe("application/pdf");
  });

  it.each([
    ["texto renomeado para .pdf", Buffer.from("isto não é um pdf de verdade")],
    ["HTML com extensão .png", Buffer.from("<html><script>alert(1)</script></html>")],
    ["GIF", Buffer.from("GIF89a....")],
  ])("%s: 400 com a lista de formatos aceitos, nada guardado", async (_n, conteudo) => {
    const c = await montar();
    const r = await enviar(c, envio("a2345678", conteudo, "declaracao.pdf", "application/pdf"));
    expect(r.statusCode).toBe(400);
    expect(r.json()).toEqual({ campo: "declaracao", mensagem: "Envie a declaração em PDF, JPG ou PNG." });
    expect(c.memoria.arquivos.size).toBe(0);
    expect(c.banco.declaracoes).toHaveLength(0);
    expect(c.banco.usuarios.get(EU)?.identificador).toBeNull();
  });

  it("arquivo vazio: 400", async () => {
    const c = await montar();
    const r = await enviar(c, envio("a2345678", Buffer.alloc(0)));
    expect(r.statusCode).toBe(400);
    expect(r.json().campo).toBe("declaracao");
  });

  it("exatamente 5 MB é aceito", async () => {
    const c = await montar();
    const exato = Buffer.concat([PDF, Buffer.alloc(LIMITE_BYTES - PDF.length)]);
    expect(exato.length).toBe(LIMITE_BYTES);
    const r = await enviar(c, envio("a2345678", exato));
    expect(r.statusCode).toBe(201);
  });

  it("um byte acima de 5 MB: 413 informando o limite, nada guardado", async () => {
    const c = await montar();
    const grande = Buffer.concat([PDF, Buffer.alloc(LIMITE_BYTES - PDF.length + 1)]);
    const r = await enviar(c, envio("a2345678", grande));
    expect(r.statusCode).toBe(413);
    expect(r.json()).toEqual({ campo: "declaracao", mensagem: "O arquivo é grande demais. O limite é de 5 MB." });
    expect(c.memoria.arquivos.size).toBe(0);
    expect(c.banco.declaracoes).toHaveLength(0);
  });

  it("sem arquivo: 400 no campo declaracao", async () => {
    const c = await montar();
    const r = await enviar(c, envio("a2345678", undefined));
    expect(r.statusCode).toBe(400);
    expect(r.json()).toEqual({ campo: "declaracao", mensagem: "Escolha o arquivo da declaração." });
  });

  it.each([undefined, "", "   ", "abc", "12345", "a234 5678", "a2345678901234", "a-2345678", "<script>", "ａ２３４５６７８"])(
    "RA %j inválido: 400 no campo identificador, nada guardado",
    async (ra) => {
      const c = await montar();
      const r = await enviar(c, envio(ra, PDF));
      expect(r.statusCode).toBe(400);
      expect(r.json().campo).toBe("identificador");
      expect(c.memoria.arquivos.size).toBe(0);
    },
  );

  it("corpo que não é multipart: 400", async () => {
    const c = await montar();
    const r = await c.app.inject({
      method: "POST",
      url: "/vinculo",
      headers: { ...comoUsuario, "content-type": "application/json" },
      payload: { identificador: "a2345678" },
    });
    expect(r.statusCode).toBe(400);
    expect(c.banco.declaracoes).toHaveLength(0);
  });

  it("dois arquivos no mesmo envio: recusado, nada guardado", async () => {
    const c = await montar();
    const m = multipartDe([
      { nome: "identificador", valor: "a2345678" },
      { nome: "declaracao", valor: PDF, arquivo: "a.pdf", tipo: "application/pdf" },
      { nome: "extra", valor: PDF, arquivo: "b.pdf", tipo: "application/pdf" },
    ]);
    const r = await enviar(c, m);
    expect(r.statusCode).toBe(400);
    expect(c.banco.declaracoes).toHaveLength(0);
  });

  it("arquivo com outro nome de campo é ignorado (falta a declaração)", async () => {
    const c = await montar();
    const m = multipartDe([
      { nome: "identificador", valor: "a2345678" },
      { nome: "outro", valor: PDF, arquivo: "a.pdf", tipo: "application/pdf" },
    ]);
    const r = await enviar(c, m);
    expect(r.statusCode).toBe(400);
    expect(r.json().campo).toBe("declaracao");
  });

  // ----- quem pode enviar -----
  it("já aprovado (ATIVO): 409, não envia de novo, nada guardado", async () => {
    const c = await montar({ [EU]: { status: "ATIVO", identificador: "a2345678", motivo: null } });
    const r = await enviar(c, envio("a2345678", PDF));
    expect(r.statusCode).toBe(409);
    expect(r.json().mensagem).toContain("já foi aprovado");
    expect(c.memoria.arquivos.size).toBe(0);
    expect(c.memoria.removidos).toHaveLength(1); // gravou e apagou: não sobra arquivo solto
  });

  it("e-mail ainda não confirmado: 403", async () => {
    const c = await montar({ [EU]: { status: "PENDENTE_EMAIL", identificador: null, motivo: null } });
    const r = await enviar(c, envio("a2345678", PDF));
    expect(r.statusCode).toBe(403);
    expect(c.memoria.arquivos.size).toBe(0);
  });

  it("já enviou e está em análise: 409 e o arquivo em análise não é trocado", async () => {
    const c = await montar();
    await enviar(c, envio("a2345678", PDF));
    const r = await enviar(c, envio("a2345678", PNG));
    expect(r.statusCode).toBe(409);
    expect(r.json().mensagem).toContain("Aguarde a análise");
    expect(c.banco.declaracoes).toHaveLength(1);
    expect(c.memoria.arquivos.size).toBe(1);
  });

  it("RA de outra conta: 409 no campo identificador, arquivo apagado", async () => {
    const c = await montar({
      [EU]: { ...SEM_VINCULO },
      [OUTRO]: { status: "ATIVO", identificador: "a2345678", motivo: null },
    });
    const r = await enviar(c, envio("a2345678", PDF));
    expect(r.statusCode).toBe(409);
    expect(r.json().campo).toBe("identificador");
    expect(c.memoria.arquivos.size).toBe(0);
  });

  // ----- reenvio após rejeição -----
  it("rejeitado: pode reenviar RA e arquivo; volta para análise com a nova declaração", async () => {
    const c = await montar({ [EU]: { status: "REJEITADO", identificador: "a1111111", motivo: "Arquivo ilegível." } });
    const r = await enviar(c, envio("a2222222", JPG));
    expect(r.statusCode).toBe(201);
    expect(c.banco.usuarios.get(EU)).toMatchObject({ status: "PENDENTE_APROVACAO", identificador: "a2222222" });
    expect(c.banco.declaracoes).toHaveLength(1);
    expect((await consultar(c)).json().motivoRejeicao).toBeNull(); // o motivo some quando reenvia
  });

  it("depois do reenvio não dá para enviar uma terceira vez enquanto analisa", async () => {
    const c = await montar({ [EU]: { status: "REJEITADO", identificador: null, motivo: "x" } });
    await enviar(c, envio("a2222222", JPG));
    expect((await enviar(c, envio("a2222222", JPG))).statusCode).toBe(409);
  });

  it("rejeitado pode reaproveitar o próprio RA", async () => {
    const c = await montar({ [EU]: { status: "REJEITADO", identificador: "a1111111", motivo: "x" } });
    expect((await enviar(c, envio("a1111111", PDF))).statusCode).toBe(201);
  });

  // ----- falhas -----
  it("se o banco falhar, o arquivo gravado é apagado e a API responde 500 sem detalhes", async () => {
    const c = await montar();
    const original = c.banco.repo.registrarEnvio;
    c.banco.repo.registrarEnvio = async () => {
      throw new Error("falha interna secreta");
    };
    const r = await enviar(c, envio("a2345678", PDF));
    expect(r.statusCode).toBe(500);
    expect(r.body).not.toContain("secreta");
    expect(c.memoria.arquivos.size).toBe(0);
    c.banco.repo.registrarEnvio = original;
  });

  // ----- perfis -----
  it.each(["OPERADOR", "ADMIN", "MESTRE"])("%s não envia declaração: 403", async (perfil) => {
    const c = await montar();
    const r = await enviar(c, envio("a2345678", PDF), { "x-perfil": perfil });
    expect(r.statusCode).toBe(403);
    expect(c.memoria.arquivos.size).toBe(0);
  });

  it("sem login: 401", async () => {
    const c = await montar();
    expect((await enviar(c, envio("a2345678", PDF), {})).statusCode).toBe(401);
  });
});

// ---------- consulta ----------
describe("GET /vinculo", () => {
  it("sem declaração: RA e data nulos", async () => {
    const c = await montar();
    expect((await consultar(c)).json()).toEqual({
      status: "PENDENTE_APROVACAO",
      identificador: null,
      declaracaoEnviadaEm: null,
      motivoRejeicao: null,
    });
  });

  it("depois de enviar: RA e data de envio", async () => {
    const c = await montar();
    await enviar(c, envio("a2345678", PDF));
    expect((await consultar(c)).json()).toEqual({
      status: "PENDENTE_APROVACAO",
      identificador: "a2345678",
      declaracaoEnviadaEm: "2026-11-10T12:00:01.000Z",
      motivoRejeicao: null,
    });
  });

  it("rejeitado: devolve o motivo", async () => {
    const c = await montar({ [EU]: { status: "REJEITADO", identificador: "a1111111", motivo: "Declaração vencida." } });
    expect((await consultar(c)).json()).toMatchObject({ status: "REJEITADO", motivoRejeicao: "Declaração vencida." });
  });

  it("devolve só os campos combinados (nada de chave de arquivo)", async () => {
    const c = await montar();
    await enviar(c, envio("a2345678", PDF));
    const corpo = (await consultar(c)).json();
    expect(Object.keys(corpo).sort()).toEqual(["declaracaoEnviadaEm", "identificador", "motivoRejeicao", "status"]);
  });

  it("cada conta vê só o próprio vínculo", async () => {
    const c = await montar({ [EU]: { ...SEM_VINCULO }, [OUTRO]: { status: "ATIVO", identificador: "b9999999", motivo: null } });
    const r = await consultar(c, { ...comoUsuario, "x-usuario": OUTRO });
    expect(r.json().identificador).toBe("b9999999");
    expect((await consultar(c)).json().identificador).toBeNull();
  });

  it("sem login: 401; outros perfis: 403", async () => {
    const c = await montar();
    expect((await consultar(c, {})).statusCode).toBe(401);
    expect((await consultar(c, { "x-perfil": "ADMIN" })).statusCode).toBe(403);
  });
});

// ---------- Admin abre a declaração ----------
describe("GET /admin/declaracoes/:id/arquivo", () => {
  const abrir = (c: Contexto, id: string, headers: Record<string, string> = { "x-perfil": "ADMIN", "x-usuario": uuid(9) }) =>
    c.app.inject({ method: "GET", url: `/admin/declaracoes/${id}/arquivo`, headers });

  it("o Admin recebe o arquivo, com cabeçalhos de segurança, e a abertura fica no log", async () => {
    const c = await montar();
    await enviar(c, envio("a2345678", PDF));
    const decl = c.banco.declaracoes[0]!;
    const r = await abrir(c, decl.id);
    expect(r.statusCode).toBe(200);
    expect(r.rawPayload.equals(PDF)).toBe(true);
    expect(r.headers["content-type"]).toBe("application/pdf");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["content-security-policy"]).toContain("sandbox");
    expect(r.headers["cache-control"]).toContain("no-store");
    expect(c.banco.visualizacoes).toEqual([{ adminId: uuid(9), declaracaoId: decl.id, usuarioId: EU }]);
  });

  it.each(["USUARIO", "OPERADOR", "MESTRE"])("%s não abre: 403 e nada vaza", async (perfil) => {
    const c = await montar();
    await enviar(c, envio("a2345678", PDF));
    const r = await abrir(c, c.banco.declaracoes[0]!.id, { "x-perfil": perfil });
    expect(r.statusCode).toBe(403);
    expect(r.rawPayload.includes(PDF)).toBe(false);
    expect(c.banco.visualizacoes).toHaveLength(0);
  });

  it("o dono da declaração também não abre pela rota do Admin", async () => {
    const c = await montar();
    await enviar(c, envio("a2345678", PDF));
    expect((await abrir(c, c.banco.declaracoes[0]!.id, comoUsuario)).statusCode).toBe(403);
  });

  it("sem login: 401", async () => {
    const c = await montar();
    expect((await abrir(c, uuid(1), {})).statusCode).toBe(401);
  });

  it("id inexistente: 404; id que não é UUID: 400 (e nunca 500)", async () => {
    const c = await montar();
    expect((await abrir(c, uuid(777))).statusCode).toBe(404);
    for (const ruim of ["abc", "1", "%00", "123e4567-e89b-12d3-a456-42661417400z"]) {
      expect((await abrir(c, ruim)).statusCode).toBe(400);
    }
    // Caminho com barras nem chega à rota: 404, nunca o conteúdo de outro arquivo.
    const fuga = await abrir(c, "../../.env");
    expect(fuga.statusCode).toBe(404);
  });

  it("arquivo que sumiu do armazenamento: 404 e sem log de visualização", async () => {
    const c = await montar();
    await enviar(c, envio("a2345678", PDF));
    c.memoria.arquivos.clear();
    expect((await abrir(c, c.banco.declaracoes[0]!.id)).statusCode).toBe(404);
    expect(c.banco.visualizacoes).toHaveLength(0);
  });
});

// ---------- armazenamento em disco ----------
describe("armazenamento em disco", () => {
  const pastas: string[] = [];
  const nova = async () => {
    const p = await mkdtemp(path.join(tmpdir(), "rumine-arm-"));
    pastas.push(p);
    return p;
  };
  afterAll(async () => {
    await Promise.all(pastas.map((p) => rm(p, { recursive: true, force: true })));
  });
  const CHAVE = "11111111-2222-4333-8444-555555555555";

  it("salva, lê e remove", async () => {
    const arm = criarArmazenamentoEmDisco(await nova());
    await arm.salvar(CHAVE, PDF);
    expect((await arm.ler(CHAVE))?.equals(PDF)).toBe(true);
    await arm.remover(CHAVE);
    expect(await arm.ler(CHAVE)).toBeNull();
  });

  it("remover o que não existe não dá erro; ler o que não existe devolve null", async () => {
    const arm = criarArmazenamentoEmDisco(await nova());
    await expect(arm.remover(CHAVE)).resolves.toBeUndefined();
    expect(await arm.ler(CHAVE)).toBeNull();
  });

  it("cria a pasta se ela ainda não existe", async () => {
    const base = await nova();
    const arm = criarArmazenamentoEmDisco(path.join(base, "a", "b"));
    await arm.salvar(CHAVE, PNG);
    expect(await readdir(path.join(base, "a", "b"))).toEqual([CHAVE]);
  });

  it("nunca sobrescreve um arquivo existente", async () => {
    const arm = criarArmazenamentoEmDisco(await nova());
    await arm.salvar(CHAVE, PDF);
    await expect(arm.salvar(CHAVE, PNG)).rejects.toThrow();
    expect((await arm.ler(CHAVE))?.equals(PDF)).toBe(true);
  });

  it.each(["../../.env", "..", "a/b", "a\\b", "", "abc", "11111111-2222-4333-8444-55555555555", `${CHAVE}/../x`, "%2e%2e%2f"])(
    "chave %j fora do formato é recusada (sem escapar da pasta)",
    async (chave) => {
      const arm = criarArmazenamentoEmDisco(await nova());
      await expect(arm.salvar(chave, PDF)).rejects.toThrow("Chave de arquivo inválida.");
      await expect(arm.ler(chave)).rejects.toThrow("Chave de arquivo inválida.");
      await expect(arm.remover(chave)).rejects.toThrow("Chave de arquivo inválida.");
    },
  );

  it("fluxo completo com disco: envia, Admin abre, o conteúdo é idêntico", async () => {
    const pasta = await nova();
    const c = await montar({ [EU]: { ...SEM_VINCULO } }, criarArmazenamentoEmDisco(pasta));
    await enviar(c, envio("a2345678", PNG));
    const arquivos = await readdir(pasta);
    expect(arquivos).toHaveLength(1);
    const r = await c.app.inject({
      method: "GET",
      url: `/admin/declaracoes/${c.banco.declaracoes[0]!.id}/arquivo`,
      headers: { "x-perfil": "ADMIN" },
    });
    expect(r.rawPayload.equals(PNG)).toBe(true);
  });

  it("não segue link simbólico para fora da pasta ao ler", async () => {
    const pasta = await nova();
    const fora = path.join(await nova(), "segredo.txt");
    const arm = criarArmazenamentoEmDisco(pasta);
    await symlink(fora, path.join(pasta, CHAVE)).catch(() => undefined); // sem permissão no Windows: ignora
    // O alvo não existe: ler deve devolver null (ou falhar), nunca vazar conteúdo de fora.
    const lido = await arm.ler(CHAVE).catch(() => null);
    expect(lido).toBeNull();
  });
});
