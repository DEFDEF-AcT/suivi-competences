/* Dépose l'artefact « Atelier BTS MV » d'origine dans ce cadre, tel quel. */
(() => {
  'use strict';
  let parent = null;
  try { parent = window.parent !== window ? window.parent : null; } catch (e) { parent = null; }
  const html = parent && parent.__ATELIER_HTML;
  if (!html) { (parent || window).location.replace('bts.html#progression'); return; }
  window.addEventListener('load', () => setTimeout(() => {
    document.open();
    document.write(html);
    document.close();
    try { parent.__ATELIER_READY(window); } catch (e) { /* page parente fermée */ }
  }, 0));
})();
