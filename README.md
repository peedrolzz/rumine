# RU Mine

Sistema para agilizar o uso do Restaurante Universitário da UTFPR: o usuário recarrega a carteira pelo celular, apresenta um QR Code na entrada e o consumo é debitado e registrado automaticamente.

> Projeto da disciplina de Arquitetura de Software (UTFPR, câmpus Dois Vizinhos). Status: arquitetura definida; MVP em desenvolvimento.

## O problema

Nos RUs, a compra presencial de fichas, a conferência manual de pagamentos e a validação lenta na entrada geram filas longas e incerteza sobre saldo, cardápio e lotação. O RU Mine busca devolver tempo e previsibilidade a discentes, docentes e servidores.

## Como funciona

1. O usuário se cadastra com o e-mail institucional e senha própria e comprova o vínculo com a UTFPR uma única vez (RA ou SIAPE e declaração de matrícula), com aprovação do Admin.
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
| Autenticação | Senha com Argon2; sessão em cookie `HttpOnly`; QR Code com JWT de 30 s |
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

## Como executar

Pré-requisitos: Node.js LTS, Docker Desktop (aberto) e Git. O passo a passo completo está no [CONTRIBUTING.md](CONTRIBUTING.md).

```bash
# 1. Banco de dados (na raiz do projeto)
docker compose up -d db

# 2. Backend (terminal 1)
cd backend
copy .env.example .env      # Mac/Linux: cp .env.example .env
npm install
npx prisma migrate dev
npm run dev                 # http://localhost:3000/health

# 3. Frontend (terminal 2)
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

## Equipe

| Integrante | Papel |
|---|---|
| Enzo Raitz | P.O. / Scrum Master |
| Bernardo Cecconi Pereira | Arquiteto |
| Gustavo Rafael Quisini | Backend |
| Lucas da Motta Poncio | Frontend / UX |
| Pedro Lazzarin | QA / DevOps |

Professor: franciscosouza@professores.utfpr.edu.br
