# Cockpit Minhas Atividades — C.Vale

Site pessoal (estático) para acompanhar minhas demandas do dia a dia na cooperativa.
Guarda os dados em um banco Supabase (Postgres na nuvem) em vez do antigo arquivo
`cockpit_dados.json` + servidor Python local.

- **Leitura**: pública — qualquer pessoa com o link vê o dashboard atualizado.
- **Escrita**: só quem estiver logado (ver "Criar seu login" abaixo) consegue salvar
  alterações no banco. Sem login, o app funciona em modo leitura e guarda mudanças
  só no navegador (`localStorage`), sem afetar o que os outros veem.

## Estrutura

```
index.html              # aplicação (dashboard, kanban, relatórios etc.)
supabase-config.js       # URL + chave pública do Supabase (preencher, ver abaixo)
supabase/schema.sql      # cria a tabela + regras de acesso (RLS)
supabase/seed.sql        # importa as demandas reais atuais (rodar 1x)
assets/, LOGO_transparente.png, lucide.min.js  # imagens e ícones usados pela página
```

## 1. Usar o projeto Supabase existente (banco-principal)

Este app não usa um projeto Supabase dedicado — ele usa uma "gaveta" (schema
Postgres) própria, chamada `cvale`, dentro do projeto `banco-principal` já
existente (compartilhado com outros sub-projetos).

1. No projeto `banco-principal`, abra **SQL Editor** → **New query**, cole o
   conteúdo de `supabase/schema.sql` e clique **Run**. Isso cria o schema
   `cvale`, a tabela `cvale.cockpit_estado` e as políticas de acesso (RLS:
   leitura pública, escrita só autenticado).
2. Ainda no SQL Editor, nova query com o conteúdo de `supabase/seed.sql` e
   **Run**. Isso importa as demandas reais que já estavam em
   `cockpit_dados.json`. **Obs.:** o `seed.sql` contém dados internos reais e
   por isso fica só na máquina local (está no `.gitignore`, não vai para este
   repositório público). A carga já foi executada; o site lê tudo direto do
   Supabase.
3. Vá em **Project Settings → API → Data API Settings → Exposed schemas** e
   adicione `cvale` à lista (junto de `public`). Sem esse passo o PostgREST
   recusa qualquer chamada do site para as tabelas dessa gaveta.
4. Ainda em **Project Settings → API**. Copie:
   - **Project URL** (algo como `https://xxxxxxxx.supabase.co`)
   - **anon public key** (chave longa, começa geralmente com `eyJ...`)

## 2. Preencher as credenciais no site

Abra `supabase-config.js` e substitua:

```js
const SUPABASE_URL = 'COLE_AQUI_A_PROJECT_URL';
const SUPABASE_ANON_KEY = 'COLE_AQUI_A_ANON_PUBLIC_KEY';
```

> A `anon key` é pública por design (é assim que o Supabase funciona direto do
> navegador) — pode ficar no repositório mesmo sendo público no GitHub. Quem
> protege os dados são as políticas de RLS criadas no passo anterior, não o sigilo
> dessa chave.

## 3. Criar seu login (para poder editar)

No Supabase: **Authentication → Users → Add user** → informe seu e-mail e uma senha.
Marque "Auto Confirm User" para não precisar confirmar por e-mail.

No site publicado, clique no botão **"Somente leitura"** no topo → informe esse
e-mail/senha → o botão vira **"Modo edição"** e o app passa a salvar no Supabase
normalmente (Nova Demanda, editar, excluir, arrastar no Kanban etc.).

## 4. Publicar no GitHub Pages

```bash
cd controle_demandas_atividades
git init
git add .
git commit -m "Cockpit Minhas Atividades - versao publica com Supabase"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/cvale.git
git push -u origin main
```

Depois, no GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a
branch → Branch: main / (root)** → salvar. Em 1–2 minutos o link fica disponível em
`https://SEU_USUARIO.github.io/cvale/`.

## Observações

- O antigo `servidor_cockpit.py` e `cockpit_dados.json` (na raiz do monorepo
  `CVale_Desenv`) continuam existindo só para uso local antigo — esta pasta é uma
  cópia independente, com o próprio histórico git, pensada exclusivamente para essa
  versão pública hospedada no GitHub Pages + Supabase.
- Se o Supabase não estiver configurado (`supabase-config.js` com os placeholders),
  o app cai automaticamente para os dados de exemplo embutidos e para o
  `localStorage`, sem quebrar.
