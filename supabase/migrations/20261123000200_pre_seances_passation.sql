-- ============================================================================
-- PRE : séances de passation multi-postes du test théorique (code de séance).
--
-- Le formateur ouvre une séance depuis l'onglet « Test théorique » de PRE :
-- l'interface tire les sujets (mêmes règles que la passation sur poste) et les
-- dépose ici, sans les bonnes réponses dans la partie lisible par les postes.
-- Chaque stagiaire ouvre passation.html sur n'importe quel appareil, saisit le
-- code, son nom et sa date de naissance, et répond ; chaque réponse est
-- enregistrée dans SA copie (aucun conflit entre postes).
--
-- Sécurité :
--  - les tables ne sont lisibles par personne directement (RLS sans politique) ;
--  - les postes des stagiaires (sans compte) n'ont que 3 fonctions : ouvrir sa
--    copie (code + nom + date de naissance, essais limités), la reprendre, et
--    enregistrer ses réponses ; ils ne reçoivent jamais le corrigé ;
--  - les fonctions du formateur exigent l'accès PRE (et la double
--    authentification quand elle est activée).
-- ============================================================================

create table public.pre_seances (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  session_id  text not null,
  intitule    text not null default '',
  images      jsonb not null default '{}'::jsonb,   -- illustrations des questions (sans réponse)
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  closed_at   timestamptz,                           -- clôturée : les postes ne peuvent plus répondre
  termine_at  timestamptz                            -- copies ramassées dans PRE, sujets effacés
);

create table public.pre_copies (
  id           uuid primary key default gen_random_uuid(),
  seance_id    uuid not null references public.pre_seances (id) on delete cascade,
  st_id        text not null,
  att_id       text not null,
  nom          text not null,
  prenom       text not null default '',
  nom_norm     text not null,
  prenom_norm  text not null default '',
  ddn          date not null,
  n            integer not null,
  sujet        jsonb,              -- questions et choix, SANS les bonnes réponses (envoyé au poste)
  att          jsonb,              -- tentative complète avec corrigé : jamais envoyée aux postes
  answers      jsonb not null default '{}'::jsonb,
  current      integer not null default 0,
  sorties      integer not null default 0,   -- fois où le stagiaire a quitté la page du test
  token_hash   text,
  started_at   timestamptz,
  last_seen    timestamptz,
  submitted_at timestamptz,
  unique (seance_id, st_id)
);
create index pre_copies_seance_idx on public.pre_copies (seance_id);
create unique index pre_copies_token_idx on public.pre_copies (token_hash) where token_hash is not null;

create table private.pre_essais (
  ip text not null,
  at timestamptz not null default now()
);
create index pre_essais_ip_idx on private.pre_essais (ip, at);

alter table public.pre_seances enable row level security;
alter table public.pre_copies enable row level security;
revoke all on public.pre_seances from anon, authenticated;
revoke all on public.pre_copies from anon, authenticated;

/* ---------- Outils ---------- */
-- Nom comparable : sans accents, espaces, tirets ni apostrophes, en majuscules.
create or replace function private.pre_norm(t text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(upper(translate(
    replace(replace(replace(replace(coalesce(t, ''), 'æ', 'ae'), 'Æ', 'AE'), 'œ', 'oe'), 'Œ', 'OE'),
    'àâäáãåçéèêëíìîïñóòôöõøúùûüýÿÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕØÚÙÛÜÝŸ',
    'aaaaaaceeeeiiiinoooooouuuuyyAAAAAACEEEEIIIINOOOOOOUUUUYY')), '[^A-Z]', '', 'g');
$$;

-- Code de séance : 6 caractères sans ambiguïté (ni I, L, O, 0, 1), tirés d'un générateur sûr.
create or replace function private.pre_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  a constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  b bytea := uuid_send(gen_random_uuid());
  r text := '';
  i integer;
begin
  foreach i in array array[0, 1, 2, 3, 4, 5] loop
    r := r || substr(a, 1 + get_byte(b, i) % 31, 1);
  end loop;
  return r;
end $$;

create or replace function private.pre_ip() returns text
language sql stable set search_path = '' as $$
  select coalesce(nullif(trim(split_part(coalesce(
    (nullif(current_setting('request.headers', true), '')::json) ->> 'x-forwarded-for', ''), ',', 1)), ''), 'inconnu');
$$;

create or replace function private.pre_hash(p_token uuid) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(p_token::text, 'UTF8')), 'hex');
$$;

