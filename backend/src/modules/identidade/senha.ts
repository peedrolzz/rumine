import { hash, verify } from "@node-rs/argon2";

// Hash de senha (ADR-005, RNF-14). Injetável para os testes usarem uma versão rápida.
export interface Hasher {
  hash(senha: string): Promise<string>;
  verify(hash: string, senha: string): Promise<boolean>;
}

// Argon2id com os parâmetros padrão da biblioteca (memória 19 MiB, 2 passes, 1 thread),
// que são os recomendados pela OWASP. O hash já inclui sal e parâmetros.
export const hasherArgon2: Hasher = {
  hash: (senha) => hash(senha),
  // Hash malformado (ex.: usuário de desenvolvimento do seed) nunca autentica e nunca lança.
  verify: async (hashGuardado, senha) => {
    try {
      return await verify(hashGuardado, senha);
    } catch {
      return false;
    }
  },
};
