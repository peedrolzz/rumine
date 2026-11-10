import { afterEach, describe, expect, it } from "vitest";
import { identificadorDev, USUARIOS_DEV } from "./usuariosDev.js";

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

const usar = (devUsuario: string | undefined, nodeEnv?: string) => {
  if (devUsuario === undefined) delete process.env.DEV_USUARIO;
  else process.env.DEV_USUARIO = devUsuario;
  if (nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = nodeEnv;
  return identificadorDev();
};

describe("identificadorDev", () => {
  it("sem DEV_USUARIO não identifica ninguém", () => {
    expect(usar(undefined)).toBeUndefined();
  });

  it("em produção é desligado, mesmo com DEV_USUARIO definido", () => {
    expect(usar("ADMIN", "production")).toBeUndefined();
  });

  it.each(["admin", "SUPERUSER", "", "toString", "constructor", "__proto__", "hasOwnProperty"])(
    "ignora valor inválido %j",
    (valor) => {
      expect(usar(valor)).toBeUndefined();
    },
  );

  it.each(Object.keys(USUARIOS_DEV))("identifica o perfil %s com o id fixo do seed", async (perfil) => {
    const identificar = usar(perfil, "development")!;
    const request = {} as { usuario?: { id: string; perfil: string } };
    await identificar(request as never);
    expect(request.usuario).toEqual({ id: USUARIOS_DEV[perfil as keyof typeof USUARIOS_DEV], perfil });
  });

  it("cada perfil tem um id diferente", () => {
    const ids = Object.values(USUARIOS_DEV);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
