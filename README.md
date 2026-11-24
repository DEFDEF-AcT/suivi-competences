# Suivi des compétences — ISMI · BTS MV · Habilitations PRE

Application web de suivi de l'acquisition des compétences, accessible depuis un ordinateur, une tablette ou un téléphone après connexion par identifiant et mot de passe.

| Partie | Contenu |
|---|---|
| **Évaluations ISMI** | Blocs 1 et 3 (référentiel GIP-FCIP de Toulouse) : grilles MI à TBM, fiche de saisie par étudiant, note indicative, profil de compétences, synthèse de classe, export Excel. Reprise de la première mouture `Evaluations_ISMI.html`. |
| **Évaluations BTS MV** | Même moteur, référentiel 2027 (arrêté du 10 décembre 2025). Les 4 pôles ne sont pas dissociés : chaque évaluation indique son **pôle dominant** (demandé à la création ; ses critères sont positionnés, ceux des autres pôles peuvent être mobilisés), la synthèse et la fiche étudiant présentent les 4 pôles et leurs 11 compétences ensemble. Une ligne = une rubrique de critères du J.O., indicateurs recopiés mot pour mot. Statuts Abordée / Mobilisée / Fortement mobilisée ; alerte au-delà de 3 compétences FM par activité. |
| **Progression BTS** | Onglet *Progression* du BTS : l'artefact « Atelier BTS MV » de l'équipe, **tel quel** (calendrier, travaux pratiques, compétences, AFSM et physique, organisation), livré chiffré comme l'interface PRE. Dans le détail de chaque module du calendrier : un bouton « Évaluer » en face de chaque TP (évaluation pré-remplie : module, TP, pôle dominant, critères des compétences FM) et un bloc « Évaluations de la classe » (prévu / évalué par compétence, saisie, moyenne, part acquise). *Analyse détaillée du module* : compétences, étudiants, TP, alertes de cohérence avec la matrice. Nouvelle version de l'artefact : BTS → Réglages → *Mettre à jour la progression…* |
| **Bilans de compétences** | Onglet *Bilans* (ISMI et BTS), ou bouton *Bilan de compétences* de la fiche étudiant : à tout moment, un bilan imprimable ou en PDF (imprimante « Enregistrer au format PDF »), pour un étudiant ou toute la classe (une page A4 par étudiant, deux en général). Toile des compétences comparée à la moyenne de la classe, chiffres clés, niveau de chaque compétence au dernier positionnement, évaluations prises en compte, cadre d'appréciation et signatures. **BTS** : bilan global (4 pôles), épreuves **E5, E7 et E8** (pôles 1, 3 et 4, avec note indicative par épreuve et moyenne pondérée par les coefficients), un pôle, ou un module de formation de la progression (compétences prévues et évaluées). **ISMI** : un bloc ou les deux. Période au choix (dates « du … au … »). |
| **Habilitations PRE-VE** | L'interface `PRE-VE_Gestion_Formation…html`, **sans aucune modification**, avec ses données enregistrées en ligne. |
| **Test PRE multi-postes** | Onglet *Test théorique* de PRE → carte *Passation multi-postes* : vous ouvrez une séance pour les stagiaires cochés, un **code de séance** s'affiche (bouton *Afficher le code en grand* pour le vidéoprojecteur). Chaque stagiaire ouvre `passation.html` (lien « Stagiaire : passer le test théorique PRE » sous la connexion) sur n'importe quel ordinateur, tablette ou téléphone, saisit le code, son nom et sa date de naissance, et répond. Chaque réponse est enregistrée aussitôt dans **sa** copie ; le suivi est en direct (connectés, avancement, copies remises, sorties de la page). Les copies remises arrivent seules dans PRE et se valident avec *Résultats et validation*. *+ 15 min* prolonge ; *Clôturer et ramasser les copies* ramasse les copies commencées en l'état et annule le test des absents. |

## Sécurité

