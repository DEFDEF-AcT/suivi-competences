/* Référentiel BTS Maintenance des véhicules 2027 — arrêté du 10 décembre 2025 (J.O. du 31/12/2025),
   première session d'examen 2028.
   Lignes évaluées = rubriques de critères du J.O. ; indicateurs recopiés mot pour mot.
   Choix de l'équipe (proposition de travail, non officiel) : les rubriques « hygiène et sécurité » et
   « intégrité du véhicule », communes à plusieurs compétences d'un même pôle, sont réunies dans un bloc
   transversal observé et compté une fois ; la rubrique unique de C1.3 est découpée en trois lignes,
   comme dans la grille E5 de l'équipe. Le fonctionnement est commun avec l'ISMI (assets/eval-app.js). */
(() => {
'use strict';

const HSE = "l'organisation du poste de travail, les moyens de prévention et le choix des équipements de protection collective et individuelle sont définis et adaptés à l'intervention ; les risques liés à l'intervention sont qualifiés et traités ; les consignes d'hygiène et de sécurité sont appliquées.";

/* ---------- Pôle 1 — Diagnostic des systèmes des véhicules (U5) ---------- */
const ACTS1 = [
  {code:'T1', band:'Transversal', name:"Hygiène, sécurité et intégrité du véhicule : rubriques communes à C1.1, C1.2 et C1.3, observées et comptées une fois"},
  {code:'C1.1', band:'Constater', name:"Constater le dysfonctionnement"},
  {code:'C1.2', band:'Hiérarchiser', name:"Hiérarchiser les hypothèses"},
  {code:'C1.3', band:'Protocole', name:"Appliquer un protocole d'essais et mesures"},
  {code:'C1.4', band:'Solutions', name:"Proposer des solutions correctives adaptées aux contraintes économiques, environnementales et réglementaires"}
];
const COMPS1 = [
  {code:'T1.1', act:'T1', short:'Hygiène et sécurité', full:"Les règles d'hygiène et de sécurité sont respectées (C1.1, C1.2, C1.3).", crit:HSE},
  {code:'T1.2', act:'T1', short:'Intégrité du véhicule', full:"L'intégrité du véhicule est garantie (C1.1, C1.3).", crit:"les éléments de protection du véhicule sont adaptés et correctement utilisés ; aucune détérioration n'est constatée ; la propreté du véhicule est préservée."},
  {code:'C1.1.1', act:'C1.1', short:'Informations du pré-diagnostic', full:"Les informations nécessaires au pré-diagnostic sont analysées.", crit:"l'ordre de réparation est complété sur la base de l'intervention ; le véhicule est identifié (VIN, plaque d'immatriculation) ; les informations collectées (historique, documentation, plan de maintenance, recueil des symptômes auprès du client, codes défauts, etc.) sont cohérentes avec le dysfonctionnement."},
  {code:'C1.1.2', act:'C1.1', short:'Panne constatée', full:"La panne ou les dysfonctionnements sont constatés.", crit:"l'outillage est conforme et adapté à l'intervention ; les tests préliminaires réalisés, dont ceux préconisés, recréent le contexte d'apparition de la panne ; les différentes conditions et les paramètres qui peuvent influencer l'apparition des symptômes sont identifiés ; le dysfonctionnement et/ou l'anomalie sont confirmés ; le dysfonctionnement est explicité en utilisant un langage professionnel adapté ; l'anomalie détectée est retranscrite."},
  {code:'C1.2.1', act:'C1.2', short:'Informations du diagnostic', full:"Les informations nécessaires au diagnostic sont analysées.", crit:"les informations collectées (historique, documentation, plan de maintenance, recueil des symptômes auprès du client, système embarqué de diagnostic prédictif, etc.) sont cohérentes avec le dysfonctionnement."},
  {code:'C1.2.2', act:'C1.2', short:'Hypothèses émises et hiérarchisées', full:"Les hypothèses sont émises selon le dysfonctionnement constaté.", crit:"les propositions sont pertinentes ; les hypothèses sont hiérarchisées selon une logique liée à la probabilité, l'accessibilité, la disponibilité et la rentabilité."},
  {code:'C1.3.1', act:'C1.3', short:'Protocole : pertinence et mise en œuvre', full:"Le protocole d'essais et mesures est appliqué : pertinence et mise en œuvre.", crit:"la liste des contrôles et des mesures est pertinente compte tenu des hypothèses ; l'utilisation des outils de mesure et de contrôle permet d'obtenir des valeurs exploitables."},
  {code:'C1.3.2', act:'C1.3', short:'Protocole : analyse et interprétation', full:"Le protocole d'essais et mesures est appliqué : analyse et interprétation.", crit:"les résultats, les relevés obtenus ou les observations sont analysés et interprétés selon les valeurs de référence constructeur ; en cas d'absence de valeurs constructeur, l'analyse et l'interprétation se font à partir de valeurs définies par le technicien supérieur ; l'interprétation des données recueillies permet d'identifier l'origine de la défaillance."},
  {code:'C1.3.3', act:'C1.3', short:'Protocole : confirmation et traçabilité', full:"Le protocole d'essais et mesures est appliqué : confirmation et traçabilité.", crit:"un test alternatif permet de confirmer la panne ; les éléments défaillants, la cause de la panne sont identifiés et retranscrits suivant la procédure prescrite ; l'ordre de réparation est complété."},
  {code:'C1.4.1', act:'C1.4', short:'Pertinence technique', full:"La proposition est pertinente techniquement.", crit:"les opérations de remise en conformité sont identifiées et cohérentes avec l'origine de la panne ; les conséquences sur les autres éléments sont prises en compte ; les alternatives sont hiérarchisées selon leur pertinence."},
  {code:'C1.4.2', act:'C1.4', short:'Maîtrise économique', full:"La maîtrise économique est assurée.", crit:"le chiffrage est précis et détaillé ; les coûts sont optimisés ; les délais sont réalistes."},
  {code:'C1.4.3', act:'C1.4', short:'Exigence environnementale', full:"L'exigence environnementale est intégrée.", crit:"la gestion des déchets est anticipée ; les normes environnementales sont respectées."},
  {code:'C1.4.4', act:'C1.4', short:'Conformité', full:"La conformité est assurée.", crit:"les solutions respectent la réglementation ; la sécurité est garantie ; la traçabilité est assurée ; les garanties de la solution proposée sont identifiées."},
  {code:'C1.4.5', act:'C1.4', short:'Devoir de conseil', full:"Le devoir de conseil est assuré.", crit:"les solutions, y compris celles de réemploi, sont clairement expliquées au client ; les choix sont justifiés techniquement et économiquement."}
];

/* ---------- Pôle 2 — Relation clientèle et commercialisation (U6) ---------- */
const ACTS2 = [
  {code:'C2.1', band:'Relation client', name:"Appliquer les principes de la relation client en après-vente"},
  {code:'C2.2', band:'Commercialisation', name:"Commercialiser des produits et des services de l'après-vente"}
];
const COMPS2 = [
  {code:'C2.1.1', act:'C2.1', short:'Parcours client', full:"Le parcours client respecte la politique qualité-satisfaction de l'entreprise.", crit:"Le parcours client respecte la politique qualité-satisfaction de l'entreprise."},
  {code:'C2.1.2', act:'C2.1', short:'Accueil du client', full:"L'accueil du client est réalisé de manière adaptée et professionnelle, en particulier lorsque le client se trouve en situation de handicap.", crit:"L'accueil du client est réalisé de manière adaptée et professionnelle, en particulier lorsque le client se trouve en situation de handicap."},
  {code:'C2.1.3', act:'C2.1', short:'Réception du véhicule', full:"La réception du véhicule est réalisée.", crit:"l'énoncé client est retranscrit ; le tour du véhicule est réalisé ; un essai du véhicule est éventuellement réalisé ; l'ordre de réparation est conforme à l'énoncé client ; l'accord client est contractualisé."},
  {code:'C2.1.4', act:'C2.1', short:'Restitution du véhicule', full:"La restitution du véhicule est assurée.", crit:"les interventions réalisées sur le véhicule sont expliquées au client ; la facturation est assurée ; les conseils sur l'entretien et l'utilisation du véhicule sont donnés au client ; la satisfaction du client est recueillie."},
  {code:'C2.2.1', act:'C2.2', short:"Commercialisation de l'intervention", full:"L'intervention en atelier est commercialisée.", crit:"la politique qualité – satisfaction client de l'entreprise est respectée ; les besoins du client sont identifiés et analysés ; l'argumentaire commercial est adapté aux besoins du client ; des produits et services additionnels sont proposés ; la proposition commerciale est explicitée ; l'accord du client est contractualisé."}
];

/* ---------- Pôle 3 — Organisation des activités de maintenance (U7) ---------- */
const ACTS3 = [
  {code:'T3', band:'Transversal', name:"Hygiène et sécurité : rubrique commune à C3.1 et C3.3, observée et comptée une fois"},
  {code:'C3.1', band:'Planification', name:"Assurer la planification et le suivi de l'intervention"},
  {code:'C3.2', band:'Indicateurs', name:"Suivre les indicateurs de performance de l'après-vente"},
  {code:'C3.3', band:'Équipe', name:"Contribuer au développement professionnel de l'équipe"}
];
const COMPS3 = [
  {code:'T3.1', act:'T3', short:'Hygiène et sécurité', full:"Les règles d'hygiène et de sécurité sont respectées (C3.1, C3.3).", crit:HSE},
  {code:'C3.1.1', act:'C3.1', short:'Planification opérationnelle', full:"La planification des interventions est opérationnelle.", crit:"la planification prend en compte toutes les contraintes (temps, plateau technique, équipements, entrées imprévues, aléas techniques, approvisionnement pièces, disponibilité et compétences des collaborateurs, rentabilité…) ; l'organisation proposée (réception, intervention, restitution) est compatible avec les délais fixés ; le suivi de l'intervention est anticipé."},
  {code:'C3.1.2', act:'C3.1', short:"Suivi de l'intervention", full:"Le suivi de l'intervention est opéré.", crit:"les travaux effectués sont conformes à l'ordre de réparation ; l'ordre de réparation est éventuellement modifié et l'accord du client est retranscrit."},
  {code:'C3.2.1', act:'C3.2', short:'Suivi de la performance', full:"Le suivi de la performance est assuré.", crit:"les indicateurs de l'après-vente sont analysés, les écarts sont identifiés ; les résultats sont transmis et argumentés ; des axes d'améliorations sont formulés, proposés à la hiérarchie."},
  {code:'C3.3.1', act:'C3.3', short:"Accompagnement technique de l'équipe", full:"L'accompagnement technique de l'équipe est opérationnel.", crit:"le contenu de la formation est adapté et répond aux besoins des collaborateurs ; les moyens choisis pour identifier les difficultés des collaborateurs sont pertinents ; les propositions de remédiation sont adaptées aux besoins des collaborateurs ; les consignes, les recommandations techniques et de sécurité sont formulées, assimilables et applicables par les collaborateurs ; les techniques d'animations proposées favorisent la cohésion du groupe ; une évaluation des acquis est réalisée ; des formations complémentaires sont proposées."}
];

/* ---------- Pôle 4 — Maintenance corrective des véhicules (U8) ---------- */
const ACTS4 = [
  {code:'T4', band:'Transversal', name:"Hygiène, sécurité, intégrité et mise en sécurité du véhicule : rubriques communes à C4.1 et C4.2, observées et comptées une fois"},
  {code:'C4.1', band:'Préparer', name:"Préparer une intervention corrective"},
  {code:'C4.2', band:'Remettre en conformité', name:"Remettre en conformité les systèmes"}
];
const COMPS4 = [
  {code:'T4.1', act:'T4', short:'Hygiène et sécurité', full:"Les règles d'hygiène et de sécurité sont respectées (C4.1, C4.2).", crit:"l'organisation du poste de travail, les moyens de prévention et le choix des équipements de protection collective et individuelle sont adaptés à l'intervention ; les risques liés à l'intervention sont identifiés et signalés (C4.1), qualifiés et traités (C4.2) ; les consignes d'hygiène et de sécurité sont respectées."},
  {code:'T4.2', act:'T4', short:'Intégrité et mise en sécurité', full:"L'intégrité du véhicule est garantie (C4.1, C4.2).", crit:"les éléments de protection du véhicule sont adaptés et correctement utilisés ; la propreté du véhicule est préservée ; la mise en sécurité du véhicule est conforme à l'intervention."},
  {code:'C4.1.1', act:'C4.1', short:'Environnement : tri préparé', full:"L'environnement est préservé.", crit:"le tri des déchets est préparé."},
  {code:'C4.1.2', act:'C4.1', short:'Préparation selon les procédures', full:"La préparation de l'intervention respecte les procédures du constructeur et de l'entreprise.", crit:"le véhicule est identifié (VIN, plaque d'immatriculation, spécificité technique, etc.) ; l'ordre de réparation est complété ; l'outillage est conforme et adapté à l'intervention ; les informations collectées sont adaptées à l'intervention à réaliser ; les étapes de l'intervention sont identifiées ; le temps imparti de l'intervention est identifié ; la disponibilité et la conformité des pièces sont vérifiées."},
  {code:'C4.2.1', act:'C4.2', short:'Environnement : tri et réglementation', full:"L'environnement est préservé.", crit:"le tri des déchets est réalisé ; la réglementation environnementale est respectée."},
  {code:'C4.2.2', act:'C4.2', short:'Intervention selon les procédures', full:"L'intervention respecte les procédures du constructeur et de l'entreprise.", crit:"le temps imparti de l'intervention est respecté ; le remplacement des pièces respecte les procédures du constructeur et de l'entreprise ; les informations collectées (documentation, procédure du constructeur, etc.) sont adaptées à l'intervention ; les réglages sont conformes aux procédures du constructeur et à la réglementation en vigueur ; les paramétrages respectent les caractéristiques et la configuration du véhicule ; les procédures qualité de l'entreprise sont respectées ; les dossiers relatifs aux interventions sont complétés."}
];

const REF = {
  1:{short:'Diagnostic', label:'Pôle 1 · Diagnostic des systèmes des véhicules', title:'Réaliser le diagnostic des systèmes des véhicules (bloc 1, unité U5)', modal:"E5, épreuve ponctuelle orale pour les scolaires : 20 min d'exposé et 30 min d'entretien, sur un projet de 60 h · coefficient 8.", comps:COMPS1, acts:ACTS1},
  2:{short:'Relation client', label:'Pôle 2 · Relation clientèle et commercialisation', title:"Assurer la relation clientèle et la commercialisation des produits et services de l'après-vente des véhicules (bloc 2, unité U6)", modal:"E6, épreuve ponctuelle orale pour les scolaires : 10 min de présentation et 20 min d'entretien, sur un dossier de deux situations professionnelles issues des stages · coefficient 4.", comps:COMPS2, acts:ACTS2},
  3:{short:'Organisation', label:'Pôle 3 · Organisation des activités de maintenance', title:'Organiser les activités de maintenance des véhicules (bloc 3, unité U7)', modal:'E7, contrôle en cours de formation · coefficient 4.', comps:COMPS3, acts:ACTS3},
  4:{short:'Maintenance corrective', label:'Pôle 4 · Maintenance corrective des véhicules', title:'Réaliser la maintenance corrective des véhicules (bloc 4, unité U8)', modal:'E8, contrôle en cours de formation · coefficient 4.', comps:COMPS4, acts:ACTS4}
};

window.EVAL_CONFIG = {
  app:'bts', name:'Évaluations BTS MV', unitLabel:'Pôle', unitMark:'P', unitFile:'pole', defaultUnit:1,
  // Pôles non dissociés : toutes les évaluations ensemble, pôle dominant choisi à la création.
  progression:true,   // onglet Progression : l'artefact « Atelier BTS MV » tel quel, raccordé aux évaluations
  progressionBundle:'assets/progression-atelier.bin',
  formation:'BTS Maintenance des véhicules',
  bilanEpreuves:['E5', 'E7', 'E8'],   // bilan « épreuves » : pôles 1, 3 et 4 (E6 : pôle 2, relation clientèle)
  unified:true, scopeLabel:'4 pôles', unifiedMark:'MV', unifiedSub:'Pôles 1 à 4 · référentiel 2027',
  ref:REF,
  refSource:"référentiel BTS Maintenance des véhicules 2027, arrêté du 10 décembre 2025 ; une ligne = une rubrique de critères du J.O., indicateurs recopiés mot pour mot. Le bloc transversal et le découpage de C1.3 en trois lignes sont des choix de l'équipe",
  words:{acts:'compétences', comp:'critère', comps:'critères', crit:'Indicateurs',
    none:'aucun critère positionné', acquired:'Critères acquis',
    acqTitle:'Critères au niveau {seuil} ou plus, parmi ceux déjà positionnés',
    notYet:'critère pas encore évalué dans la classe'},
  importHint:'',
  types:['TP / poste TPM','TD','Activité de module','Revue de projet E5','Oral','Situation de CCF','PFMP','Autre'],
  statuses:['Fortement mobilisée','Mobilisée','Abordée',''], defaultStatus:'Fortement mobilisée', ungraded:['Abordée'], fmMax:3,
  defaultPoints:{MI:0, MF:6.67, MS:13.33, TBM:20}, pointsStep:0.01,
  pointsHint:"Réglage par défaut : MI 0 · MF 1 · MS 2 · TBM 3 points par unité de coefficient, ramenés sur 20 (calcul de la grille E5 de l'équipe). Une ligne non positionnée (NE) ne compte ni au numérateur ni au dénominateur.",
  defaultClassName:'BTS MV 1 — 2026-2027', classExamples:'BTS MV 1, BTS MV 2…', classPlaceholder:'BTS MV 2 — 2026-2027',
  evalTitlePlaceholder:'TP — Diagnostic du circuit de charge', codePlaceholder:u => 'M2_P' + u + '_TP1',
  trPlaceholder:'Posture : justifier chaque relevé par la valeur constructeur',
  compHint:"Les critères du pôle dominant sont positionnés ; ceux des autres pôles peuvent être mobilisés. Au plus 3 compétences fortement mobilisées par activité (règle de l'équipe). Une ligne « Abordée » est positionnée mais ne compte pas dans la note : c'est une évaluation diagnostic.",
  levelDesc:{
    MI:"L'étudiant ne prend pas part à l'activité avec sérieux. Il ne prend pas en compte les conseils qui lui sont portés, ne veut pas reproduire les gestes et postures de l'enseignant. La connaissance du système n'est absolument pas évoquée.",
    MF:"Avec de l'aide, l'étudiant commet des erreurs importantes. Prend difficilement part à l'activité. Ne se saisit pas complètement des aides qui lui sont données. Ne respecte pas les procédures correctement. Vague connaissance du fonctionnement du système.",
    MS:"Avec de l'aide, l'étudiant gagne en autonomie dans la réalisation de la tâche abordée. Quelques erreurs acceptables. Respecte globalement les procédures. Maîtrise satisfaisante du fonctionnement du système.",
    TBM:"Sans aide ou très peu, l'étudiant a su mener l'activité à son terme avec succès. Sans erreur majeure. Très bonne maîtrise des gestes professionnels et des notions du système abordé."
  }
};
})();
