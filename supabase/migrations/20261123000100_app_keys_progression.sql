-- Clés « pre-… » : accès PRE ; clés « prog-… » (artefact de progression du BTS) : accès BTS.
drop policy app_keys_select on public.app_keys;
create policy app_keys_select on public.app_keys for select to authenticated using (
  (name like 'pre-%' and (select private.app_ok('pre')))
  or (name like 'prog-%' and (select private.app_ok('bts'))));
