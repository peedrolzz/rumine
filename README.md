# RU Mine

Sistema para agilizar o uso do Restaurante Universitário da UTFPR: o usuário recarrega a carteira pelo celular, apresenta um QR Code na entrada e o consumo é debitado e registrado automaticamente.

> Projeto da disciplina de Arquitetura de Software (UTFPR, câmpus Dois Vizinhos). Status: arquitetura definida; MVP em desenvolvimento.

## O problema

Nos RUs, a compra presencial de fichas, a conferência manual de pagamentos e a validação lenta na entrada geram filas longas e incerteza sobre saldo, cardápio e lotação. O RU Mine busca devolver tempo e previsibilidade a discentes, docentes e servidores.

## Como funciona

1. O usuário se cadastra com o e-mail institucional e senha própria e comprova o vínculo com a UTFPR uma única vez (RA ou SIAPE e declaração de matrícula), com aprovação do Admin. No MVP, o cadastro aceita só o e-mail de discentes (`@alunos.utfpr.edu.br`); docentes, servidores e externos ficam para depois.
2. Recarrega a carteira por Pix e acompanha o saldo e o histórico.
3. Na entrada, apresenta um QR Code de 30 segundos; o operador o lê com a câmera e o sistema libera o acesso, debita a refeição e registra o consumo.
4. O Admin publica o cardápio e acompanha o histórico geral.

## Escopo do MVP

- Cadastro, login e aprovação de vínculo
- Carteira: saldo e recarga
- QR Code, leitura pelo operador e débito no acesso
- Histórico de pagamentos e consumo
- Cardápio

Fora do MVP (planejado): fluxo/lotação em tempo real, contestação de cobranças, cartão físico e integração real com os sistemas da UTFPR (no MVP, o envio de consumo usa um adaptador simulado).

## Perfis

Usuário · Operador · Admin · Mestre (responsáveis técnicos)

## Arquitetura

Monolito modular em TypeScript, com uma API (Fastify), uma PWA (React) e um banco PostgreSQL. As integrações externas ficam atrás de interfaces (pagamento, e-mail, arquivos e UTFPR), com versão simulada para testes.
Detalhes: Mais informações em [`documentos/`](documentos/).

## Tecnologias

