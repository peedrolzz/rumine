import Fastify, { type FastifyError } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import type { Identificador } from "./shared/auth.js";
import { exigirOrigemConfiavel } from "./shared/csrf.js";
import { hojeNoBrasil } from "./shared/data.js";
import { rotasCardapio } from "./modules/cardapio/rotas.js";
import { criarServicoCardapio } from "./modules/cardapio/servico.js";
import type { CardapioRepositorio } from "./modules/cardapio/repositorio.js";
import { criarServicoLogs, type LogsRepositorio } from "./modules/auditoria/consulta.js";
import { criarServicoContas, type ContasRepositorio } from "./modules/mestre/contas.js";
import { rotasMestre } from "./modules/mestre/rotas.js";
import { criarServicoVinculo } from "./modules/vinculo/servico.js";
import { rotasVinculo } from "./modules/vinculo/rotas.js";
import type { VinculoRepositorio } from "./modules/vinculo/repositorio.js";
import type { Armazenamento } from "./shared/armazenamento.js";
import { criarServicoCadastros } from "./modules/cadastros/servico.js";
import { rotasCadastros } from "./modules/cadastros/rotas.js";
import type { CadastrosRepositorio } from "./modules/cadastros/repositorio.js";
import { criarServicoCarteira } from "./modules/carteira/servico.js";
import { rotasCarteira } from "./modules/carteira/rotas.js";
import type { CarteiraRepositorio } from "./modules/carteira/repositorio.js";
import type { GatewayPagamento } from "./modules/recarga/gateway.js";
import type { RecargaRepositorio } from "./modules/recarga/repositorio.js";
import { rotasRecarga, rotasWebhookPagamento } from "./modules/recarga/rotas.js";
import { criarServicoRecarga } from "./modules/recarga/servico.js";
import type { ServicoQr } from "./modules/acesso/qrToken.js";
import { rotasAcesso } from "./modules/acesso/rotas.js";
import { rotasHistorico } from "./modules/historico/rotas.js";
import { criarServicoHistorico } from "./modules/historico/servico.js";
import type { HistoricoRepositorio } from "./modules/historico/repositorio.js";
import { criarEsquemaCadastro, lerDominios } from "./modules/identidade/esquemas.js";
import { criarLimitador, type Limitador } from "./modules/identidade/limitador.js";
import type { IdentidadeRepositorio } from "./modules/identidade/repositorio.js";
import { NOME_COOKIE_SESSAO, rotasIdentidade } from "./modules/identidade/rotas.js";
import { hasherArgon2, type Hasher } from "./modules/identidade/senha.js";
import { criarServicoEmailConsole, type ServicoEmail } from "./modules/identidade/servicoEmail.js";
import { criarServicoIdentidade } from "./modules/identidade/servico.js";

/** Login, cadastro e sessão (HU-01). Só o repositório é obrigatório; o resto tem padrão. */
export type ConfigIdentidade = {
  repo: IdentidadeRepositorio;
  /** Padrão: escreve o e-mail no log (versão de desenvolvimento). */
  email?: ServicoEmail;
  hasher?: Hasher;
  limitador?: Limitador;
  agora?: () => Date;
  /** Padrão: variável DOMINIOS_EMAIL_PERMITIDOS, ou @alunos.utfpr.edu.br. */
  dominios?: string[];
};

/** Área do Mestre (HU-03): criar Admin e Operador e consultar os logs de auditoria. */
export type ConfigMestre = { contasRepo: ContasRepositorio; logsRepo: LogsRepositorio; hasher?: Hasher };

/** Comprovação de vínculo (HU-02): repositório e armazenamento privado dos arquivos. */
export type ConfigVinculo = { repo: VinculoRepositorio; armazenamento: Armazenamento };

/** Recarga por pagamento digital (HU-05): repositório e provedor de pagamento (simulado ou real). */
export type ConfigRecarga = {
  repo: RecargaRepositorio;
  gateway: GatewayPagamento;
  /** Habilita o "simular pagamento" de desenvolvimento. Padrão: só fora de produção. */
  simulacao?: boolean;
  agora?: () => Date;
};

export type Dependencias = {
  cardapioRepo: CardapioRepositorio;
  historicoRepo?: HistoricoRepositorio | undefined;
  identidade?: ConfigIdentidade | undefined;
  mestre?: ConfigMestre | undefined;
  vinculo?: ConfigVinculo | undefined;
  /** Aprovação e rejeição de cadastros pelo Admin (HU-20). */
  cadastrosRepo?: CadastrosRepositorio | undefined;
  /** Saldo da carteira (HU-04). */
  carteiraRepo?: CarteiraRepositorio | undefined;
  recarga?: ConfigRecarga | undefined;
  /** QR Code de acesso (HU-06). */
  qr?: ServicoQr | undefined;
  /**
   * Identificador explícito (DEV_USUARIO ou os testes). Roda depois do cookie de sessão
   * e, se definir o usuário, tem precedência sobre ele.
   */
  identificar?: Identificador | undefined;
  /** Endereço do front: origem aceita no CORS e no CSRF, e base do link do e-mail. */
  origemFrontend?: string;
  /** Data de hoje (aaaa-mm-dd). Injetável para os testes. */
  hoje?: () => string;
  producao?: boolean;
  logger?: boolean;
};

