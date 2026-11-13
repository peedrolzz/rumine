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
  1. Abra http://localhost:5173/cadastro e cadastre-se com um e-mail `@alunos.utfpr.edu.br` (por enquanto é o único domínio aceito; nenhum e-mail real é enviado). A senha precisa de 8 caracteres, um número e um caractere especial.
  2. O e-mail é simulado: procure no **terminal do backend** a linha `[E-MAIL SIMULADO]`, abra o link de confirmação que aparece nela e toque em **Confirmar e-mail** (a confirmação só acontece no toque do botão).
  3. Depois da confirmação, entre pela tela de login. A conta fica "pendente de aprovação" e o app mostra a tela "Cadastro em análise". Enquanto a tela do Admin (HU-20) não existe, ative a conta direto no banco e toque em **Atualizar**:

     ```bash
     docker exec rumine-db-1 psql -U rumine -d rumine -c "update usuario set status='ATIVO' where email='seu@alunos.utfpr.edu.br'"
     ```

Para quem desenvolve: proteja as rotas com `exigirPerfil(...)` (a sessão é lida do cookie `rumine_sessao`), e no front envie as requisições com `credentials: "include"` (o `api/cliente.ts` já faz isso). Toda requisição que altera dados precisa vir do endereço do front (`FRONTEND_ORIGIN`, por padrão `http://localhost:5173`): abrir o app por `127.0.0.1` em vez de `localhost` dá erro 403 "Origem não permitida". No front, telas que exigem login entram dentro do `<RotaProtegida>` em `App.tsx` (as que exigem cadastro ativo, dentro do `<LayoutApp>`), e `useAuth()` entrega o usuário logado. Uma chamada que volta 401 já leva ao login sozinha, com o aviso de sessão expirada.

### Perfis de acesso e usuários iniciais (HU-03)

Cada perfil vê só o que usa: **Usuário** (carteira, histórico, cardápio), **Operador** (só a leitura do QR Code), **Admin** (cardápio, cadastros e histórico geral) e **Mestre** (criar contas e consultar logs). O menu e a guarda de rota do front só escondem as telas; **quem barra de verdade é o backend** (`exigirPerfil`: 401 sem login, 403 com perfil errado).

- **Primeiro Mestre:** em `backend/`, rode `npm run criar-mestre -- "Nome Completo" email@exemplo.com`. A senha é pedida no terminal (não aparece na tela). O script recusa se já existir um Mestre que consiga entrar; os usuários de exemplo do seed não contam. Depois, entre pelo login normal.
- **Admin e Operador:** o Mestre cria pelo app, na aba **Contas** (`POST /mestre/contas`). A conta já nasce ativa, com uma senha temporária que o Mestre combina com a pessoa. Toda criação de conta vai para o log, com data e autor, e aparece na aba **Logs**.
- **Rota nova protegida por perfil:** use `exigirPerfil(...)` no backend e acrescente uma linha em `backend/src/testes/matrizPerfis.test.ts` (um teste quebra se a rota não estiver na matriz). No front, a tela entra dentro de um `<RotaPorPerfil perfis={[...]}>` em `App.tsx` e o item do menu em `layout/LayoutApp.tsx`.
- **Ação sensível nova** (ex.: aprovar cadastro): grave o log com `registrarLog(tx, {...})` (`modules/auditoria/registro.ts`) na mesma transação da ação. Nunca coloque senha, hash ou token nos detalhes.

### Contas de demonstração

`npm run criar-demo` (em `backend/`) cria um Mestre, um Admin, um Operador, um aluno **aprovado** (saldo R$ 53,00, com histórico) e um aluno **em análise** (com declaração enviada), mais o cardápio de hoje. A senha é `Demo@2026` (troque com `DEMO_SENHA`). Os e-mails estão no [README](README.md).

- **Idempotente:** o que já existe não é recriado nem alterado (nem a senha). Para recomeçar a demonstração, apague as contas `*.demo@*` do banco.
- **Trava de segurança:** as senhas são conhecidas, então o script **recusa** rodar em produção, a menos que `PAGAMENTO_SIMULACAO_DEMO=true` (o mesmo interruptor do ambiente de demonstração). Nunca rode contra dados reais.
- **Mesmo servidor da API:** a declaração de exemplo vai para o armazenamento privado (`ARMAZENAMENTO_DIR`); rode o script onde a API roda para o Admin conseguir abri-la.
- Os dados ficam em `backend/src/modules/demo/contas.ts` (com testes); o script é `backend/scripts/criarDemo.ts`.

### Comprovação de vínculo e arquivos enviados (HU-02)

Depois de confirmar o e-mail, a pessoa informa o **RA** e envia a **declaração de matrícula** (PDF, JPG ou PNG, até **5 MB**) na tela "Comprove seu vínculo". O cadastro vai para análise do Admin; se for rejeitado, a tela mostra o motivo e permite reenviar. Quem já foi aprovado não envia de novo.

