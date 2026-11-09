-- CreateEnum
CREATE TYPE "perfil_usuario" AS ENUM ('USUARIO', 'OPERADOR', 'ADMIN', 'MESTRE');

-- CreateEnum
CREATE TYPE "categoria_usuario" AS ENUM ('DISCENTE', 'DOCENTE', 'SERVIDOR', 'VISITANTE');

-- CreateEnum
CREATE TYPE "status_usuario" AS ENUM ('PENDENTE_EMAIL', 'PENDENTE_APROVACAO', 'ATIVO', 'REJEITADO', 'DESATIVADO');

-- CreateEnum
CREATE TYPE "tipo_transacao" AS ENUM ('RECARGA', 'DEBITO_REFEICAO', 'ESTORNO');

-- CreateEnum
CREATE TYPE "status_cobranca" AS ENUM ('PENDENTE', 'CONFIRMADA', 'RECUSADA', 'EXPIRADA');

-- CreateEnum
CREATE TYPE "decisao_cadastro" AS ENUM ('APROVADO', 'REJEITADO');

-- CreateEnum
CREATE TYPE "categoria_preco" AS ENUM ('ESTUDANTE', 'PAE', 'SERVIDOR', 'VISITANTE');

-- CreateEnum
CREATE TYPE "resultado_leitura" AS ENUM ('LIBERADO', 'NEGADO_SALDO', 'NEGADO_TOKEN_INVALIDO', 'NEGADO_TOKEN_EXPIRADO', 'NEGADO_TOKEN_USADO', 'NEGADO_CADASTRO_INATIVO');

-- CreateEnum
CREATE TYPE "envio_utfpr" AS ENUM ('PENDENTE', 'ENVIADO', 'FALHA');