export async function buildApp({
  cardapioRepo,
  historicoRepo,
  identidade,
  mestre,
  vinculo,
  cadastrosRepo,
  carteiraRepo,
  recarga,
  qr,
  identificar,
  origemFrontend = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
  hoje = hojeNoBrasil,
  producao = process.env.NODE_ENV === "production",
  logger = false,
}: Dependencias) {
  // Em produção a API fica atrás do proxy do Fly.io: só aí o IP real vem do cabeçalho do proxy.
  const app = Fastify({ logger, trustProxy: producao });
  await app.register(cors, {
    origin: origemFrontend,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  await app.register(cookie);

  // Erros sempre no formato { mensagem } em português; detalhes internos só no log.
  app.setErrorHandler((erro: FastifyError, request, reply) => {
    const status = erro.statusCode && erro.statusCode >= 400 ? erro.statusCode : 500;
    if (status >= 500) {
      request.log.error(erro);
      return reply.code(500).send({ mensagem: "Erro interno. Tente novamente em instantes." });
    }
    return reply.code(status).send({ mensagem: "Requisição inválida." });
  });

  app.addHook("onRequest", exigirOrigemConfiavel(origemFrontend));

  app.decorateRequest("usuario");
  app.decorateRequest("sessaoExpirada");

  const servicoIdentidade = identidade && montarIdentidade(app, identidade, origemFrontend);
  if (servicoIdentidade) {
    // Descobre o usuário pelo cookie de sessão.
    app.addHook("onRequest", async (request) => {
      const token = request.cookies[NOME_COOKIE_SESSAO];
      if (!token) return;
      const sessao = await servicoIdentidade.servico.identificar(token);
      if (sessao.tipo === "OK") request.usuario = sessao.usuario;
      else if (sessao.tipo === "EXPIRADA") request.sessaoExpirada = true;
    });
  }
  if (identificar) {
    app.addHook("onRequest", async (request) => {
      await identificar(request);
    });
  }

  app.get("/health", async () => ({ status: "ok" }));
  if (servicoIdentidade) {
    await app.register(
      rotasIdentidade(servicoIdentidade.servico, {
        esquemaCadastro: servicoIdentidade.esquemaCadastro,
        producao,
      }),
    );
  }
  await app.register(rotasCardapio(criarServicoCardapio(cardapioRepo), hoje));
  if (historicoRepo) await app.register(rotasHistorico(criarServicoHistorico(historicoRepo)));
  if (vinculo) await app.register(rotasVinculo(criarServicoVinculo(vinculo.repo, vinculo.armazenamento)));
  if (cadastrosRepo) await app.register(rotasCadastros(criarServicoCadastros(cadastrosRepo)));
  if (carteiraRepo) await app.register(rotasCarteira(criarServicoCarteira(carteiraRepo)));
  if (recarga) {
    const servico = criarServicoRecarga({
      repo: recarga.repo,
      gateway: recarga.gateway,
      ...(recarga.agora && { agora: recarga.agora }),
    });
    await app.register(rotasRecarga(servico, { simulacao: recarga.simulacao ?? !producao }));
    await app.register(rotasWebhookPagamento(servico, recarga.gateway));
  }
  if (qr) await app.register(rotasAcesso(qr));
  if (mestre) {
    const contas = criarServicoContas(mestre.contasRepo, mestre.hasher ?? hasherArgon2);
    await app.register(rotasMestre(contas, criarServicoLogs(mestre.logsRepo)));
  }
  return app;
}

function montarIdentidade(app: { log: { info(msg: string): void } }, config: ConfigIdentidade, urlFrontend: string) {
  const agora = config.agora ?? (() => new Date());
  const dominios = config.dominios ?? lerDominios(process.env.DOMINIOS_EMAIL_PERMITIDOS);
  const servico = criarServicoIdentidade({
    repo: config.repo,
    hasher: config.hasher ?? hasherArgon2,
    email: config.email ?? criarServicoEmailConsole((texto) => app.log.info(texto)),
    limitador: config.limitador ?? criarLimitador({ agora: () => agora().getTime() }),
    urlFrontend,
    agora,
  });
  return { servico, esquemaCadastro: criarEsquemaCadastro(dominios) };
}
