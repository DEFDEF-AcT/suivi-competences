-- Les évaluations sont chargées par formation entière : l'index par classe ne sert pas.
drop index if exists public.docs_class_idx;
-- Index des clés étrangères (suppression d'un compte utilisateur).
create index if not exists docs_updated_by_idx on public.docs (updated_by);
create index if not exists pre_state_updated_by_idx on public.pre_state (updated_by);
