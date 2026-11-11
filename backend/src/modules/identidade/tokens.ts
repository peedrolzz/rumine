import { createHash, randomBytes } from "node:crypto";

/** Token aleatório de 256 bits, seguro para URL e cookie. Vai para o usuário; nunca para o banco. */
export const gerarToken = () => randomBytes(32).toString("base64url");

/** SHA-256 (hex) do token: é o que se guarda no banco. Um vazamento do banco não revela sessões nem links. */
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
