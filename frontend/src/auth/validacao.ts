import { primeiraRegraQuebrada, SENHA_MAX } from "./senha";

export type CamposCadastro = { nome: string; email: string; senha: string };
export type ErrosCadastro = Partial<Record<keyof CamposCadastro, string>>;

// Formato básico de e-mail. O domínio institucional quem confere é o servidor, e a mensagem
// dele aparece no campo (assim o front não precisa manter uma lista de domínios).
const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Confere o que dá para conferir no aparelho antes de enviar o cadastro. */
export function validarCadastro({ nome, email, senha }: CamposCadastro): ErrosCadastro {
  const erros: ErrosCadastro = {};
  if (nome.trim().length < 3) erros.nome = "Informe seu nome completo.";
  const emailLimpo = email.trim();
  if (!emailLimpo) erros.email = "Informe seu e-mail.";
  else if (!FORMATO_EMAIL.test(emailLimpo)) erros.email = "Informe um e-mail válido.";
  if (senha.length > SENHA_MAX) erros.senha = `A senha pode ter no máximo ${SENHA_MAX} caracteres.`;
  else {
    const regra = primeiraRegraQuebrada(senha);
    if (regra) erros.senha = regra;
  }
  return erros;
}
