# Guia da apresentação: subir e derrubar o app no Fly.io

Este guia é só para o dia da apresentação ao professor. O app **não fica no ar o tempo todo**: o Fly.io cobra pelo tempo que o app existe (por segundo), então ele é criado pouco antes e apagado logo depois. No resto do tempo, a equipe testa com Docker local (veja o [README](README.md#testar-com-docker-sem-instalar-node)).

- **Tempo para subir:** cerca de 10 minutos (faça com 30 minutos de folga).
- **Custo:** só enquanto o app existir. Apague no fim.
- **Onde rodar os comandos:** PowerShell, na **pasta raiz** do projeto (a que tem o `fly.toml`).

> **Nunca** cole a connection string do banco no chat, em PR, em commit ou em print. Ela só entra no comando `fly secrets set`.

## A. Na véspera (confira uma vez)

- [ ] `fly version` mostra a versão. Se não, instale: `iwr https://fly.io/install.ps1 -useb | iex` e reabra o terminal.
- [ ] `fly auth whoami` mostra o seu e-mail. Se não, rode `fly auth login`.
- [ ] A conta do Fly tem cartão cadastrado (o Fly exige para criar o app).
- [ ] O projeto no **Neon** existe e você tem a **connection string direta** (sem `-pooler`, com `sslmode=require`, sem `channel_binding=require`), guardada em um lugar seguro fora do repositório (gerenciador de senhas ou bloco de notas pessoal).
- [ ] `git checkout main` e `git pull origin main`. No `fly.toml`, `app` e `FRONTEND_ORIGIN` mostram o mesmo nome (`rumine-bruxos`).
- [ ] `fly apps list` não lista nenhum app do RU Mine (se listar, é um resto de teste: apague com o passo D).
- [ ] (Recomendado) Teste o app localmente com `docker compose up --build`, para ter certeza de que a versão da `main` funciona.

## B. Subir o app (30 minutos antes)

**1. Criar o app e o volume** (o volume guarda as declarações de vínculo):
```powershell
fly apps create rumine-bruxos
fly volumes create rumine_dados --region gru --size 1 --app rumine-bruxos
```
Se o Fly disser que o nome já existe, escolha outro (por exemplo `rumine-bruxos-2`) e troque **nos dois lugares** do `fly.toml`: `app = "..."` e `FRONTEND_ORIGIN = "https://....fly.dev"`.

**2. Segredos** (troque `COLE-AQUI-A-STRING-DO-NEON`, mantendo as aspas):
```powershell
function novoSegredo { $b = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b) }
fly secrets set --app rumine-bruxos "DATABASE_URL=COLE-AQUI-A-STRING-DO-NEON" "PAGAMENTO_WEBHOOK_SEGREDO=$(novoSegredo)" "QR_SEGREDO=$(novoSegredo)"
```
O aviso "no machines to restart" é normal (o app ainda não foi publicado).

Confira que os três existem (mostra só os nomes):
```powershell
fly secrets list --app rumine-bruxos
```

**3. Publicar** (aplica as migrações no banco e sobe a máquina; leva alguns minutos):
```powershell
fly deploy --app rumine-bruxos
```
No fim aparece o endereço `https://rumine-bruxos.fly.dev`.

**4. Contas de demonstração** (é seguro rodar de novo; recoloca a declaração do aluno em análise no volume novo):
```powershell
fly ssh console --app rumine-bruxos -C "runuser -u node -- npm run criar-demo"
```
Esperado: "já existia" para as contas que estão no banco e "arquivo recolocado" para a declaração.

**5. Conferir (2 minutos).** Abra `https://rumine-bruxos.fly.dev`:
- [ ] Entre com o aluno (`aluno.demo@alunos.utfpr.edu.br`) e veja o saldo e o histórico.
- [ ] Abra **Mostrar QR Code**: o código aparece e a contagem desce.
- [ ] Em outra janela anônima, entre com o Operador (`operador.demo@rumine.demo`) e abra **Ler QR**: a câmera pede permissão.
- [ ] Entre com o Admin (`admin.demo@rumine.demo`), abra **Cadastros** e abra a declaração do aluno em análise (abre um PDF).

## C. Durante a apresentação

Senha de todas as contas: `Demo@2026`.

| Perfil | E-mail |
| --- | --- |
| Aluno | `aluno.demo@alunos.utfpr.edu.br` |
| Aluno em análise | `pendente.demo@alunos.utfpr.edu.br` |
| Admin | `admin.demo@rumine.demo` |
| Operador | `operador.demo@rumine.demo` |
| Mestre | `mestre.demo@rumine.demo` |

Roteiro sugerido (cerca de 5 minutos):
1. **Aluno:** mostra o saldo e o histórico; faz uma **Recarga** (valor de R$ 20,00) e clica em **Simular pagamento aprovado**: o saldo sobe.
2. **Aluno:** abre **Mostrar QR Code**.
3. **Operador** (outro aparelho): lê o QR pela câmera. Aparece **Liberado** em verde e o saldo do aluno cai R$ 3,50.
4. **Reuso:** o Operador lê o **mesmo** código de novo: **Negado** ("QR Code já utilizado"). Espere 40 segundos e leia um código antigo: "expirado".
5. **Admin:** em **Cadastros**, abre a declaração do aluno em análise e **aprova**. Mostra também o cardápio.
6. **Mestre:** em **Logs**, mostra a auditoria (a aprovação e a abertura da declaração aparecem).

Dicas:
- Abra o site uns 5 minutos antes: o banco gratuito (Neon) dorme quando parado e o primeiro acesso demora cerca de 1 segundo a mais.
- A câmera exige HTTPS (o Fly já fornece). Use o celular para ler o QR que está na tela do computador, ou dois celulares.
- Cadastro de aluno novo: o e-mail é **simulado**; o link de confirmação aparece em `fly logs --app rumine-bruxos`.

## Se der erro ao subir

| O que aparece | O que fazer |
| --- | --- |
| `release_command failed` e `Cannot resolve environment variable: DATABASE_URL` | O segredo não está no app. Rode `fly secrets list --app rumine-bruxos`; se faltar `DATABASE_URL`, repita o passo B2. |
| `release_command failed` com erro de conexão ou autenticação | A connection string está errada: precisa ser a **direta** (sem `-pooler`), sem espaço sobrando e sem `channel_binding=require`. Repita o B2 e depois o B3. |
| `Name has already been taken` | Escolha outro nome (veja o B1). |
| `missing an app name` | Você não está na pasta raiz, ou o `fly.toml` está sem `app`. Rode `fly deploy --app rumine-bruxos` na raiz. |
| O site abre, mas o login não funciona | Confira se `FRONTEND_ORIGIN` no `fly.toml` é exatamente o endereço do site (`https://<app>.fly.dev`) e rode `fly deploy --app rumine-bruxos` de novo. |
| A declaração não abre no Admin | Rode o B4 de novo (ele recoloca o arquivo). |
| Qualquer outro erro | `fly logs --app rumine-bruxos --no-tail` mostra o que o servidor registrou. |

## D. Derrubar o app (logo depois da apresentação)

**Não esqueça este passo**: é ele que para a cobrança.

```powershell
fly apps destroy rumine-bruxos
```
O Fly pede para você digitar o nome do app para confirmar. Isso apaga a máquina e o volume, e não dá para desfazer.

Confira:
```powershell
fly apps list
```
Não deve listar o `rumine-bruxos`. Depois olhe **Billing** em https://fly.io/dashboard para ver o valor cobrado.

O banco (Neon) e o código (GitHub) continuam. As contas de demonstração têm senha pública, mas o banco só é acessado pelo app, que deixou de existir. Se quiser apagar o projeto do Neon, faça pelo painel deles.
