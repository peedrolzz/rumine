import { z } from "zod";
import type { CategoriaUsuario } from "../../../generated/prisma/enums.js";

// ---------- e-mail institucional ----------

// No MVP só discentes se cadastram (@alunos.utfpr.edu.br). Docentes, servidores e externos
// entram depois do MVP: aí cada domínio precisa de uma categoria própria.
export const DOMINIOS_PADRAO = ["alunos.utfpr.edu.br"];
export const CATEGORIA_CADASTRO: CategoriaUsuario = "DISCENTE";

/** Lê DOMINIOS_EMAIL_PERMITIDOS ("a.com,b.com"); sem valor, usa o padrão do MVP. */
export function lerDominios(valor: string | undefined): string[] {
  const lista = (valor ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  return lista.length > 0 ? lista : DOMINIOS_PADRAO;
}

// ---------- senha ----------

export const SENHA_MAX = 128;

// Regras da senha (ADR-005): mínimo de 8 caracteres, um número e um caractere especial.
export const REGRAS_SENHA = [
  { id: "tamanho", mensagem: "A senha precisa ter pelo menos 8 caracteres.", ok: (s: string) => s.length >= 8 },
  { id: "numero", mensagem: "A senha precisa ter pelo menos um número.", ok: (s: string) => /\d/.test(s) },
  {
    id: "especial",
    mensagem: "A senha precisa ter pelo menos um caractere especial (por exemplo: ! @ # $ %).",
    ok: (s: string) => /[^\p{L}\p{N}\s]/u.test(s),
  },
] as const;

/** Mensagem da primeira regra que a senha não cumpre, ou undefined se estiver tudo certo. */
export const primeiraRegraQuebrada = (senha: string) => REGRAS_SENHA.find((r) => !r.ok(senha))?.mensagem;

// ---------- entradas das rotas ----------

export function criarEsquemaCadastro(dominios: string[]) {
  const dominiosTexto = dominios.map((d) => `@${d}`).join(" ou ");
  return z.object({
    nome: z
      .string({ error: "Informe seu nome." })
      .trim()
      .min(3, "Informe seu nome completo.")
      .max(100, "O nome pode ter no máximo 100 caracteres."),
    email: z
      .string({ error: "Informe seu e-mail." })
      .trim()
      .toLowerCase()
      .max(254, "O e-mail é longo demais.")
      .pipe(z.email("Informe um e-mail válido."))
      .refine((e) => dominios.includes(e.split("@")[1] ?? ""), `Use seu e-mail institucional (${dominiosTexto}).`),
    senha: z
      .string({ error: "Informe uma senha." })
      .max(SENHA_MAX, `A senha pode ter no máximo ${SENHA_MAX} caracteres.`)
      .superRefine((senha, ctx) => {
        const mensagem = primeiraRegraQuebrada(senha);
        if (mensagem) ctx.addIssue({ code: "custom", message: mensagem });
      }),
  }, { error: "Corpo da requisição inválido." });
}

const MSG_LOGIN = "Informe e-mail e senha.";

// No login a senha não é validada contra a política: só precisa existir (e não ser enorme).
export const esquemaLogin = z.object(
  {
    email: z.string({ error: MSG_LOGIN }).trim().toLowerCase().min(1, MSG_LOGIN).max(254, MSG_LOGIN),
    senha: z.string({ error: MSG_LOGIN }).min(1, MSG_LOGIN).max(1024, MSG_LOGIN),
  },
  { error: MSG_LOGIN },
);

const MSG_LINK = "Link de confirmação inválido.";
export const esquemaConfirmacao = z.object(
  { token: z.string({ error: MSG_LINK }).min(1, MSG_LINK).max(200, MSG_LINK) },
  { error: MSG_LINK },
);

export type DadosCadastro = z.infer<ReturnType<typeof criarEsquemaCadastro>>;
