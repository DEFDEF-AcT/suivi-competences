-- Séances de passation PRE : ajustements.
--  - 60 essais manqués par réseau et par 10 minutes (une classe entière partage souvent la même adresse) ;
--  - le poste reçoit l'identifiant de sa copie (reprise des réponses non envoyées après une coupure) ;
--  - chaque enregistrement renvoie l'heure de fin (une prolongation s'affiche sur les postes).

create or replace function private.pre_copie_poste(p_id uuid, p_token uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'ok', true, 'token', p_token, 'copie', c.id, 'nom', c.nom, 'prenom', c.prenom, 'intitule', s.intitule,
    'fin', s.expires_at, 'now', now(), 'n', c.n, 'sujet', c.sujet, 'answers', c.answers,
    'current', c.current, 'sorties', c.sorties,
    'images', coalesce((select jsonb_object_agg(e.key, e.value) from jsonb_each(s.images) e
                        where e.key in (select q ->> 'img' from jsonb_array_elements(c.sujet) q)), '{}'::jsonb))
  from public.pre_copies c join public.pre_seances s on s.id = c.seance_id
  where c.id = p_id;
$$;
revoke all on function private.pre_copie_poste(uuid, uuid) from public, anon, authenticated;

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
  if (select count(*) from private.pre_essais e where e.ip = v_ip and e.at > now() - interval '10 minutes') >= 60 then
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
  v_tok := gen_random_uuid();
  update public.pre_copies
     set token_hash = private.pre_hash(v_tok), started_at = coalesce(started_at, now()), last_seen = now()
   where id = v_c.id;
  return private.pre_copie_poste(v_c.id, v_tok);
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
  return jsonb_build_object('ok', true, 'remise', coalesce(p_remettre, false), 'fin', v_s.expires_at, 'now', now());
end $$;
