-- O saldo nunca fica negativo: o banco recusa qualquer gravação que o deixe abaixo de zero,
-- mesmo que um erro no código tente (regra do projeto, ver CLAUDE.md).
ALTER TABLE "carteira" ADD CONSTRAINT "carteira_saldo_nao_negativo" CHECK ("saldo_centavos" >= 0);
