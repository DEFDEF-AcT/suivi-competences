-- ============================================================================
-- Suivi des compétences (ISMI · BTS MV · PRE) — schéma et sécurité
-- Principe : rien n'est lisible sans être connecté ET inscrit dans « members ».
-- Si la double authentification est activée sur un compte, elle est exigée.
-- ============================================================================

create schema if not exists private;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------- Membres
-- Liste blanche des comptes autorisés (ajout uniquement par l'administrateur, en SQL).
create table public.members (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at   timestamptz not null default now()
);
alter table public.members enable row level security;
revoke all on public.members from anon;

create or replace function private.is_member() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.members m where m.user_id = (select auth.uid()))
     and (
       coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
       or not exists (
         select 1 from auth.mfa_factors f
         where f.user_id = (select auth.uid()) and f.status = 'verified'
       )
     );
$$;
revoke all on function private.is_member() from public, anon;
grant execute on function private.is_member() to authenticated;

create policy members_select on public.members
  for select to authenticated using ((select private.is_member()));

-- ---------------------------------------------------------------- Outils
create or replace function private.touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

-- Fusion profonde de deux objets JSON (même règle que l'application :
-- les objets se fusionnent, toute autre valeur remplace, null efface).
create or replace function private.jsonb_merge(a jsonb, b jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case
    when jsonb_typeof(a) = 'object' and jsonb_typeof(b) = 'object' then
      coalesce((
        select jsonb_object_agg(k,
          case when a ? k and b ? k then private.jsonb_merge(a -> k, b -> k)
               when b ? k then b -> k
               else a -> k end)
        from (select jsonb_object_keys(a) as k union select jsonb_object_keys(b)) s
      ), '{}'::jsonb)
    else b
  end
$$;
revoke all on function private.jsonb_merge(jsonb, jsonb) from public, anon;
grant execute on function private.jsonb_merge(jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------- ISMI et BTS
-- Un document = une classe, un étudiant, une évaluation, un résultat ou un réglage.
create table public.docs (
  app        text not null check (app in ('ismi', 'bts')),
  coll       text not null check (coll ~ '^[a-z]{1,40}$'),
  id         text not null check (length(id) between 1 and 200),
  data       jsonb not null default '{}'::jsonb,
  client_id  text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (app, coll, id)
);
create index docs_class_idx on public.docs (app, coll, (data ->> 'classId'));
alter table public.docs enable row level security;
revoke all on public.docs from anon;

create policy docs_select on public.docs for select to authenticated using ((select private.is_member()));
create policy docs_insert on public.docs for insert to authenticated with check ((select private.is_member()));
create policy docs_update on public.docs for update to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));
create policy docs_delete on public.docs for delete to authenticated using ((select private.is_member()));

create trigger docs_touch before insert or update on public.docs
  for each row execute function private.touch();

