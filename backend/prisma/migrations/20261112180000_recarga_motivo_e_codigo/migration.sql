-- Recarga (HU-05): guarda o motivo da recusa (RN-04) e o código de pagamento (para reabrir a tela
-- de pagamento depois de recarregar a página). Colunas opcionais: nada existente é alterado.
ALTER TABLE "cobranca_recarga" ADD COLUMN "motivo_falha" TEXT,
ADD COLUMN "codigo_pagamento" TEXT;

-- Contagem das recargas pendentes de cada usuário.
CREATE INDEX "cobranca_recarga_usuario_id_criada_em_idx" ON "cobranca_recarga"("usuario_id", "criada_em");
