-- ============================================
-- Cockpit Minhas Atividades - schema Supabase
-- ============================================
-- Rode este script uma vez em: Supabase > SQL Editor > New query
-- Substitui o antigo arquivo cockpit_dados.json + servidor Python
-- (servidor_cockpit.py) por uma única linha em uma tabela Postgres.
--
-- Usa o schema "cvale" (gaveta própria deste app dentro do banco-principal,
-- compartilhado com outros sub-projetos) em vez de "public", para manter as
-- tabelas isoladas das demais gavetas do mesmo banco.
--
-- IMPORTANTE: depois de rodar este script, é preciso expor o schema "cvale"
-- na API em Project Settings > API > Data API Settings > Exposed schemas
-- (adicionar "cvale" à lista, junto de "public") — sem isso o PostgREST
-- recusa qualquer chamada do supabase-js para este schema.

create schema if not exists cvale;

create table if not exists cvale.cockpit_estado (
    id smallint primary key default 1,
    dados jsonb not null,
    kanban_order jsonb,
    atualizado_em timestamptz not null default now(),
    constraint cockpit_estado_singleton check (id = 1)
);

alter table cvale.cockpit_estado enable row level security;

-- PostgREST só acessa tabelas de schemas não-public se os roles anon/
-- authenticated tiverem USAGE no schema e os grants na tabela — RLS sozinha
-- não basta fora do public.
grant usage on schema cvale to anon, authenticated;
grant select on cvale.cockpit_estado to anon, authenticated;
grant insert, update, delete on cvale.cockpit_estado to authenticated;

-- Leitura: liberada para qualquer pessoa com o link (inclusive anônimos),
-- para o dashboard poder ser compartilhado como link público.
drop policy if exists "cockpit_estado_select_publico" on cvale.cockpit_estado;
create policy "cockpit_estado_select_publico"
    on cvale.cockpit_estado
    for select
    to anon, authenticated
    using (true);

-- Escrita: só para usuários autenticados (login criado manualmente em
-- Authentication > Users). Sem login, o app funciona só em modo leitura
-- e mantém as alterações apenas no localStorage do navegador.
drop policy if exists "cockpit_estado_write_autenticado" on cvale.cockpit_estado;
create policy "cockpit_estado_write_autenticado"
    on cvale.cockpit_estado
    for all
    to authenticated
    using (true)
    with check (true);