-- Ce que reçoit le poste du stagiaire : son sujet (sans corrigé), ses réponses, ses illustrations.
create or replace function private.pre_copie_poste(p_id uuid, p_token uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'ok', true, 'token', p_token, 'nom', c.nom, 'prenom', c.prenom, 'intitule', s.intitule,
    'fin', s.expires_at, 'now', now(), 'n', c.n, 'sujet', c.sujet, 'answers', c.answers,
    'current', c.current, 'sorties', c.sorties,
    'images', coalesce((select jsonb_object_agg(e.key, e.value) from jsonb_each(s.images) e
                        where e.key in (select q ->> 'img' from jsonb_array_elements(c.sujet) q)), '{}'::jsonb))
  from public.pre_copies c join public.pre_seances s on s.id = c.seance_id
  where c.id = p_id;
$$;

/* ---------- Postes des stagiaires (sans compte) ---------- */
create or replace function public.passation_ouvrir(p_code text, p_nom text, p_ddn date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_ip   text := private.pre_ip();
  v_norm text := private.pre_norm(p_nom);
  v_s    public.pre_seances;
  v_ids  uuid[];
  v_c    public.pre_copies;
  v_tok  uuid;
begin
  if (select count(*) from private.pre_essais e where e.ip = v_ip and e.at > now() - interval '10 minutes') >= 40 then
    return jsonb_build_object('ok', false, 'err', 'essais');
  end if;
  select * into v_s from public.pre_seances s
   where s.code = upper(regexp_replace(left(coalesce(p_code, ''), 40), '[^A-Za-z0-9]', '', 'g'));
  if not found then
    insert into private.pre_essais (ip) values (v_ip);
    return jsonb_build_object('ok', false, 'err', 'code');
  end if;
  if v_s.closed_at is not null or v_s.expires_at < now() then
    return jsonb_build_object('ok', false, 'err', 'ferme');
  end if;
  select array_agg(c.id) into v_ids from public.pre_copies c
   where c.seance_id = v_s.id and c.ddn = p_ddn and length(v_norm) >= 2
     and v_norm in (c.nom_norm, c.nom_norm || c.prenom_norm, c.prenom_norm || c.nom_norm);
  if v_ids is null then
    insert into private.pre_essais (ip) values (v_ip);
    return jsonb_build_object('ok', false, 'err', 'identite');
  end if;
  if array_length(v_ids, 1) > 1 then
    return jsonb_build_object('ok', false, 'err', 'homonyme');
  end if;
  select * into v_c from public.pre_copies c where c.id = v_ids[1];
  if v_c.submitted_at is not null then
    return jsonb_build_object('ok', false, 'err', 'remise');
  end if;
  -- Nouveau jeton : si la copie était ouverte sur un autre poste, ce poste-là est déconnecté.
  v_tok := gen_random_uuid();
  update public.pre_copies
     set token_hash = private.pre_hash(v_tok), started_at = coalesce(started_at, now()), last_seen = now()
   where id = v_c.id;
  return private.pre_copie_poste(v_c.id, v_tok);
end $$;

create or replace function public.passation_reprendre(p_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_c public.pre_copies; v_s public.pre_seances;
begin
  select * into v_c from public.pre_copies c where c.token_hash = private.pre_hash(p_token);
  if not found then return jsonb_build_object('ok', false, 'err', 'jeton'); end if;
  if v_c.submitted_at is not null then return jsonb_build_object('ok', false, 'err', 'remise'); end if;
  select * into v_s from public.pre_seances s where s.id = v_c.seance_id;
  if v_s.closed_at is not null or v_s.expires_at < now() then return jsonb_build_object('ok', false, 'err', 'ferme'); end if;
  update public.pre_copies set last_seen = now() where id = v_c.id;
  return private.pre_copie_poste(v_c.id, p_token);
end $$;

create or replace function public.passation_enregistrer(p_token uuid, p_answers jsonb, p_current integer,
                                                       p_sorties integer, p_remettre boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_c public.pre_copies; v_s public.pre_seances;
begin
  select * into v_c from public.pre_copies c where c.token_hash = private.pre_hash(p_token);
  if not found then return jsonb_build_object('ok', false, 'err', 'jeton'); end if;
  if v_c.submitted_at is not null then return jsonb_build_object('ok', false, 'err', 'remise'); end if;
  select * into v_s from public.pre_seances s where s.id = v_c.seance_id;
  if v_s.closed_at is not null or v_s.expires_at < now() then return jsonb_build_object('ok', false, 'err', 'ferme'); end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or octet_length(p_answers::text) > 60000
     or exists (
       select 1 from jsonb_each(p_answers) e
        where jsonb_typeof(e.value) <> 'array' or jsonb_array_length(e.value) > 10
           or not exists (select 1 from jsonb_array_elements(v_c.sujet) q where q ->> 'id' = e.key)
           or exists (select 1 from jsonb_array_elements(e.value) x
                       where jsonb_typeof(x) <> 'number' or x::text !~ '^[0-9]$')) then
    return jsonb_build_object('ok', false, 'err', 'format');
  end if;
  update public.pre_copies
     set answers = p_answers,
         current = greatest(0, least(coalesce(p_current, 0), v_c.n)),
         sorties = greatest(v_c.sorties, least(coalesce(p_sorties, 0), 1000)),
         last_seen = now(),
         submitted_at = case when coalesce(p_remettre, false) then now() else null end
   where id = v_c.id;
  return jsonb_build_object('ok', true, 'remise', coalesce(p_remettre, false));
end $$;

/* ---------- Formateur (accès PRE) ---------- */
create or replace function public.pre_seance_creer(p_session text, p_intitule text, p_minutes integer,
                                                  p_copies jsonb, p_images jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_code text; v_exp timestamptz; v_try integer := 0;
begin
  if not (select private.app_ok('pre')) then raise exception 'pre_acces' using errcode = '42501'; end if;
  if p_minutes is null or p_minutes < 10 or p_minutes > 720 then raise exception 'pre_duree'; end if;
  if p_copies is null or jsonb_typeof(p_copies) <> 'array' or jsonb_array_length(p_copies) not between 1 and 200 then
    raise exception 'pre_copies';
  end if;
  if jsonb_typeof(coalesce(p_images, '{}'::jsonb)) <> 'object' or octet_length(coalesce(p_images, '{}'::jsonb)::text) > 12000000 then
    raise exception 'pre_images';
  end if;
  -- Ménage : séances terminées depuis plus de 30 jours, essais anciens.
  delete from public.pre_seances where expires_at < now() - interval '30 days';
  delete from private.pre_essais where at < now() - interval '1 day';
  v_exp := now() + make_interval(mins => p_minutes);
  loop
    v_code := private.pre_code();
    begin
      insert into public.pre_seances (code, session_id, intitule, images, created_by, expires_at)
      values (v_code, left(coalesce(p_session, ''), 100), left(coalesce(p_intitule, ''), 200),
              coalesce(p_images, '{}'::jsonb), auth.uid(), v_exp)
      returning id into v_id;
      exit;
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try > 30 then raise; end if;
    end;
  end loop;
  insert into public.pre_copies (seance_id, st_id, att_id, nom, prenom, nom_norm, prenom_norm, ddn, n, sujet, att)
  select v_id, x.st, x.att_id, left(x.nom, 120), left(coalesce(x.prenom, ''), 120),
         private.pre_norm(x.nom), private.pre_norm(x.prenom), x.ddn, jsonb_array_length(x.sujet), x.sujet, x.att
    from jsonb_to_recordset(p_copies) as x (st text, att_id text, nom text, prenom text, ddn date, sujet jsonb, att jsonb);
  return jsonb_build_object('id', v_id, 'code', v_code, 'expires_at', v_exp);
end $$;

-- Séances à suivre : ouvertes, ou clôturées dont le ramassage n'est pas terminé.
create or replace function public.pre_seances_etat()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.app_ok('pre')) then raise exception 'pre_acces' using errcode = '42501'; end if;
  return jsonb_build_object('now', now(), 'seances', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'code', s.code, 'session', s.session_id, 'intitule', s.intitule,
      'creee', s.created_at, 'fin', s.expires_at, 'cloturee', s.closed_at,
      'copies', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', c.id, 'st', c.st_id, 'att', c.att_id, 'nom', c.nom, 'prenom', c.prenom, 'n', c.n,
          'nb', (select count(*) from jsonb_each(c.answers) e where jsonb_array_length(e.value) > 0),
          'current', c.current, 'sorties', c.sorties, 'debut', c.started_at, 'vu', c.last_seen,
          'remise', c.submitted_at) order by c.nom, c.prenom)
        from public.pre_copies c where c.seance_id = s.id), '[]'::jsonb))
      order by s.created_at)
    from public.pre_seances s where s.termine_at is null), '[]'::jsonb));