-- Mise à jour partielle (fusion côté serveur, sans écraser les autres champs).
create or replace function public.doc_merge(p_app text, p_coll text, p_id text, p_patch jsonb, p_client text default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r jsonb;
begin
  insert into public.docs as d (app, coll, id, data, client_id)
  values (p_app, p_coll, p_id, p_patch, p_client)
  on conflict (app, coll, id) do update
    set data = private.jsonb_merge(d.data, excluded.data), client_id = excluded.client_id
  returning d.data into r;
  return r;
end $$;
revoke all on function public.doc_merge(text, text, text, jsonb, text) from public, anon;
grant execute on function public.doc_merge(text, text, text, jsonb, text) to authenticated;

-- Historique : chaque suppression, et l'état d'un document au plus une fois
-- toutes les 30 minutes quand il change (permet de revenir en arrière).
create table public.docs_history (
  hid        bigint generated always as identity primary key,
  app        text not null,
  coll       text not null,
  id         text not null,
  data       jsonb,
  op         text not null,
  changed_at timestamptz not null default now(),
  changed_by uuid
);
create index docs_history_doc_idx on public.docs_history (app, coll, id, changed_at desc);
alter table public.docs_history enable row level security;
revoke all on public.docs_history from anon;
create policy docs_history_select on public.docs_history for select to authenticated using ((select private.is_member()));

create or replace function private.docs_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    insert into public.docs_history (app, coll, id, data, op, changed_by)
    values (old.app, old.coll, old.id, old.data, 'delete', auth.uid());
    return old;
  end if;
  if new.data is distinct from old.data and not exists (
    select 1 from public.docs_history h
    where h.app = old.app and h.coll = old.coll and h.id = old.id
      and h.changed_at > now() - interval '30 minutes'
  ) then
    insert into public.docs_history (app, coll, id, data, op, changed_by)
    values (old.app, old.coll, old.id, old.data, 'update', auth.uid());
  end if;
  return new;
end $$;
create trigger docs_audit after update or delete on public.docs
  for each row execute function private.docs_audit();

-- Synchronisation en direct entre appareils.
alter publication supabase_realtime add table public.docs;

-- ---------------------------------------------------------------- PRE-VE
-- L'état complet de l'interface PRE (un seul enregistrement, versionné).
create table public.pre_state (
  id         text primary key default 'main' check (id = 'main'),
  state      jsonb not null,
  version    integer not null default 1,
  saved_at   timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.pre_state enable row level security;
revoke all on public.pre_state from anon;
create policy pre_state_select on public.pre_state for select to authenticated using ((select private.is_member()));
create policy pre_state_insert on public.pre_state for insert to authenticated with check ((select private.is_member()));
create policy pre_state_update on public.pre_state for update to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));

create table public.pre_history (
  hid         bigint generated always as identity primary key,
  state       jsonb not null,
  version     integer,
  saved_at    timestamptz,
  saved_by    uuid,
  archived_at timestamptz not null default now()
);
alter table public.pre_history enable row level security;
revoke all on public.pre_history from anon;
create policy pre_history_select on public.pre_history for select to authenticated using ((select private.is_member()));

-- Copie de l'état précédent au plus toutes les 15 minutes ; on garde les 100 dernières.
create or replace function private.pre_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.pre_history h where h.archived_at > now() - interval '15 minutes') then
    insert into public.pre_history (state, version, saved_at, saved_by)
    values (old.state, old.version, old.saved_at, old.updated_by);
    delete from public.pre_history
    where hid not in (select hid from public.pre_history order by hid desc limit 100);
  end if;
  return new;
end $$;
create trigger pre_audit after update on public.pre_state
  for each row execute function private.pre_audit();

-- Enregistrement avec contrôle de version : refusé si un autre appareil a
-- enregistré entre-temps (sauf choix explicite d'écraser).
create or replace function public.pre_save(p_state jsonb, p_expected integer, p_force boolean default false)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v integer;
begin
  if p_state is null or jsonb_typeof(p_state) <> 'object' then
    raise exception 'invalid_state';
  end if;
  insert into public.pre_state as p (id, state, version, saved_at, updated_by)
  values ('main', p_state, 1, now(), auth.uid())
  on conflict (id) do update
    set state = excluded.state, version = p.version + 1, saved_at = now(), updated_by = auth.uid()
    where p_force or p.version = p_expected
  returning p.version into v;
  if v is null then
    raise exception 'pre_conflict' using errcode = 'PT409';
  end if;
  return v;
end $$;
revoke all on function public.pre_save(jsonb, integer, boolean) from public, anon;
grant execute on function public.pre_save(jsonb, integer, boolean) to authenticated;

-- ---------------------------------------------------------------- Fichiers privés
-- L'interface PRE (banque de questions avec réponses) n'est jamais publique :
-- elle est stockée ici et ne se télécharge qu'après connexion.
insert into storage.buckets (id, name, public, file_size_limit)
values ('interfaces', 'interfaces', false, 20971520)
on conflict (id) do nothing;

create policy interfaces_read on storage.objects for select to authenticated
  using (bucket_id = 'interfaces' and (select private.is_member()));
create policy interfaces_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'interfaces' and (select private.is_member()));
create policy interfaces_update on storage.objects for update to authenticated
  using (bucket_id = 'interfaces' and (select private.is_member()))
  with check (bucket_id = 'interfaces' and (select private.is_member()));