- **Onde o arquivo fica:** em desenvolvimento, na pasta `backend/armazenamento-privado/` (ignorada pelo Git; muda com `ARMAZENAMENTO_DIR`). O nome é uma chave aleatória, nunca o nome original. O serviço de produção (volume ou bucket) entra no deploy, atrás da interface `shared/armazenamento.ts`.
- **O arquivo só sai por uma rota de Admin:** `GET /admin/declaracoes/:id/arquivo` (a HU-20 usa), e cada abertura vai para o log de auditoria.
- **O tipo vem do conteúdo**, não da extensão: um `.exe` renomeado para `.pdf` é recusado pelo servidor.
- **Testar sem a tela do Admin (HU-20):** para simular a decisão, mude o status direto no banco, por exemplo `update usuario set status='ATIVO' where email='...'` (aprovar) ou `status='REJEITADO'` (e, para ver o motivo, insira uma linha em `analise_cadastro` com `decisao='REJEITADO'`).
- **Arquivo novo em outras histórias:** use sempre a interface `Armazenamento` e valide o tipo pelo conteúdo (`modules/vinculo/arquivo.ts`).

### Aprovação de cadastros (HU-20)

O Admin analisa a fila em **Cadastros** (`GET /admin/cadastros`): vê nome, e-mail, RA e abre a declaração; depois **aprova** (`POST /admin/cadastros/:usuarioId/aprovar`) ou **rejeita com motivo obrigatório**, de 5 a 300 caracteres (`.../rejeitar`). A decisão grava quem decidiu e quando (`analise_cadastro`) e vai para o log de auditoria. Aprovar também cria a **carteira com saldo zero**. Se outro Admin decidir antes, a resposta é 409 e a tela atualiza a lista. Quem foi rejeitado vê o motivo e pode reenviar (HU-02), voltando para a fila.

- **Rotas que exigem cadastro aprovado** (recarga, QR Code e as próximas): depois de `exigirPerfil(...)`, acrescente `exigirCadastroAtivo()` (`shared/auth.ts`). Conta em análise ou rejeitada recebe 403 com `codigo: "CADASTRO_PENDENTE"`. A sessão já traz o `status` do usuário.
- **Testar em desenvolvimento:** crie um Admin pelo Mestre (aba Contas), cadastre um aluno, envie o vínculo e decida pela aba **Cadastros**. O comando SQL de aprovar à mão (seção anterior) não é mais necessário.

### Saldo da carteira (HU-04)

`GET /carteira` devolve o saldo do próprio usuário em **centavos** (`saldoCentavos`) e `atualizadoEm`; só o perfil Usuário com cadastro aprovado (usa `exigirCadastroAtivo()`). A tela Início mostra `R$ 1.234,50`, o atalho **Recarregar** e busca o saldo de novo ao voltar para o app. O banco já tem `CHECK (saldo_centavos >= 0)` (desde a migração `init`): quem alterar o saldo (recarga, débito) deve fazê-lo em `$transaction` com `SELECT ... FOR UPDATE`, e o banco recusa qualquer resultado negativo.

### Recarga por Pix (HU-05)

O usuário escolhe o valor (**R$ 5,00 a R$ 200,00**), recebe um código Pix e a tela acompanha o pagamento. **O saldo só aumenta quando o provedor confirma** (RN-03); se o pagamento for recusado ou expirar, o saldo não muda e o motivo aparece (RN-04).

- **Provedor atrás de uma interface:** `modules/recarga/gateway.ts` (`GatewayPagamento`). No MVP só existe a versão **simulada** (decisão do P.O.: o **Mercado Pago fica fora do MVP**, como evolução). Um provedor real, quando vier, entra implementando a mesma interface, sem mudar o resto; ele exigirá credenciais e uma URL pública para o webhook.
- **Webhook:** `POST /webhooks/pagamento` é público e **só vale com assinatura** (HMAC-SHA256 do corpo no cabeçalho `x-assinatura`, com o segredo `PAGAMENTO_WEBHOOK_SEGREDO`; em desenvolvimento há um segredo padrão, em produção ele é **obrigatório**). A confirmação é **idempotente**: o mesmo pagamento avisado várias vezes (inclusive ao mesmo tempo) credita uma só vez, porque a cobrança e a carteira são travadas com `SELECT ... FOR UPDATE` na mesma transação. Aviso com valor diferente do cobrado não credita nada.
- **Testar sem provedor:** com o backend fora de produção, a tela mostra os botões **Simular pagamento aprovado/recusado**, que passam pelo mesmo caminho do webhook (`POST /dev/recargas/:id/simular`). Em produção essa rota não existe, **a menos que** o interruptor de demonstração esteja ligado (próximo item).
- **Publicar uma demonstração** (sem provedor real): defina `PAGAMENTO_SIMULACAO_DEMO=true` no ambiente publicado. Só o texto exato `true` liga, e o servidor avisa no log ao subir. Com ele ligado, **qualquer conta aprovada pode creditar saldo de mentira em si mesma**: use só em um ambiente de demonstração, nunca com dinheiro real. Em produção de verdade, deixe sem definir.
- **Migração nova:** rode `npx prisma migrate dev` em `backend/` (acrescenta `motivo_falha` e `codigo_pagamento` em `cobranca_recarga`).
- **Limites e prazo:** constantes em `modules/recarga/servico.ts` (valor mínimo e máximo, 30 minutos para pagar, no máximo 3 recargas pendentes por pessoa).

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
