/* Référentiel ISMI (GIP-FCIP de Toulouse) — Blocs 1 et 3, repris de la première mouture.
   Ce fichier ne contient que le référentiel et les réglages propres aux ISMI ;
   le fonctionnement est commun avec le BTS (assets/eval-app.js). */
(() => {
'use strict';

/* ---------- Référentiel ISMI — Bloc 3 (GIP-FCIP Toulouse) ---------- */
const COMPS3 = [
  {code:'3-A1C1', short:'Tests et mesures', full:"Réaliser des tests et des mesures, en suivant les protocoles constructeurs, afin d'évaluer l'écart de performance du système électronique par rapport aux exigences techniques.", crit:"Utilisation adaptée des procédures constructeurs ; utilisation pertinente et correcte des outils, testeurs et appareils de mesure ; évaluation précise de la performance du système."},
  {code:'3-A1C2', short:'Analyse et cause racine', full:"Analyser le bilan des tests et des mesures afin d'identifier les éléments systèmes défaillants et les causes racine du dysfonctionnement.", crit:"Les éléments systèmes défaillants sont localisés ; les causes racine du dysfonctionnement sont identifiées."},
  {code:'3-A2C1', short:'Méthodologie de réparation', full:"Proposer une méthodologie de réparation et/ou de restauration afin de remettre en état de fonctionnement le système en respectant les contraintes économiques, normatives et environnementales.", crit:"Méthodologie adaptée au système ; instruments et protocoles appropriés ; performances initiales à atteindre rappelées."},
  {code:'3-A2C2', short:'Animer une équipe, communiquer', full:"Encadrer et animer une équipe en utilisant une communication inclusive et accessible à tous, afin de faciliter l'exécution des travaux.", crit:"Comprend les principes de management ; connaît les styles de communication ; objectifs et instructions communiqués clairement ; supports adaptés aux différents handicaps."},
  {code:'3-A2C3', short:'Piloter les travaux', full:"Piloter l'exécution des travaux de réparation et/ou restauration afin d'atteindre les objectifs de réparation.", crit:"Plan clair et bien structuré ; répartition des tâches équilibrée ; ressources bien réparties."},
  {code:'3-A3C1', short:'Procédure de test qualité', full:"Élaborer des procédures de test qualité afin d'assurer la fiabilité des systèmes électroniques.", crit:"Principes de la restauration correctement appliqués ; la procédure établie permet de valider la remise en conformité des systèmes."},
  {code:'3-A4C1', short:"Fiche d'intervention", full:"Produire la fiche d'intervention pour garantir la traçabilité et la conformité du système.", crit:"La fiche d'intervention est rédigée."},
  {code:'3-A4C2', short:'Plan de maintenance', full:"Améliorer le plan de maintenance préventive et corrective, en intégrant les recommandations du fabricant, pour assurer la disponibilité et la durabilité des équipements dans des conditions opérationnelles.", crit:"Des actions préventives et correctives sont proposées en fonction des évolutions des recommandations du fabricant."}
];
const ACTS3 = [
  {code:'3-A1', band:'Diagnostic', name:"Utilisation d'outils de diagnostic pour identifier les dysfonctionnements"},
  {code:'3-A2', band:'Réparation', name:"Réparation et restauration des systèmes électroniques par ajustement ou remplacement des composants critiques"},
  {code:'3-A3', band:'Test et validation', name:"Mise en place de procédures de test et de validation pour assurer la fiabilité des systèmes"},
  {code:'3-A4', band:'Documentation', name:"Création d'une documentation de synthèse à destination du bureau d'études"}
];
/* ---------- Référentiel ISMI — Bloc 1 (GIP-FCIP Toulouse) ---------- */
const COMPS1 = [
  {code:'1-A1C1', short:'Attentes des parties prenantes', full:"Identifier les attentes et les exigences des parties prenantes du projet en menant des entretiens, en collectant les informations provenant des parties prenantes et en s'assurant de la prise en compte de la situation des personnes handicapées et des enjeux écologiques, afin de définir les objectifs et les spécifications du système à concevoir.", crit:"Les questions aux parties prenantes sont claires ; les techniques d'entretien sont pertinentes ; les attentes et exigences des parties prenantes sont bien identifiées."},
  {code:'1-A2C1', short:'Analyse des spécifications', full:"Analyser les spécifications techniques en examinant les documents à disposition afin d'identifier les exigences fonctionnelles et non fonctionnelles (performance, contraintes).", crit:"Les critères de performance sont bien identifiés ; les contraintes imposées au système sont bien identifiées."},
  {code:'1-A2C2', short:'Modélisation du système', full:"Modéliser un système produit/procédé en vue de son amélioration en tenant en compte du cycle de vie.", crit:"Le système produit / procédé est modélisé ; la modélisation des solutions techniques prend en compte le cycle de vie."},
  {code:'1-A2C3', short:'Schémas blocs', full:"Élaborer des schémas blocs représentant les fonctions, la structure, le comportement préliminaire des solutions envisagées pour visualiser les solutions techniques.", crit:"Le schéma bloc est réalisé."},
  {code:'1-A3C1', short:'Évaluer et hiérarchiser les solutions', full:"Évaluer et hiérarchiser les solutions techniques en fonction de leur pertinence, de leur faisabilité et de leur adéquation avec les besoins spécifiques du projet, en utilisant des critères préalablement définis, afin de sélectionner la meilleure option.", crit:"Les solutions techniques sont évaluées au regard des critères prédéfinis ; elles sont hiérarchisées selon ces critères."},
  {code:'1-A3C2', short:'Dimensionnement', full:"Dimensionner les solutions techniques en fonction d'une architecture donnée en évaluant les spécifications techniques afin d'assurer une conception optimale du système.", crit:"Les dimensionnements sont corrects."},
  {code:'1-A3C3', short:'Choix par simulation', full:"Choisir par simulation numérique les solutions techniques en fonction d'une architecture donnée en comparant les performances des composants pour garantir une solution répondant aux besoins du projet.", crit:"Les solutions sont choisies de manière cohérente avec l'architecture ; le modèle de simulation est valide ; les résultats de simulation de chaque solution sont comparés."},
  {code:'1-A3C4', short:'Optimisation écologique', full:"Optimiser les solutions les plus pertinentes, en intégrant des matériaux et des technologies écologiques afin d'assurer la durabilité des produits.", crit:"Sélection pertinente des solutions ; les critères de développement durable sont pris en compte."},
  {code:'1-A4C1', short:'Schémas électroniques (CAO)', full:"Concevoir des schémas électroniques à l'aide de logiciels de CAO, en intégrant les spécifications techniques et fonctionnelles, pour définir avec précision l'architecture des circuits électroniques.", crit:"Les schémas électroniques sont réalisés par CAO ; les spécifications techniques et fonctionnelles sont intégrées."},
  {code:'1-A4C2', short:'Placement et routage', full:"Réaliser le placement et le routage des cartes électroniques en fonction des contraintes matérielles (CEM, thermique…) et des exigences du cahier des charges, afin de garantir la fiabilité du produit électronique final.", crit:"Le placement et le routage sont réalisés ; les contraintes matérielles et exigences du cahier des charges sont prises en compte."},
  {code:'1-A4C3', short:'Documentation des schémas', full:"Rédiger une documentation technique, accessible aux personnes en situation de handicap, décrivant de manière exhaustive les schémas électroniques réalisés, afin de faciliter la compréhension et la reproduction des circuits électroniques.", crit:"La documentation technique décrit de manière exhaustive la conception des schémas ; elle prend en compte le handicap (déficience visuelle)."},
  {code:'1-A5C1', short:'Besoins du système embarqué', full:"Analyser les spécifications fonctionnelles pour identifier les besoins du système embarqué et définir les fonctionnalités requises.", crit:"Le langage de modélisation (UML, SysML…) est utilisé ; les diagrammes nécessaires sont réalisés."},
  {code:'1-A5C2', short:'Architecture logicielle', full:"Appliquer les bonnes pratiques et les méthodologies de conception pour élaborer de façon structurée l'architecture logicielle et le comportement des systèmes informatiques embarqués en prenant en compte l'architecture matérielle et en optimisant l'utilisation des ressources disponibles permettant ainsi un fonctionnement optimal.", crit:"Les contraintes techniques et fonctionnelles sont identifiées ; l'architecture logicielle et le comportement des systèmes sont décrits."},
  {code:'1-A5C3', short:'Collaboration et contraintes', full:"Collaborer avec les équipes pour évaluer les contraintes techniques et fonctionnelles, afin de concevoir une architecture adaptée aux besoins et contraintes du système informatique embarqué.", crit:"Le compte rendu de réunion est établi."},
  {code:'1-A6C1', short:'Implantation et assemblage', full:"Implanter et assembler les composants électroniques sur une carte de test, en suivant les bonnes pratiques de montage et de brasage afin de valider les solutions techniques retenues lors de la conception.", crit:"La maquette est réalisée ; chaque bloc fonctionnel est testé et validé (tests unitaires) ; la maquette de la carte électronique est fonctionnelle et assure les fonctionnalités attendues."},
  {code:'1-A6C2', short:'Programme de test C/C++', full:"Développer, intégrer et exécuter un programme de test en C/C++ afin de valider le bon fonctionnement des interactions matérielles et logicielles des solutions techniques retenues.", crit:"Les fonctions sont programmées de manière structurée."}
];
const ACTS1 = [
  {code:'1-A1', band:'Besoins', name:"Analyse des besoins des parties prenantes"},
  {code:'1-A2', band:'Conception préliminaire', name:"Conception préliminaire de systèmes : schémas blocs décrivant les fonctions, la structure matérielle et le comportement des solutions"},
  {code:'1-A3', band:'Solutions techniques', name:"Développement de solutions techniques : éléments de définition d'une carte électronique, d'un programme informatique et d'un produit mécatronique"},
  {code:'1-A4', band:'Schémas électroniques', name:"Conception de schémas électroniques"},
  {code:'1-A5', band:'Architecture logicielle', name:"Conception de l'architecture logicielle"},
  {code:'1-A6', band:'Maquette', name:"Réalisation d'une maquette fonctionnelle de la carte électronique"}
];
const REF = {
  1:{label:'Bloc 1 · Concevoir des systèmes électroniques', title:'Concevoir des systèmes électroniques', modal:"Mise en situation professionnelle reconstituée (projet tutoré) : réalisation d'une maquette, dossier écrit décrivant la démarche, puis soutenance orale.", comps:COMPS1, acts:ACTS1},
  3:{label:'Bloc 3 · Diagnostiquer et traiter les dysfonctionnements', title:'Diagnostiquer et traiter les dysfonctionnements des systèmes électroniques après leur mise en service', modal:"Cas pratique en atelier avec rapport écrit, puis oral sur la gestion des opérations, la planification et l'animation d'équipe.", comps:COMPS3, acts:ACTS3}
};
[...COMPS1, ...COMPS3].forEach(c => { c.act = c.code.slice(0, 4); });

window.EVAL_CONFIG = {
  app:'ismi', name:'Évaluations ISMI', unitLabel:'Bloc', unitMark:'B', unitFile:'bloc', defaultUnit:3,
  ref:REF,
  refSource:'référentiel ISMI, GIP-FCIP de Toulouse',
  words:{acts:'compétences', comp:'sous-compétence', comps:'sous-compétences', crit:'Critères',
    none:'aucune sous-compétence positionnée', acquired:'Sous-compétences acquises',
    acqTitle:'Sous-compétences au niveau {seuil} ou plus, parmi celles déjà positionnées',
    notYet:'sous-compétence pas encore évaluée dans la classe'},
  importHint:"« Restaurer » accepte aussi les fichiers .json enregistrés avec la première version (fichier Evaluations_ISMI.html) : vos saisies faites hors ligne peuvent ainsi être reprises.",
  types:['TP','TD','Oral','Cas pratique','Projet','Partiel','Autre'],
  statuses:['Fortement mobilisée','Mobilisée',''], defaultStatus:'Fortement mobilisée', ungraded:[], fmMax:0,
  defaultPoints:{MI:5, MF:10, MS:15, TBM:18}, pointsStep:0.5, pointsHint:'',
  defaultClassName:'ISMI 3 — 2026-2027', classExamples:'ISMI 1, ISMI 2…', classPlaceholder:'ISMI 2 — 2026-2027',
  evalTitlePlaceholder:'TP1 DIAG — Méthode de diagnostic', codePlaceholder:u => 'Bloc' + u + '_P5_TP1',
  trPlaceholder:'Posture : confronter documentation, datasheet et mesure',
  compHint:"2 à 4 compétences suffisent : une grille qui coche tout n'évalue rien.",
  levelDesc:null
};
})();
