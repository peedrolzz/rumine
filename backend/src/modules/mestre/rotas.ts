import type { FastifyInstance } from "fastify";
import { exigirPerfil } from "../../shared/auth.js";
import { validar } from "../../shared/validacao.js";
import { CURSOR_INVALIDO, consultaLogs, type ServicoLogs } from "../auditoria/consulta.js";
import { EMAIL_JA_CADASTRADO, esquemaNovaConta, type ServicoContas } from "./contas.js";

export function rotasMestre(contas: ServicoContas, logs: ServicoLogs) {
  return async (app: FastifyInstance) => {
    const soMestre = { preHandler: exigirPerfil("MESTRE") };

    // Cria Admin ou Operador (HU-03). A ação fica no log com data e autor.
    app.post("/mestre/contas", soMestre, async (request, reply) => {
      const dados = validar(esquemaNovaConta, request.body, reply);
      if (!dados) return;
      const conta = await contas.criar(dados, request.usuario!.id);
      if (conta === EMAIL_JA_CADASTRADO) {
        return reply.code(409).send({ campo: "email", mensagem: "Já existe uma conta com este e-mail." });
      }
      return reply.code(201).send({ id: conta.id, nome: conta.nome, email: conta.email, perfil: conta.perfil });
    });

    // Logs de auditoria, do mais recente para o mais antigo.
    app.get("/mestre/logs", soMestre, async (request, reply) => {
      const consulta = validar(consultaLogs, request.query, reply);
      if (!consulta) return;
      const pagina = await logs.listar(consulta.limite, consulta.cursor);
      if (pagina === CURSOR_INVALIDO) return reply.code(400).send({ campo: "cursor", mensagem: "Cursor inválido." });
      return pagina;
    });
  };
}
