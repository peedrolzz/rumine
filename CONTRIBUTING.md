# Guia de desenvolvimento

Este guia explica como obter o código, trabalhar em uma história e enviar suas alterações. Vale para toda a equipe. Pode ser colado no `README.md` (seção "Como contribuir") ou mantido como `CONTRIBUTING.md` na raiz do repositório.

## 1. Pré-requisitos

- [Git](https://git-scm.com/downloads)
- [Node.js](https://nodejs.org/) LTS (versão definida em `.nvmrc` quando o projeto for criado) e npm
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

> Os comandos abaixo valem depois que a fundação do projeto (estrutura do repositório, Docker e esquema do banco) for mesclada. Os nomes exatos das pastas e scripts serão confirmados no README pelo responsável pela fundação.

```bash
# 1. variáveis de ambiente
cp .env.example .env        # ajuste os valores locais

# 2. banco de dados local (PostgreSQL)
docker compose up -d db

# 3. dependências
npm install

# 4. migrações e dados de teste
npx prisma migrate dev
npm run seed                # se existir

# 5. subir a aplicação
npm run dev
```

Nunca faça commit do arquivo `.env`, de chaves de API ou de qualquer segredo. Use apenas o `.env.example`, sem valores reais.

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
5. Aguarde o CI (testes e lint) passar. Se falhar, corrija antes de pedir revisão.

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

## 9. Dúvidas comuns

| Situação | O que fazer |
|---|---|
| Fiz commit na `main` sem querer | Não faça push. Crie uma branch no mesmo ponto (`git checkout -b minha-branch`) e peça ajuda para restaurar a `main` local. |
| Subi um segredo por engano | Avise a equipe na hora. O segredo deve ser revogado e trocado; apagar o commit não basta. |
| Não sei qual é o meu issue | Veja a tabela de distribuição e o quadro do GitHub Projects (filtre pelo seu usuário). |
| Preciso mudar o banco | Altere o `schema.prisma` e gere uma migração (`npx prisma migrate dev --name descricao`). Avise o Arquiteto, pois o esquema é compartilhado. |
