// Dados mínimos de desenvolvimento: câmpus do MVP e usuários fixos (um por perfil).
import { prisma } from "../src/shared/prisma.js";
import { USUARIOS_DEV } from "../src/shared/usuariosDev.js";
import type { PerfilUsuario } from "../generated/prisma/enums.js";

await prisma.campus.upsert({
  where: { nome: "Dois Vizinhos" },
  create: { nome: "Dois Vizinhos" },
  update: {},
});

for (const [perfil, id] of Object.entries(USUARIOS_DEV) as [PerfilUsuario, string][]) {
  await prisma.usuario.upsert({
    where: { id },
    create: {
      id,
      email: `${perfil.toLowerCase()}@dev.local`,
      senhaHash: "sem-login-dev", // não é um hash válido: ninguém consegue logar com ele
      perfil,
      categoria: "DISCENTE",
      status: "ATIVO",
    },
    update: {},
  });
}
console.log("Seed concluído.");
await prisma.$disconnect();
