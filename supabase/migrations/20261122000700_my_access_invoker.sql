-- Le compte connecté lit sa propre ligne grâce aux règles de la table : pas besoin de droits étendus.
alter function public.my_access() security invoker;
-- member_names() et password_changed() restent SECURITY DEFINER volontairement :
-- la première ne renvoie que les noms affichés, la seconde ne modifie que la ligne de l'appelant.
