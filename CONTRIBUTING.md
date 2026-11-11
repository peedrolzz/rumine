# Guia de desenvolvimento

Este guia explica como obter o código, trabalhar em uma história e enviar suas alterações. Vale para toda a equipe. Pode ser colado no `README.md` (seção "Como contribuir") ou mantido como `CONTRIBUTING.md` na raiz do repositório.

## 1. Pré-requisitos

- [Git](https://git-scm.com/downloads)
- [Node.js](https://nodejs.org/) 26 (a mesma versão da CI, definida em `NODE_VERSION` no `.github/workflows/ci.yml`) e npm
- [Docker](https://www.docker.com/) e Docker Compose (para o PostgreSQL local)
- Uma conta no GitHub com acesso ao repositório (peça ao P.O. para ser adicionado como colaborador)
- Um editor com suporte a TypeScript (por exemplo, VS Code)

## 2. Configurar o Git (uma vez)

```bash
git config --global user.name "Seu Nome"
git config --global user.email "seu-email-do-github@exemplo.com"
```

Autenticação: use HTTPS com um *Personal Access Token* ou, de preferência, uma chave SSH cadastrada em GitHub > Settings > SSH and GPG keys.

## 3. Clonar o repositório

Com HTTPS:

```bash
git clone https://github.com/peedrolzz/rumine.git
cd rumine
```

Ou com SSH:

```bash
git clone git@github.com:peedrolzz/rumine.git
cd rumine
```

## 4. Instalar e executar

Abra o **Docker Desktop** antes de começar. Use dois terminais: um para o backend e um para o frontend.

```bash
# Na raiz do projeto: banco de dados (PostgreSQL)
docker compose up -d db

# Terminal 1: backend
cd backend
cp .env.example .env          # no Windows: copy .env.example .env
npm install
npx prisma migrate dev        # cria as tabelas
npm run seed                  # dados de desenvolvimento: câmpus e usuários de exemplo
npm run dev                   # http://localhost:3000/health

# Terminal 2: frontend
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

O arquivo `.env` do backend deve conter `DATABASE_URL="postgresql://rumine:rumine@localhost:5432/rumine"`. O `.env.example` traz as outras variáveis, comentadas e explicadas. Nunca faça commit do `.env`.

Os avisos amarelos do npm sobre `install-scripts` e as vulnerabilidades "moderate" podem ser ignorados por enquanto. **Não rode `npm audit fix --force`.**

### Cadastro e login em desenvolvimento

O login é de verdade (HU-01): senha com **Argon2id** (`@node-rs/argon2`, que já vem com binários prontos: não precisa de compilador; se o `npm install` falhar nele, avise a equipe) e sessão em cookie `HttpOnly` de 45 dias. Duas formas de trabalhar:

- **Sem login (mais rápido):** descomente `DEV_USUARIO=ADMIN` (ou `USUARIO`, `OPERADOR`, `MESTRE`) no `.env` do backend e reinicie. O app passa a agir como o usuário de exemplo do seed. **Enquanto estiver definido, o login real é ignorado.**
- **Com login de verdade:** deixe o `DEV_USUARIO` comentado e teste o fluxo completo:
  1. Cadastre-se na tela com um e-mail `@alunos.utfpr.edu.br` (por enquanto é o único domínio aceito; nenhum e-mail real é enviado).
  2. O e-mail é simulado: procure no **terminal do backend** a linha `[E-MAIL SIMULADO]` e abra o link de confirmação que aparece nela.
  3. Depois da confirmação a conta fica "pendente de aprovação". Enquanto a tela do Admin (HU-20) não existe, ative a conta direto no banco:

     ```bash
     docker exec rumine-db-1 psql -U rumine -d rumine -c "update usuario set status='ATIVO' where email='seu@alunos.utfpr.edu.br'"
     ```

Para quem desenvolve: proteja as rotas com `exigirPerfil(...)` (a sessão é lida do cookie `rumine_sessao`), e no front envie as requisições com `credentials: "include"` (o `api/cliente.ts` já faz isso). Toda requisição que altera dados precisa vir do endereço do front (`FRONTEND_ORIGIN`, por padrão `http://localhost:5173`): abrir o app por `127.0.0.1` em vez de `localhost` dá erro 403 "Origem não permitida".

## 5. Fluxo de trabalho por história

Cada história (HU) é um *issue* no quadro do GitHub Projects. O fluxo é sempre o mesmo:

1. **Pegue o issue** que está atribuído a você e mova o cartão para **Em andamento**.
2. **Atualize a `main`** e crie uma branch a partir dela:

   ```bash
   git checkout main
   git pull origin main
   git checkout -b feat/hu-05-recarga-backend
   ```

3. **Desenvolva em passos pequenos** e faça commits frequentes.
4. **Envie a branch** e abra um Pull Request (seção 7).
5. **Corrija o que a revisão pedir** com novos commits na mesma branch.
6. Depois da aprovação e do merge, apague a branch e mova o cartão para **Concluído**.

**Regra principal: ninguém faz push direto na `main`.** Todo código entra por Pull Request revisado por outra pessoa.

## 6. Nomes de branch e mensagens de commit

### Branches

Formato: `tipo/hu-NN-descricao-curta`

| Tipo | Quando usar | Exemplo |
|---|---|---|
| `feat` | Nova funcionalidade (história) | `feat/hu-06-exibir-qr` |
| `fix` | Correção de erro | `fix/hu-05-webhook-duplicado` |
| `docs` | Documentação | `docs/readme-como-executar` |
| `test` | Testes | `test/hu-08-debito-concorrente` |
| `chore` | Infra, CI, dependências | `chore/ci-github-actions` |

Para tarefas de uma história dividida entre backend e frontend, acrescente `-backend` ou `-frontend` ao final, para as duas partes não colidirem na mesma branch.

### Commits

Use o padrão de mensagens curtas no imperativo, com o tipo na frente:

```
feat(carteira): cria endpoint de recarga
fix(qr): rejeita token já utilizado
docs: atualiza instruções de execução
```

Faça commits pequenos e com um propósito só. Evite mensagens como "ajustes" ou "wip".

```bash
git add <arquivos>
git commit -m "feat(carteira): cria endpoint de recarga"
git push -u origin feat/hu-05-recarga-backend
```

## 7. Abrir um Pull Request

1. No GitHub, abra o PR da sua branch para a `main`.
2. Título claro, por exemplo: `HU-05: recarga da carteira (backend)`.
3. Na descrição, inclua:
   - o que foi feito e como testar;
   - `Closes #NN` (número do issue), para o issue fechar sozinho no merge. Se for só uma parte da história, use `Refs #NN`;
   - prints, quando houver tela.
4. Peça revisão de quem está na coluna **Revisão** da tabela de distribuição (`semana4/RUMine_Distribuicao_Historias.md`).
5. Aguarde o CI passar (seção 10). Se falhar, corrija antes de pedir revisão.

### Checklist do autor (antes de pedir revisão)

- [ ] A aplicação sobe e a funcionalidade foi testada à mão.
- [ ] Os critérios de aceite (Dado/Quando/Então) da história foram atendidos.
- [ ] Há testes para as regras de negócio que mudaram.
- [ ] Nenhum segredo, `.env` ou arquivo gerado foi incluído.
- [ ] Telas seguem o documento de padronização de UX (se houver frontend).
- [ ] O PR é pequeno e trata de uma coisa só.

### Para quem revisa

- Leia o código e rode a branch, se precisar.
- Confira os critérios de aceite do issue.
- Comente de forma objetiva; aprove só quando estiver de fato pronto.
- Faça o merge usando **Squash and merge**, para manter o histórico da `main` limpo.

## 8. Manter sua branch atualizada

Se a `main` andou enquanto você trabalhava:

```bash
git fetch origin
git checkout feat/hu-05-recarga-backend
git merge origin/main
# resolva conflitos, se houver, e então:
git push
```

Em caso de conflito, resolva nos arquivos marcados, rode a aplicação e os testes e só então finalize o merge. Na dúvida, peça ajuda antes de forçar qualquer coisa. **Não use `git push --force` em branches compartilhadas.**

## 9. Tags de versão e de épico

As tags marcam pontos salvos da `main`, para comparar ou voltar a um estado conhecido. Há dois tipos:

| Tag | Quando | Exemplo |
|---|---|---|
| Projeto base | Estado inicial, antes da primeira história | `v0.1.0` |
| Épico concluído | Quando o épico fecha | `epico-e5-cardapio` |
| MVP | Quando os épicos Must (E1 a E5) estiverem prontos | `v1.0.0` |

### Nome da tag de épico

`epico-eN-nome`, em minúsculas, sem acento, com hífen. O número é o do épico no documento de requisitos.

- `epico-e1-autenticacao`
- `epico-e2-carteira`
- `epico-e3-acesso`
- `epico-e4-historico`
- `epico-e5-cardapio`

Os épicos não terminam em ordem, e por isso a tag usa o nome do épico, e não um número de versão.

### Quando criar

Um épico está concluído quando as histórias **Must** dele estão mergeadas na `main`. Histórias Should e Could não seguram a tag.

### Como criar

Só uma pessoa cria a tag (o P.O.), sempre na `main` atualizada, depois do merge da última história Must do épico:

```bash
git checkout main && git pull origin main
git tag -a epico-e5-cardapio -m "Épico E5 Cardápio: HU-11 e HU-12"
git push origin epico-e5-cardapio
```

A mensagem lista o épico e as histórias incluídas. Nunca mova nem apague uma tag que já foi enviada.

### Como usar

```bash
git tag -l                                      # lista as tags
git diff v0.1.0..epico-e5-cardapio              # o que o épico trouxe
git checkout epico-e5-cardapio                  # só para olhar (detached HEAD)
git checkout -b fix/algo epico-e5-cardapio      # para trabalhar a partir dela
```

## 10. Integração contínua (CI)

A CI é o GitHub Actions (`.github/workflows/ci.yml`). Ela roda em todo Pull Request para a `main` e em todo push na `main`, com dois jobs em paralelo:

| Job | O que confere |
|---|---|
| **Backend (tipos e testes)** | gera o client do Prisma, checa os tipos (`typecheck`) e roda os testes |
| **Frontend (lint, testes e build)** | roda o lint, os testes e o build |

A CI não acessa banco de dados: os testes usam repositórios em memória. Se uma história precisar de teste com banco, combine antes com o time, porque o workflow terá de subir um PostgreSQL.

### Como ver o resultado

Na página do PR, a seção **Checks** mostra cada job: ✓ verde (passou) ou ✗ vermelho (falhou). Clique em **Details** para ler o log e achar o passo que quebrou. Cada commit novo no PR cancela a execução anterior e começa outra (leva cerca de 1 minuto).

### Rode o mesmo antes de enviar

Os mesmos comandos da CI, na sua máquina:

```bash
# backend (na pasta backend/)
npx prisma generate
npm run typecheck
npm test

# frontend (na pasta frontend/)
npm run lint
npm test
npm run build
```

### Se a CI falhar

Corrija na mesma branch e faça um novo commit: a CI roda de novo sozinha. Não peça revisão com a CI vermelha e não apague nem desligue testes só para passar.

### Bloquear o merge quando a CI falha

Isso exige ligar a regra **Require status checks to pass** na proteção da branch `main` (Settings → Branches), marcando os jobs "Backend (tipos e testes)" e "Frontend (lint, testes e build)". Só quem administra o repositório consegue configurar. **Enquanto a regra não estiver ligada, vale o combinado: só faça o merge com os dois checks verdes.**

## 11. Dúvidas comuns

| Situação | O que fazer |
|---|---|
| Fiz commit na `main` sem querer | Não faça push. Crie uma branch no mesmo ponto (`git checkout -b minha-branch`) e peça ajuda para restaurar a `main` local. |
| Subi um segredo por engano | Avise a equipe na hora. O segredo deve ser revogado e trocado; apagar o commit não basta. |
| Não sei qual é o meu issue | Veja a tabela de distribuição e o quadro do GitHub Projects (filtre pelo seu usuário). |
| Preciso mudar o banco | Altere `backend/prisma/schema.prisma` e gere uma migração (`npx prisma migrate dev --name descricao`). Avise o Arquiteto, pois o esquema é compartilhado. Regras que o Prisma não expressa (como CHECK) vão no `migration.sql` gerado, antes de aplicar (`--create-only`). |
| O Prisma não conecta | Confira se o Docker Desktop está aberto, se `docker ps` lista o container do banco e se o `.env` do backend está correto. |
| Erro de tipos com o MUI (`p`, `mt` etc. no `Box`) | Use `sx={{ p: 2 }}` em vez do atalho direto. |