-- CreateTable
CREATE TABLE "usuario" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "perfil" "perfil_usuario" NOT NULL,
    "categoria" "categoria_usuario" NOT NULL,
    "identificador" TEXT,
    "status" "status_usuario" NOT NULL,
    "pae" BOOLEAN NOT NULL DEFAULT false,
    "ultima_autenticacao" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carteira" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "saldo_centavos" INTEGER NOT NULL,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "carteira_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transacao" (
    "id" UUID NOT NULL,
    "carteira_id" UUID NOT NULL,
    "tipo" "tipo_transacao" NOT NULL,
    "valor_centavos" INTEGER NOT NULL,
    "saldo_apos_centavos" INTEGER NOT NULL,
    "criada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cobranca_recarga" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "valor_centavos" INTEGER NOT NULL,
    "status" "status_cobranca" NOT NULL,
    "provedor" TEXT NOT NULL,
    "id_externo" TEXT NOT NULL,
    "transacao_id" UUID,
    "criada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmada_em" TIMESTAMP(3),

    CONSTRAINT "cobranca_recarga_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "declaracao" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "arquivo_chave" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamanho_bytes" INTEGER NOT NULL,
    "enviada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "declaracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analise_cadastro" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "declaracao_id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "decisao" "decisao_cadastro" NOT NULL,
    "motivo" TEXT,
    "decidida_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analise_cadastro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campus" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "campus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preco_refeicao" (
    "id" UUID NOT NULL,
    "campus_id" UUID NOT NULL,
    "categoria_preco" "categoria_preco" NOT NULL,
    "valor_centavos" INTEGER NOT NULL,
    "vigente_desde" DATE NOT NULL,

    CONSTRAINT "preco_refeicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cardapio" (
    "id" UUID NOT NULL,
    "campus_id" UUID NOT NULL,
    "data" DATE NOT NULL,
    "publicado_por" UUID NOT NULL,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cardapio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_cardapio" (
    "id" UUID NOT NULL,
    "cardapio_id" UUID NOT NULL,
    "categoria" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,

    CONSTRAINT "item_cardapio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leitura_acesso" (
    "id" UUID NOT NULL,
    "usuario_id" UUID,
    "operador_id" UUID NOT NULL,
    "campus_id" UUID NOT NULL,
    "token_jti" TEXT NOT NULL,
    "resultado" "resultado_leitura" NOT NULL,
    "lida_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leitura_acesso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumo" (
    "id" UUID NOT NULL,
    "leitura_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "valor_cobrado_centavos" INTEGER NOT NULL,
    "categoria_preco" "categoria_preco" NOT NULL,
    "transacao_id" UUID,
    "envio_utfpr" "envio_utfpr" NOT NULL,
    "consumido_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log_auditoria" (
    "id" UUID NOT NULL,
    "ator_id" UUID,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidade_id" TEXT,
    "detalhes" JSONB,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "log_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_email_key" ON "usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_identificador_key" ON "usuario"("identificador");

-- CreateIndex
CREATE UNIQUE INDEX "carteira_usuario_id_key" ON "carteira"("usuario_id");

-- CreateIndex
CREATE INDEX "transacao_carteira_id_criada_em_idx" ON "transacao"("carteira_id", "criada_em");

-- CreateIndex
CREATE UNIQUE INDEX "cobranca_recarga_id_externo_key" ON "cobranca_recarga"("id_externo");

-- CreateIndex
CREATE UNIQUE INDEX "cobranca_recarga_transacao_id_key" ON "cobranca_recarga"("transacao_id");

-- CreateIndex
CREATE UNIQUE INDEX "campus_nome_key" ON "campus"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "cardapio_campus_id_data_key" ON "cardapio"("campus_id", "data");

-- CreateIndex
CREATE UNIQUE INDEX "leitura_acesso_token_jti_key" ON "leitura_acesso"("token_jti");

-- CreateIndex
CREATE UNIQUE INDEX "consumo_leitura_id_key" ON "consumo"("leitura_id");

-- CreateIndex
CREATE UNIQUE INDEX "consumo_transacao_id_key" ON "consumo"("transacao_id");

-- AddForeignKey
ALTER TABLE "carteira" ADD CONSTRAINT "carteira_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacao" ADD CONSTRAINT "transacao_carteira_id_fkey" FOREIGN KEY ("carteira_id") REFERENCES "carteira"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobranca_recarga" ADD CONSTRAINT "cobranca_recarga_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobranca_recarga" ADD CONSTRAINT "cobranca_recarga_transacao_id_fkey" FOREIGN KEY ("transacao_id") REFERENCES "transacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declaracao" ADD CONSTRAINT "declaracao_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analise_cadastro" ADD CONSTRAINT "analise_cadastro_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analise_cadastro" ADD CONSTRAINT "analise_cadastro_declaracao_id_fkey" FOREIGN KEY ("declaracao_id") REFERENCES "declaracao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analise_cadastro" ADD CONSTRAINT "analise_cadastro_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preco_refeicao" ADD CONSTRAINT "preco_refeicao_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cardapio" ADD CONSTRAINT "cardapio_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cardapio" ADD CONSTRAINT "cardapio_publicado_por_fkey" FOREIGN KEY ("publicado_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_cardapio" ADD CONSTRAINT "item_cardapio_cardapio_id_fkey" FOREIGN KEY ("cardapio_id") REFERENCES "cardapio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leitura_acesso" ADD CONSTRAINT "leitura_acesso_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leitura_acesso" ADD CONSTRAINT "leitura_acesso_operador_id_fkey" FOREIGN KEY ("operador_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leitura_acesso" ADD CONSTRAINT "leitura_acesso_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumo" ADD CONSTRAINT "consumo_leitura_id_fkey" FOREIGN KEY ("leitura_id") REFERENCES "leitura_acesso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumo" ADD CONSTRAINT "consumo_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumo" ADD CONSTRAINT "consumo_transacao_id_fkey" FOREIGN KEY ("transacao_id") REFERENCES "transacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log_auditoria" ADD CONSTRAINT "log_auditoria_ator_id_fkey" FOREIGN KEY ("ator_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE carteira ADD CONSTRAINT carteira_saldo_nao_negativo CHECK (saldo_centavos >= 0);