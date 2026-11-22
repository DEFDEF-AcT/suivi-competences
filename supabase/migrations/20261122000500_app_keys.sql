-- Clés de déchiffrement de l'interface PRE livrée chiffrée avec l'application.
-- Lisibles uniquement par les comptes autorisés (et après double authentification si elle est activée).
create table public.app_keys (
  name       text primary key check (name ~ '^[a-z0-9-]{3,60}$'),
  key        text not null,
  created_at timestamptz not null default now()
);
alter table public.app_keys enable row level security;
revoke all on public.app_keys from anon;
create policy app_keys_select on public.app_keys for select to authenticated using ((select private.is_member()));