| Camada | Escolha |
|---|---|
| Linguagem | TypeScript |
| Backend | Fastify, com módulos manuais |
| Frontend | React + Vite, PWA |
| Banco | PostgreSQL (Fly Postgres, região GRU) com Prisma |
| Autenticação | Senha com Argon2id (`@node-rs/argon2`); sessão em tabela, com cookie `HttpOnly` e validade de 45 dias; QR Code com JWT de 30 s |
| Arquivos | Supabase Storage (bucket privado) |
| E-mail | Resend |
| Pagamento | Mercado Pago (sandbox), via webhook |
| Testes | Vitest ou Jest (API) e Playwright (ponta a ponta) |
| Contêiner e deploy | Docker + Fly.io |
| Integração contínua | GitHub Actions |
| Gestão | [GitHub Projects](https://github.com/users/peedrolzz/projects/3) |

## Documentação

| Etapa | Conteúdo |
|---|---|
| Semana 0 | Definição do problema e demanda |
| Semana 1 | Regras de negócio, usuários e organização |
| Semana 2 | Épicos, histórias de usuário, tarefas, requisitos funcionais e não funcionais |
| Semana 3 | Arquitetura (C4), ADRs, modelo de dados e escolha das tecnologias |


## Semanas 4 e 5: desenvolvimento do MVP

Entregáveis finais:

1. **Documentação:** requisitos funcionais e não funcionais, diagramas arquiteturais e a configuração da ferramenta de gerenciamento (GitHub Projects).
2. **Desenvolvimento:** pelo menos cinco funcionalidades completas, com backend, frontend, banco de dados e versionamento neste repositório.
3. **Deploy:** publicação no Fly.io, com registro dos procedimentos de operação (opcional).

Como o trabalho está organizado:

- As funcionalidades do MVP correspondem aos épicos E1 a E5; cada uma é entregue de ponta a ponta (API, interface, banco e testes).
- O trabalho é feito em branches por tarefa e pull requests que fecham as issues do quadro (`Closes #N`).
- O deploy e a integração contínua são configurados desde o início do desenvolvimento.

## Como executar

Pré-requisitos: Node.js 26, Docker Desktop (aberto) e Git. O passo a passo completo, inclusive como testar cadastro e login, está no [CONTRIBUTING.md](CONTRIBUTING.md).

```bash
# 1. Banco de dados (na raiz do projeto)
docker compose up -d db

# 2. Backend (terminal 1)
cd backend
copy .env.example .env      # Mac/Linux: cp .env.example .env
npm install
npx prisma migrate dev
npm run seed                # câmpus e usuários de exemplo
npm run criar-mestre -- "Seu Nome" voce@exemplo.com   # (opcional) Mestre de verdade; veja o CONTRIBUTING
npm run dev                 # http://localhost:3000/health

# 3. Frontend (terminal 2)
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

## Demonstração para avaliação

Para quem vai avaliar o sistema (local ou publicado), `npm run criar-demo` em `backend/` cria contas prontas, com a senha `Demo@2026` (ou a de `DEMO_SENHA`):

| Perfil | E-mail | O que mostra |
| --- | --- | --- |
| Usuário | `aluno.demo@alunos.utfpr.edu.br` | Cadastro aprovado, saldo de R$ 53,00 e histórico: QR Code, recarga, histórico e cardápio |
| Usuário | `pendente.demo@alunos.utfpr.edu.br` | Cadastro em análise (declaração enviada): o Admin aprova ou rejeita |
| Admin | `admin.demo@rumine.demo` | Cardápio e aprovação de cadastros |
| Operador | `operador.demo@rumine.demo` | Leitura do QR Code |
| Mestre | `mestre.demo@rumine.demo` | Criar contas e consultar os logs |

O script é idempotente (rodar de novo não duplica nem altera nada) e **só roda fora de produção ou com `PAGAMENTO_SIMULACAO_DEMO=true`**, porque as senhas são conhecidas. Variáveis do ambiente publicado: `NODE_ENV=production`, `DATABASE_URL`, `FRONTEND_ORIGIN`, `PAGAMENTO_WEBHOOK_SEGREDO`, `QR_SEGREDO` (mín. 32 caracteres) e `PAGAMENTO_SIMULACAO_DEMO=true`. Rode o script no mesmo servidor da API (a declaração do aluno em análise vai para o armazenamento privado dele). Mais detalhes no [CONTRIBUTING.md](CONTRIBUTING.md).

## Publicar no Fly.io

A publicação usa **um único app** (a API também serve o app compilado, na mesma origem: o cookie de sessão funciona sem CORS) e um **banco Postgres grátis no Neon**. Arquivos: `Dockerfile`, `docker-entrypoint.sh` e `fly.toml`.

1. **Banco (Neon):** crie um projeto Postgres 16 em https://neon.tech e copie a connection string **direta** (sem `-pooler` no host), com `sslmode=require`. Se aparecer `channel_binding=require`, apague esse trecho. O plano grátis suspende o banco após alguns minutos parado: o primeiro acesso depois disso demora cerca de 1 segundo a mais.
2. **App e volume** (uma vez; troque `rumine-utfpr` pelo seu nome, e o mesmo nome em `app` e `FRONTEND_ORIGIN` do `fly.toml`):
   ```powershell
   fly apps create rumine-utfpr
   fly volumes create rumine_dados --region gru --size 1 --app rumine-utfpr
   ```
3. **Segredos** (nunca vão para o Git). Gere os dois segredos aleatórios e informe a connection string do Neon:
   ```powershell
   function novoSegredo { $b = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b) }
   fly secrets set --app rumine-utfpr "DATABASE_URL=<connection string do Neon>" "PAGAMENTO_WEBHOOK_SEGREDO=$(novoSegredo)" "QR_SEGREDO=$(novoSegredo)"
   ```
4. **Publicar:** `fly deploy` (na raiz). O deploy aplica as migrações sozinho (`release_command`).
5. **Contas de demonstração** (uma vez; cria também o câmpus e o preço da refeição, sem os quais nada funciona):
   ```powershell
   fly ssh console --app rumine-utfpr -C "runuser -u node -- npm run criar-demo"
   ```
   As contas e a senha estão em "Demonstração para avaliação".
6. **Conferir:** abra `https://<app>.fly.dev`, entre com a conta do aluno e abra **Mostrar QR Code**. Logs: `fly logs`.

Observações: `PAGAMENTO_SIMULACAO_DEMO=true` (no `fly.toml`) liga o pagamento simulado e é o que autoriza o `criar-demo` em produção; é só para demonstração. A câmera do Operador exige HTTPS, que o Fly já fornece. A máquina fica sempre ligada (o volume prende o app a uma só máquina e o limitador de login é em memória). Para testar a imagem localmente: `docker build -t rumine .`.

## Equipe

| Integrante | Papel |
|---|---|
| Enzo Raitz | P.O. / Scrum Master |
| Bernardo Cecconi Pereira | Arquiteto |
| Gustavo Rafael Quisini | Backend |
| Lucas da Motta Poncio | Frontend / UX |
| Pedro Lazzarin | QA / DevOps |

Professor: franciscosouza@professores.utfpr.edu.br
