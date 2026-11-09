# RU Mine

Carteira digital com QR Code para o Restaurante Universitário da UTFPR (câmpus Dois Vizinhos). Projeto da disciplina de Arquitetura de Software. Monolito modular em TypeScript.

## Leia antes de implementar uma história
- `documentos/`: requisitos (épicos, HUs, critérios de aceite), arquitetura (C4, ADRs) e padrão de UX.
- `backend/prisma/schema.prisma`: modelo de dados (valores monetários em centavos inteiros).
- A história a implementar está no issue do GitHub; siga os critérios Dado/Quando/Então.

## Stack
- Backend: Fastify (módulos manuais em `backend/src/modules/`), Prisma 7, PostgreSQL. ES modules (`"type": "module"`): imports relativos terminam em `.js`.
- Frontend: React + Vite (PWA), MUI, React Router. Tema em `frontend/src/theme.ts`.
- Perfis: USUARIO, OPERADOR, ADMIN, MESTRE. O backend bloqueia rotas por perfil; o front só esconde menus.

## Comandos
- Banco: `docker compose up -d db` (raiz; Docker Desktop aberto)
- Backend (`backend/`): `npm install`, `npx prisma migrate dev`, `npm run dev` (http://localhost:3000/health)
- Frontend (`frontend/`): `npm install`, `npm run dev` (http://localhost:5173)
- `.env` do backend: copiar de `.env.example`; nunca commitar.

## Regras de negócio e segurança
- Saldo nunca negativo (CHECK no banco). Débito atômico: `$transaction` + `SELECT ... FOR UPDATE` via `$queryRaw`.
- QR Code: JWT assinado, 30 s, `jti` único (uso único). Nunca expor o RA no QR.
- Senha com Argon2 (mínimo 8 caracteres, número e caractere especial). Sessão em cookie HttpOnly.
- Cadastro exige comprovação de vínculo (upload de até 2 MB: pdf, jpg ou png) e aprovação do Admin.
- Integrações externas (pagamento, e-mail, arquivos, UTFPR) ficam atrás de interfaces, com versão simulada.

## UX
- Celular primeiro; coluna única (máx. ~480 px); botões de no mínimo 44 px.
- Toda tela trata carregando, vazio, erro e sucesso, com mensagens em português claro.
- Valores em `R$ 1.234,50`, datas em `dd/mm/aaaa`.
- Cores: primária `#1f6f43`, erro `#b42318`, fundo `#f4f6f5`. No MUI, use `sx={{ p: 2 }}` em vez de atalhos como `p={2}` no `Box`.

## Fluxo de trabalho
- Uma branch por história: `feat/hu-NN-descricao` (sufixo `-backend` ou `-frontend` se dividir). Nunca commitar na `main`.
- Commits pequenos no padrão `tipo(escopo): descrição` (feat, fix, docs, test, chore).
- Abra PR para a `main` com `Closes #N`, descrição e como testar; merge com Squash and merge após revisão.
- Antes de editar, liste os arquivos que pretende alterar. Não rode `prisma migrate reset`, `git push --force` nem comandos destrutivos sem pedir confirmação. Não use `npm audit fix --force`.
- Ao receber uma história: (1) leia o issue e os critérios de aceite; (2) proponha o plano e as alterações e espere minha confirmação; (3) **assim que eu confirmar**, atualize a `main` (`git checkout main && git pull origin main`) e crie a branch `feat/hu-NN-descricao` a partir dela, antes de editar qualquer arquivo; (4) só então implemente.
- Nunca edite nem faça commit na `main`. Se `git branch --show-current` mostrar `main`, crie a branch antes de tocar nos arquivos.
- Se houver alterações não commitadas ao trocar de branch, pare e me avise.