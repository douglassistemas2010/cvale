-- ============================================
-- Minhas Atividades - Planner: tarefas pessoais
-- ============================================
-- Rode este script uma vez em: Supabase > SQL Editor > New query
-- (depois do schema.sql, que cria o schema "cvale" e os grants de uso).
--
-- As "Minhas tarefas" do Planner são PRIVADAS: diferente de cvale.cockpit_estado
-- (leitura pública para o dashboard compartilhado), esta tabela NÃO dá nenhum
-- grant ao role anon. Só um usuário autenticado (modo edição) lê e grava.
-- Sem login, as tarefas ficam apenas no localStorage do navegador.
--
-- Mesmo padrão da tabela do cockpit: uma linha única (id = 1) com um jsonb.
-- A coluna atualizado_em é usada pelo app para decidir qual lado é mais novo
-- (navegador x servidor) ao sincronizar.

create schema if not exists cvale;

create table if not exists cvale.planner_tarefas (
    id smallint primary key default 1,
    dados jsonb not null default '[]'::jsonb,
    atualizado_em timestamptz not null default now(),
    constraint planner_tarefas_singleton check (id = 1)
);

alter table cvale.planner_tarefas enable row level security;

grant usage on schema cvale to authenticated;
grant select, insert, update, delete on cvale.planner_tarefas to authenticated;

drop policy if exists "planner_tarefas_autenticado" on cvale.planner_tarefas;
create policy "planner_tarefas_autenticado"
    on cvale.planner_tarefas
    for all
    to authenticated
    using (true)
    with check (true);
