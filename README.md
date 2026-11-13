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
| Banco | PostgreSQL com Prisma (ADR-009: Fly Postgres, GRU; na demonstração publicada, Neon, por custo) |
| Autenticação | Senha com Argon2id (`@node-rs/argon2`); sessão em tabela, com cookie `HttpOnly` e validade de 45 dias; QR Code com JWT de 30 s |
| Arquivos | Supabase Storage (bucket privado). No MVP: disco atrás da interface `Armazenamento` |
| E-mail | Resend. No MVP: simulado (o link aparece no log do servidor) |
| Pagamento | Provedor simulado no MVP (o Mercado Pago, via webhook, fica como evolução) |
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
- O trabalho é feito em branches por tarefa e pull requests que referenciam as issues do quadro (`Refs #N`; o P.O. move o cartão depois do teste).
- O deploy e a integração contínua são configurados desde o início do desenvolvimento.

## Como executar

Há dois jeitos. Para **testar o sistema**, use o Docker (não precisa instalar Node). Para **desenvolver**, rode backend e frontend à parte. O passo a passo completo está no [CONTRIBUTING.md](CONTRIBUTING.md).

### Testar com Docker (sem instalar Node)

Pré-requisitos: Docker Desktop (aberto) e Git.

```bash
git clone https://github.com/peedrolzz/rumine.git
cd rumine
docker compose up --build
```

Na primeira vez demora alguns minutos (compila a imagem). O app aplica as migrações, cria as contas de demonstração e sobe. Quando aparecer `Server listening`, abra **http://localhost:8080**.

- Cada pessoa tem o **seu próprio banco local**: o teste de um não atrapalha o do outro.
- O e-mail de confirmação de cadastro é simulado: o link aparece nos logs (`docker compose logs app`).
- A câmera do Operador funciona em `http://localhost` (use a webcam do computador, ou leia o QR do aluno com o celular apontado para a tela).
- Para parar: `Ctrl+C`. Para recomeçar do zero (apaga o banco local): `docker compose down -v`.

### Contas de demonstração

Criadas automaticamente (senha `Demo@2026`, ou a de `DEMO_SENHA`):

| Perfil | E-mail | O que mostra |
| --- | --- | --- |
| Usuário | `aluno.demo@alunos.utfpr.edu.br` | Cadastro aprovado, saldo de R$ 53,00 e histórico: QR Code, recarga, histórico e cardápio |
| Usuário | `pendente.demo@alunos.utfpr.edu.br` | Cadastro em análise (declaração enviada): o Admin aprova ou rejeita |
| Admin | `admin.demo@rumine.demo` | Cardápio e aprovação de cadastros |
| Operador | `operador.demo@rumine.demo` | Leitura do QR Code |
| Mestre | `mestre.demo@rumine.demo` | Criar contas e consultar os logs |

O script (`npm run criar-demo` em `backend/`) é idempotente (rodar de novo não duplica nem altera nada) e **só roda fora de produção ou com `PAGAMENTO_SIMULACAO_DEMO=true`**, porque as senhas são conhecidas. Para testar a recarga, use **Simular pagamento aprovado** na tela **Recarga**.

### Desenvolver (backend e frontend à parte)

Pré-requisitos: Node.js 26, Docker Desktop (aberto) e Git.

```bash
# 1. Banco de dados (na raiz do projeto)
docker compose up -d db

# 2. Backend (terminal 1)
cd backend
copy .env.example .env      # Mac/Linux: cp .env.example .env
npm install
npx prisma migrate dev
npm run seed                # câmpus, preço da refeição e usuários de exemplo
npm run criar-mestre -- "Seu Nome" voce@exemplo.com   # (opcional) Mestre de verdade; veja o CONTRIBUTING
npm run dev                 # http://localhost:3000/health

# 3. Frontend (terminal 2)
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

## Apresentação ao professor

O app publicado (Fly.io) existe **só no dia da apresentação**, para não gerar custo: é criado pouco antes e apagado logo depois. O passo a passo, com checklist e solução de erros, está em **[APRESENTACAO.md](APRESENTACAO.md)**.

## Equipe

| Integrante | Papel |
|---|---|
| Enzo Raitz | P.O. / Scrum Master |
| Bernardo Cecconi Pereira | Arquiteto |
| Gustavo Rafael Quisini | Backend |
| Lucas da Motta Poncio | Frontend / UX |
| Pedro Lazzarin | QA / DevOps |

Professor: franciscosouza@professores.utfpr.edu.br
