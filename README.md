# Catálogo de Fotos - Loja de Roupas

Site estático (HTML/CSS/JS puro) + Supabase (banco, storage e login) + GitHub Pages (hospedagem).

Estrutura do projeto:

```
index.html          -> catálogo público (o que os clientes veem)
admin.html           -> painel para você cadastrar/editar produtos
css/style.css         -> estilo do catálogo
css/admin.css         -> estilo do admin
js/config.js          -> suas chaves do Supabase e configurações
js/supabaseClient.js  -> conexão com o Supabase
js/app.js             -> lógica do catálogo público
js/admin.js           -> lógica do painel admin
sql/schema.sql         -> script para criar as tabelas no Supabase
```

## Passo 1 — Criar o projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie uma conta gratuita.
2. Clique em **New project**. Escolha nome, senha do banco e região (South America se disponível).
3. Aguarde a criação (leva 1-2 minutos).

## Passo 2 — Criar as tabelas

1. No painel do projeto, vá em **SQL Editor** > **New query**.
2. Abra o arquivo `sql/schema.sql` deste projeto, copie todo o conteúdo e cole no editor.
3. Clique em **Run**. Isso cria as tabelas `categories`, `products`, `product_images` e as regras de segurança (RLS).

## Passo 3 — Criar o bucket de imagens

1. No menu lateral, vá em **Storage**.
2. Clique em **New bucket**, nomeie como `product-images` e marque como **Public bucket**.
3. Depois de criado, vá em **Policies** desse bucket e adicione:
   - Uma policy de **SELECT** com `true` (qualquer um pode ver as fotos).
   - Uma policy de **INSERT/UPDATE/DELETE** com `auth.role() = 'authenticated'` (só você, logado, pode enviar/apagar fotos).

## Passo 4 — Criar seu usuário admin

1. Vá em **Authentication** > **Users** > **Add user**.
2. Cadastre seu e-mail e uma senha — será o login do `admin.html`.
3. Em **Authentication** > **Providers**, confirme que **Email** está habilitado (vem habilitado por padrão).

## Passo 5 — Pegar as chaves da API

1. Vá em **Project Settings** (ícone de engrenagem) > **API**.
2. Copie a **Project URL** e a chave **anon public**.
3. Abra `js/config.js` neste projeto e preencha:

```js
const SUPABASE_URL = "https://SEU-PROJETO.supabase.co";
const SUPABASE_ANON_KEY = "sua-chave-anon-aqui";
const WHATSAPP_NUMBER = "5511999999999"; // seu número, só dígitos, com DDI+DDD
const STORE_NAME = "Nome da Sua Loja";
```

## Passo 6 — Testar localmente (opcional, mas recomendado)

Como o site usa `fetch`/módulos, é melhor abrir com um servidor local em vez de abrir o `.html` direto no navegador:

- Se tiver Python instalado: `python3 -m http.server 8000` na pasta do projeto, depois abra `http://localhost:8000`.
- Se tiver VS Code: use a extensão **Live Server**.

Teste o `admin.html`, faça login, cadastre uma categoria e um produto com fotos. Depois confira se ele aparece em `index.html`.

## Passo 7 — Subir para o GitHub

1. Crie um repositório novo no GitHub (pode ser público — as chaves aqui são só a "anon key", que é segura para expor no front-end; quem protege os dados são as regras de RLS que já criamos).
2. Na pasta do projeto:

```bash
git init
git add .
git commit -m "Catálogo inicial"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
git push -u origin main
```

## Passo 8 — Ativar o GitHub Pages

1. No repositório do GitHub, vá em **Settings** > **Pages**.
2. Em **Source**, escolha a branch `main` e a pasta `/ (root)`.
3. Salve. Em alguns minutos o site estará disponível em `https://SEU-USUARIO.github.io/SEU-REPOSITORIO/`.
4. O catálogo público fica em `.../index.html` e o admin em `.../admin.html`.

## Uso do dia a dia

- Para cadastrar peças novas: acesse `admin.html`, faça login, preencha o formulário e selecione as fotos (pode escolher várias de uma vez).
- Para editar ou excluir: use os botões na tabela de produtos cadastrados.
- Categorias novas: use o campo no topo do admin.
- O botão de WhatsApp no catálogo já abre uma mensagem pronta perguntando sobre a peça.

## Segurança

- A chave `anon` no `config.js` é pública por natureza — não é ela que protege os dados.
- Quem protege é a Row Level Security (RLS) criada no `schema.sql`: qualquer visitante só consegue **ler**; só quem estiver logado (você) consegue **criar/editar/excluir**.
- Nunca compartilhe a chave `service_role` do Supabase (essa sim é secreta) — ela não é usada em nada deste projeto.

## Próximos passos possíveis (se quiser evoluir depois)

- Domínio próprio apontando para o GitHub Pages.
- Compactação automática de imagens antes do upload.
- Ordenação/drag-and-drop das fotos no admin.
- Estoque/quantidade disponível por tamanho.
