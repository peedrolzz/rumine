// Regras da senha (ADR-005). Espelham as do backend (backend/src/modules/identidade/esquemas.ts):
// o servidor é quem decide, e o front só mostra ao vivo o que falta.
export const SENHA_MAX = 128;

export const REGRAS_SENHA = [
  {
    id: "tamanho",
    texto: "Pelo menos 8 caracteres",
    mensagem: "A senha precisa ter pelo menos 8 caracteres.",
    ok: (s: string) => s.length >= 8,
  },
  {
    id: "numero",
    texto: "Pelo menos um número",
    mensagem: "A senha precisa ter pelo menos um número.",
    ok: (s: string) => /\d/.test(s),
  },
  {
    id: "especial",
    texto: "Pelo menos um caractere especial (! @ # $ %)",
    mensagem: "A senha precisa ter pelo menos um caractere especial (por exemplo: ! @ # $ %).",
    // Letras (inclusive acentuadas), dígitos e espaços não contam como especiais.
    ok: (s: string) => /[^\p{L}\p{N}\s]/u.test(s),
  },
] as const;

/** Mensagem da primeira regra que a senha não cumpre, ou undefined se cumprir todas. */
export const primeiraRegraQuebrada = (senha: string) => REGRAS_SENHA.find((r) => !r.ok(senha))?.mensagem;
