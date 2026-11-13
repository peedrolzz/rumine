# RU Mine: uma imagem só (API + app compilado), para o Fly.io. Veja o README, "Publicar no Fly.io".

# ---- 1) Compila o frontend. VITE_API_URL vazio = mesma origem (a API serve o app).
FROM node:26-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
ENV VITE_API_URL=""
RUN npm run build

# ---- 2) Imagem final: backend (roda com tsx, sem etapa de build) + frontend compilado.
FROM node:26-slim
# openssl: exigido pelo motor de migrações do Prisma. util-linux (runuser) já vem na imagem.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend

# As dependências de desenvolvimento ficam: a API roda com tsx e as migrações usam a CLI do Prisma.
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ ./
# O client do Prisma não vai para o Git: é gerado aqui (o banco não é acessado; a URL é só de enfeite).
RUN DATABASE_URL=postgresql://x:x@localhost:5432/x npx prisma generate
COPY --from=frontend /app/frontend/dist /app/frontend-dist
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV NODE_ENV=production \
    PORT=8080 \
    FRONTEND_DIST=/app/frontend-dist \
    ARMAZENAMENTO_DIR=/data/declaracoes
EXPOSE 8080
# O entrypoint prepara o volume (/data) e passa a rodar como usuário comum ("node").
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npx", "tsx", "src/server.ts"]
