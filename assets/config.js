/* Réglages de connexion à la base de données.
   La clé « publishable » est faite pour être publique : elle ne donne accès à rien sans
   identifiant et mot de passe, car chaque table est protégée côté serveur (Row Level Security). */
window.APP_CONFIG = {
  supabaseUrl: 'https://hkjzjpxsnmfifrwvtdqe.supabase.co',
  supabaseKey: 'sb_publishable_tS4Ib5VRdAX-f753b_vURw_NLSy9_Dk',
  idleMinutes: 60,          // déconnexion automatique après 60 min sans activité
  etablissement: 'Lycée Joseph Gallieni · Toulouse'
};
