/* Dépose l'interface PRE-VE d'origine dans ce cadre, telle quelle.
   L'adresse du cadre reste « PRE-VE_Gestion_Formation.html » : le bouton « Enregistrer le fichier »
   de l'interface propose donc un nom de fichier correct. */
(() => {
  'use strict';
  let parent = null;
  try { parent = window.parent !== window ? window.parent : null; } catch (e) { parent = null; }
  const html = parent && parent.__PRE_HTML;
  if (!html) { (parent || window).location.replace('pre.html'); return; }
  window.addEventListener('load', () => setTimeout(() => {
    document.open();
    document.write(html);
    document.close();
    try { parent.__PRE_READY(window); } catch (e) { /* page parente fermée */ }
  }, 0));
})();
