-- ============================================================================
-- Collègues : rôles, accès par partie (ISMI, BTS, PRE) et par classe.
-- Administrateur : tous les droits.
-- Collègue : voit uniquement les parties et classes qui lui sont attribuées ;
--   crée ses évaluations et en garde la main entière (modifier, supprimer) ;
--   positionne et note les étudiants sur toutes les évaluations de ses classes ;
--   ne peut ni modifier ni supprimer les évaluations des autres,
--   ni gérer classes, étudiants et barème.
-- ============================================================================

alter table public.members
  add column role text not null default 'collegue' check (role in ('admin', 'collegue')),
  add column email text,
  add column access jsonb not null default '{}'::jsonb,
  add column must_change_password boolean not null default false;

-- Les comptes déjà présents (le propriétaire) deviennent administrateurs.
update public.members m set role = 'admin', email = u.email from auth.users u where u.id = m.user_id;

/* ---------- Fonctions de contrôle (exécutées côté serveur) ---------- */
create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select private.is_member())
     and exists (select 1 from public.members m where m.user_id = (select auth.uid()) and m.role = 'admin');
$$;

-- Accès à une partie : 'ismi', 'bts' ou 'pre'.
create or replace function private.app_ok(p_app text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select private.is_member()) and exists (
    select 1 from public.members m where m.user_id = (select auth.uid()) and (
      m.role = 'admin'
      or (p_app = 'pre' and m.access -> 'pre' = 'true'::jsonb)
      or (p_app <> 'pre' and jsonb_typeof(m.access -> p_app) = 'object')));
$$;

-- Accès à une classe d'une partie (liste de classes absente ou nulle = toutes les classes).
create or replace function private.class_ok(p_app text, p_class text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select private.is_member()) and exists (
    select 1 from public.members m where m.user_id = (select auth.uid()) and (
      m.role = 'admin'
      or (jsonb_typeof(m.access -> p_app) = 'object' and (
            coalesce(jsonb_typeof(m.access -> p_app -> 'classes'), 'null') = 'null'
            or (m.access -> p_app -> 'classes') ? p_class))));
$$;

revoke all on function private.is_admin() from public, anon;
revoke all on function private.app_ok(text) from public, anon;
revoke all on function private.class_ok(text, text) from public, anon;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.app_ok(text) to authenticated;
grant execute on function private.class_ok(text, text) to authenticated;

/* ---------- Informations sur le compte connecté ---------- */
create or replace function public.my_access() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when (select private.is_member()) then (
    select jsonb_build_object('user_id', m.user_id, 'role', m.role, 'access', m.access,
                              'name', m.display_name, 'must_change_password', m.must_change_password)
    from public.members m where m.user_id = (select auth.uid()))
  end;
$$;
revoke all on function public.my_access() from public, anon;
grant execute on function public.my_access() to authenticated;

-- Noms des formateurs (pour « dernière saisie par … »), sans adresses ni droits.
create or replace function public.member_names() returns table (user_id uuid, display_name text)
language sql stable security definer set search_path = '' as $$
  select m.user_id, m.display_name from public.members m where (select private.is_member());
$$;
revoke all on function public.member_names() from public, anon;
grant execute on function public.member_names() to authenticated;

-- Après le changement du mot de passe provisoire.
create or replace function public.password_changed() returns void
language sql security definer set search_path = '' as $$
  update public.members set must_change_password = false where user_id = (select auth.uid());
$$;
revoke all on function public.password_changed() from public, anon;
grant execute on function public.password_changed() to authenticated;

/* ---------- Membres : chacun ne lit que sa ligne, l'administrateur lit tout ---------- */
drop policy members_select on public.members;
create policy members_select_self on public.members for select to authenticated
  using (user_id = (select auth.uid()) and (select private.is_member()));
create policy members_select_admin on public.members for select to authenticated
  using ((select private.is_admin()));

/* ---------- Évaluations ISMI et BTS ---------- */
drop policy docs_select on public.docs;
drop policy docs_insert on public.docs;
drop policy docs_update on public.docs;
drop policy docs_delete on public.docs;

create policy docs_select on public.docs for select to authenticated using (
  case coll
    when 'classes' then private.class_ok(app, id)
    when 'config'  then private.app_ok(app)
    else private.class_ok(app, data ->> 'classId')
  end);

create policy docs_insert on public.docs for insert to authenticated with check (
  (select private.is_admin())
  or (coll = 'evaluations' and data ->> 'createdBy' = (select auth.uid())::text and private.class_ok(app, data ->> 'classId'))
  or (coll = 'results' and private.class_ok(app, data ->> 'classId')));

create policy docs_update on public.docs for update to authenticated
  using (
    (select private.is_admin())
    or (coll = 'evaluations' and data ->> 'createdBy' = (select auth.uid())::text and private.class_ok(app, data ->> 'classId'))
    or (coll = 'results' and private.class_ok(app, data ->> 'classId')))
  with check (
    (select private.is_admin())
    or (coll = 'evaluations' and data ->> 'createdBy' = (select auth.uid())::text and private.class_ok(app, data ->> 'classId'))
    or (coll = 'results' and private.class_ok(app, data ->> 'classId')));

-- Un collègue ne supprime que ses évaluations, et les résultats de ses évaluations.
create policy docs_delete on public.docs for delete to authenticated using (
  (select private.is_admin())
  or (coll = 'evaluations' and data ->> 'createdBy' = (select auth.uid())::text and private.class_ok(app, data ->> 'classId'))
  or (coll = 'results' and private.class_ok(app, data ->> 'classId') and exists (
        select 1 from public.docs e
        where e.app = docs.app and e.coll = 'evaluations' and e.id = docs.data ->> 'evalId'
          and e.data ->> 'createdBy' = (select auth.uid())::text)));

drop policy docs_history_select on public.docs_history;
create policy docs_history_select on public.docs_history for select to authenticated using ((select private.is_admin()));

/* ---------- PRE : accès complet ou aucun ---------- */
drop policy pre_state_select on public.pre_state;
drop policy pre_state_insert on public.pre_state;
drop policy pre_state_update on public.pre_state;
create policy pre_state_select on public.pre_state for select to authenticated using ((select private.app_ok('pre')));
create policy pre_state_insert on public.pre_state for insert to authenticated with check ((select private.app_ok('pre')));
create policy pre_state_update on public.pre_state for update to authenticated
  using ((select private.app_ok('pre'))) with check ((select private.app_ok('pre')));

drop policy pre_history_select on public.pre_history;
create policy pre_history_select on public.pre_history for select to authenticated using ((select private.is_admin()));

drop policy app_keys_select on public.app_keys;
create policy app_keys_select on public.app_keys for select to authenticated using ((select private.app_ok('pre')));