- **Connexion obligatoire** (Supabase Auth). Les inscriptions sont fermées : seuls les comptes créés par l'administrateur existent.
- **Liste blanche** : un compte connecté ne voit rien tant qu'il n'est pas inscrit dans la table `members`.
- **Double authentification** (code à 6 chiffres sur téléphone) à activer depuis l'accueil ; elle est alors exigée par la base elle-même.
- **Protection côté serveur** (Row Level Security) sur toutes les tables et sur l'espace de fichiers : la clé publique présente dans le code ne donne accès à rien.
- **Interface PRE chiffrée** : le fichier contient la banque de questions de l'habilitation et ses réponses. Il est livré avec l'application **chiffré** (`assets/pre-ve.bin`, AES-256-GCM) : sur ce dépôt public il est illisible. La clé est dans la base (table `app_keys`) et ne se lit qu'après connexion. Dans son cadre, toute connexion réseau est interdite à l'interface.
- **Rien ne reste sur l'appareil** : session fermée avec le navigateur (sauf « Rester connecté » coché), déconnexion automatique après 60 min d'inactivité, données de travail effacées à la déconnexion.
- Bibliothèques hébergées avec l'application (aucun script tiers), politique de sécurité du contenu (CSP) stricte, base de données hébergée à Paris (Supabase, région eu-west-3).

## Enregistrement des données

- **Automatique** : chaque saisie part immédiatement dans la base. Indicateur « Enregistré à 14h32 » en haut de page.
- **Bouton « Enregistrer »** : envoie les dernières saisies et vérifie que tout est bien arrivé.
- **Plusieurs appareils** : les modifications faites ailleurs apparaissent en direct (ISMI, BTS). Pour PRE, un contrôle de version empêche d'écraser sans le savoir le travail fait sur un autre appareil.
- **Historique** : la base garde l'état précédent des documents modifiés ou supprimés (ISMI, BTS) et les 100 dernières versions des données PRE. Restauration possible en cas d'erreur.
- **Copies de sécurité** : accueil → onglet *Administration* → « Télécharger une sauvegarde complète » (un fichier .json). Dans chaque partie : Réglages → « Télécharger une copie de sécurité » / « Restaurer une sauvegarde… » (accepte aussi les sauvegardes .json de la première version ISMI) ; dans PRE, ses propres boutons « Exporter / Ouvrir une sauvegarde ».

> PRE s'enregistre en ligne comme le reste : chaque champ validé est envoyé dans la seconde. L'indicateur d'enregistrement de l'interface PRE affiche l'état en ligne (« ✓ Enregistré en ligne à … ») ; un champ en cours de saisie est validé et envoyé quand on quitte la page, change d'onglet ou clique sur « Enregistrer ». Le bouton d'origine « Enregistrer le fichier » reste disponible pour garder, en plus, une copie sur l'ordinateur.

## Mise en route (une seule fois)

1. **Créer votre compte** — tableau de bord Supabase du projet `suivi-competences` → *Authentication* → *Users* → *Add user* → *Create new user* : votre adresse e-mail, un mot de passe d'au moins 12 caractères, cocher *Auto Confirm User*.
2. **Autoriser ce compte** — *SQL Editor* → exécuter :
   ```sql
   insert into public.members (user_id, display_name)
   select id, 'Prénom Nom' from auth.users where email = 'votre.adresse@exemple.fr';
   ```
3. **Fermer les inscriptions** — *Authentication* → *Sign In / Providers* → désactiver *Allow new users to sign up*.
4. **Se connecter** à l'application, puis accueil → onglet *Mon compte* → *Double authentification* → *Activer*.
5. **Ouvrir *Habilitations PRE-VE*** — l'interface est déjà intégrée. À la toute première ouverture, les données de votre fichier PRE sont copiées dans la base. Si votre navigateur contient des données PRE plus récentes que ce fichier : dans votre ancien fichier, *Exporter la sauvegarde*, puis dans l'application *Ouvrir une sauvegarde*.

## Gestion courante