end $$;

create or replace function public.pre_copie_lire(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  if not (select private.app_ok('pre')) then raise exception 'pre_acces' using errcode = '42501'; end if;
  select jsonb_build_object('id', c.id, 'st', c.st_id, 'att_id', c.att_id, 'answers', c.answers,
                            'debut', c.started_at, 'remise', c.submitted_at, 'att', c.att)
    into r from public.pre_copies c where c.id = p_id;
  return r;
end $$;

-- prolonger (p_minutes), cloturer (les postes ne peuvent plus répondre),
-- terminer (copies ramassées dans PRE : sujets, illustrations et jetons effacés).
create or replace function public.pre_seance_action(p_id uuid, p_action text, p_minutes integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_s public.pre_seances;
begin
  if not (select private.app_ok('pre')) then raise exception 'pre_acces' using errcode = '42501'; end if;
  select * into v_s from public.pre_seances where id = p_id for update;
  if not found then raise exception 'pre_seance_inconnue'; end if;
  if p_action = 'prolonger' then
    if v_s.closed_at is not null then raise exception 'pre_seance_close'; end if;
    update public.pre_seances
       set expires_at = greatest(expires_at, now()) + make_interval(mins => least(greatest(coalesce(p_minutes, 15), 5), 240))
     where id = p_id;
  elsif p_action = 'cloturer' then
    update public.pre_seances set closed_at = coalesce(closed_at, now()) where id = p_id;
  elsif p_action = 'terminer' then
    update public.pre_seances set closed_at = coalesce(closed_at, now()), termine_at = now(), images = '{}'::jsonb where id = p_id;
    update public.pre_copies set sujet = null, token_hash = null where seance_id = p_id;
  else
    raise exception 'pre_action';
  end if;
  select * into v_s from public.pre_seances where id = p_id;
  return jsonb_build_object('id', v_s.id, 'fin', v_s.expires_at, 'cloturee', v_s.closed_at, 'terminee', v_s.termine_at);
end $$;

/* ---------- Droits ---------- */
revoke all on function private.pre_norm(text) from public, anon, authenticated;
revoke all on function private.pre_code() from public, anon, authenticated;
revoke all on function private.pre_ip() from public, anon, authenticated;
revoke all on function private.pre_hash(uuid) from public, anon, authenticated;
revoke all on function private.pre_copie_poste(uuid, uuid) from public, anon, authenticated;

revoke all on function public.passation_ouvrir(text, text, date) from public;
revoke all on function public.passation_reprendre(uuid) from public;
revoke all on function public.passation_enregistrer(uuid, jsonb, integer, integer, boolean) from public;
grant execute on function public.passation_ouvrir(text, text, date) to anon, authenticated;
grant execute on function public.passation_reprendre(uuid) to anon, authenticated;
grant execute on function public.passation_enregistrer(uuid, jsonb, integer, integer, boolean) to anon, authenticated;

revoke all on function public.pre_seance_creer(text, text, integer, jsonb, jsonb) from public, anon;
revoke all on function public.pre_seances_etat() from public, anon;
revoke all on function public.pre_copie_lire(uuid) from public, anon;
revoke all on function public.pre_seance_action(uuid, text, integer) from public, anon;
grant execute on function public.pre_seance_creer(text, text, integer, jsonb, jsonb) to authenticated;
grant execute on function public.pre_seances_etat() to authenticated;
grant execute on function public.pre_copie_lire(uuid) to authenticated;
grant execute on function public.pre_seance_action(uuid, text, integer) to authenticated;