- **Supprimer une classe** (administrateur) : Réglages → *Classes de la formation* → *Supprimer* sur la ligne de la classe, puis retaper son nom pour confirmer. Ses étudiants, évaluations et positionnements sont effacés pour tous ; une copie reste dans l'historique de la base (restauration possible en cas d'erreur).
- **Collègues** : accueil → onglet *⚙ Administration* (visible de l'administrateur seul) → *Équipe* → *Ajouter un collègue*. Vous choisissez son nom, son adresse (identifiant) et ses accès : ISMI et/ou BTS MV (toutes les classes ou seulement certaines), PRE. Un mot de passe provisoire s'affiche une seule fois : transmettez-le par un moyen sûr ; le collègue choisit son propre mot de passe à la première connexion. *Modifier*, *Nouveau mot de passe* (remet aussi à zéro sa double authentification) et *Retirer* sont dans la même liste.
- **Droits d'un collègue** (appliqués par la base, pas seulement par l'affichage) : il ne voit que les parties et classes attribuées ; il crée ses évaluations et peut les modifier ou les supprimer ; il positionne et note les étudiants sur toutes les évaluations de ses classes, y compris les vôtres, sans pouvoir modifier ni supprimer les vôtres ; classes, étudiants, barème, restauration et historique restent réservés à l'administrateur. L'accès PRE est complet ou nul (l'interface PRE ne distingue pas les formateurs).
- **Mot de passe oublié** : *Authentication* → *Users* → l'utilisateur → définir un nouveau mot de passe. Téléphone perdu (double authentification) : même écran → supprimer le facteur MFA.
- **Nombre de questions du test PRE** : onglet *Test théorique* → carte *Nombre de questions du test* (par domaine ; fondamentales toujours incluses ; total par stagiaire affiché).
- **Passation multi-postes** : même onglet, carte *Passation multi-postes*. Ces deux cartes sont les seuls ajouts à l'interface PRE d'origine (et la mention « séance multi-postes en cours » dans le tableau des stagiaires) ; la seconde n'apparaît que dans l'application en ligne. Sécurité : les postes des stagiaires n'ont pas de compte ; ils reçoivent leurs questions et leurs choix, **jamais le corrigé** (la correction se fait dans PRE) ; le code (6 caractères) ne sert qu'avec le nom et la date de naissance du stagiaire, 60 essais manqués au plus par réseau et par 10 minutes ; après la clôture, les sujets sont effacés en ligne. Une date de naissance manquante dans la fiche empêche le stagiaire d'entrer.
- **Source de l'interface PRE en ligne** : `outils/sources/PRE-VE_Gestion_Formation_Formateur Niv2.html` (copie avec ces ajouts, jamais publiée). Partir de ce fichier pour toute nouvelle version.
- **Nouvelle version de l'interface PRE** : `node outils/construire-pre.mjs "chemin/du/fichier.html"` chiffre la nouvelle version avec une nouvelle clé (écrite dans `outils/cles.local.json`, jamais publié). Ajouter cette clé à la table `app_keys` **avant** de publier `assets/pre-ve.bin`. Les données ne changent pas.
- **Projet gratuit** : Supabase met en pause un projet gratuit inactif 7 jours ; l'action GitHub `keepalive.yml` l'appelle deux fois par semaine pour l'éviter. Si le projet est en pause malgré tout : tableau de bord → *Restore project*.

## Point d'attention RGPD

L'application traite des données personnelles d'étudiants (noms, positionnements, commentaires). Hébergement en France, accès restreint et chiffré, mais il est recommandé d'en informer le délégué à la protection des données (DPO) de l'académie et de ne conserver que les données utiles (supprimer les classes des années passées après archivage).

## Organisation du code

```
index.html               connexion, double authentification, accueil, compte
ismi.html  bts.html      évaluations (même moteur, référentiels différents)
pre.html                 ouverture de l'interface PRE et enregistrement en ligne
passation.html           test théorique PRE sur le poste du stagiaire (code de séance, sans compte)
PRE-VE_Gestion_Formation.html   cadre vide où l'interface PRE d'origine est déposée
assets/config.js         adresse et clé publique de la base
assets/auth.js           session, déconnexion automatique, barre du haut
assets/store.js          lecture/écriture des évaluations dans la base, direct entre appareils
assets/eval-app.js       moteur des évaluations (issu de la première mouture ISMI)
assets/ref-ismi.js       référentiel ISMI      assets/ref-bts.js  référentiel BTS MV 2027
assets/pre-loader.js     interface PRE : déchiffrement, données, synchronisation, séances multi-postes
assets/passation.js      poste du stagiaire : sujet, réponses enregistrées à chaque clic, remise
assets/pre-ve.bin        interface PRE d'origine, chiffrée
outils/construire-pre.mjs  chiffre une nouvelle version de l'interface PRE
outils/construire-progression.mjs  chiffre l'artefact de progression du BTS (assets/progression-atelier.bin)
progression-atelier.html  cadre vide où l'artefact de progression d'origine est déposé
outils/version.mjs       à lancer avant chaque publication : numéro de version des fichiers (évite les mélanges dus au cache)
supabase/migrations/     tables, règles de sécurité, historique
.github/workflows/keepalive.yml  maintien en activité du projet gratuit
```

Hébergement : GitHub Pages (fichiers statiques). Données : Supabase (PostgreSQL, authentification, stockage privé).
