/* Test théorique PRE — poste du stagiaire (ordinateur, tablette ou téléphone).
   - Entrée : code de séance + nom + date de naissance (aucun compte, aucun mot de passe formateur).
   - Le poste reçoit son sujet (questions et choix) sans le corrigé : la correction se fait dans PRE.
   - Chaque réponse est enregistrée en ligne aussitôt, dans la copie du stagiaire ; une copie de
     travail reste dans l'onglet (sessionStorage) en cas de coupure ou de rechargement.
   - Si le poste s'arrête, le stagiaire reprend sur un autre appareil avec les mêmes informations. */
(() => {
'use strict';
if (window.top !== window.self) {
  try { window.top.location = window.location.href; } catch (e) { document.documentElement.innerHTML = ''; }
  return;
}
const C = window.APP_CONFIG;
const LET = 'ABCDEFGH', MEMO = 'pre.passation';
const $ = s => document.querySelector(s);
const main = $('#main');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmtCode = c => { c = String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); return c.length > 3 ? c.slice(0, 3) + '-' + c.slice(3) : c; };
const hm = t => { const d = new Date(t); return d.getHours() + ' h ' + String(d.getMinutes()).padStart(2, '0'); };

const MSG = {
  code: 'Code de séance inconnu. Vérifiez le code affiché par le formateur.',
  ferme: 'Cette séance est clôturée, ou son délai est écoulé. Appelez le formateur.',
  identite: "Nom ou date de naissance introuvable dans cette séance. Écrivez votre nom de famille comme sur votre fiche d'inscription, et vérifiez votre date de naissance.",
  homonyme: 'Plusieurs stagiaires correspondent : écrivez votre nom suivi de votre prénom (par exemple DUPONT Marie).',
  remise: 'Votre copie a déjà été remise : elle ne peut plus être modifiée.',
  essais: "Trop d'essais depuis ce réseau. Patientez 10 minutes, ou appelez le formateur.",
  jeton: 'Votre test a été rouvert sur un autre appareil. Continuez sur celui-ci, ou saisissez à nouveau vos informations ici pour reprendre sur ce poste.',
  format: 'Réponse refusée par le serveur. Rechargez la page.',
  reseau: 'Connexion impossible. Vérifiez le réseau (Wi-Fi), puis réessayez.'
};

let T = null;            // copie ouverte : { token, copie, nom, prenom, n, sujet, images, answers, current, sorties, fin, skew }
let vue = 'entree', dirty = false, sending = false, again = false, remise = false;
let posT = 0, retryT = 0, grilleOuverte = false;

/* ---------- Échanges avec la base ---------- */
async function rpc(fn, args) {
  const r = await fetch(C.supabaseUrl + '/rest/v1/rpc/' + fn, {
    method: 'POST', cache: 'no-store',
    headers: { apikey: C.supabaseKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  });
  if (!r.ok) { const e = new Error('HTTP ' + r.status); e.http = r.status; throw e; }
  return r.json();
}
const memo = {
  lire() { try { return JSON.parse(sessionStorage.getItem(MEMO)); } catch (e) { return null; } },
  ecrire() {
    if (!T) return;
    try { sessionStorage.setItem(MEMO, JSON.stringify({ token: T.token, copie: T.copie, answers: T.answers, current: T.current, sorties: T.sorties, dirty })); } catch (e) {}
  },
  effacer() { try { sessionStorage.removeItem(MEMO); } catch (e) {} }
};
function etat(cls, txt) { const e = $('#etat'); e.className = 'ph-etat' + (cls ? ' ' + cls : ''); e.textContent = txt || ''; }

/* ---------- Entrée ---------- */
function parseDdn(v) {
  v = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{1,2})[/.\- ](\d{1,2})[/.\- ](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}
function vueEntree(msg, cls) {
  vue = 'entree'; T = null; dirty = false; remise = false;
  $('#who').textContent = ''; $('#fin').hidden = true; etat('', '');
  const code = new URLSearchParams(location.search).get('c') || '';
  main.innerHTML = `<div class="carte"><h1>Test théorique PRE</h1>
    <p class="sub">Prévention du risque électrique (NF C 18-550). Saisissez le code de séance donné par le formateur, votre nom et votre date de naissance.</p>
    <div id="eMsg">${msg ? `<div class="msg ${cls || 'err'}">${esc(msg)}</div>` : ''}</div>
    <form id="fEntree" novalidate>
      <label class="f">Code de séance<input id="eCode" class="code" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="9" placeholder="K7P-4QM" value="${esc(fmtCode(code))}"></label>
      <label class="f">Nom de famille<input id="eNom" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>
      <label class="f">Date de naissance<input id="eDdn" type="date" min="1940-01-01" max="2020-12-31"></label>
      <button class="btn amb plein" type="submit" id="eGo">Commencer le test</button>
    </form>
    <p class="small muted">Chaque réponse est enregistrée en ligne aussitôt. Si le poste s'arrête, reprenez sur un autre appareil avec les mêmes informations : vous retrouverez vos réponses.</p>
    <p class="small muted">Restez sur la page du test jusqu'à la remise de votre copie : les sorties de la page sont signalées au formateur.</p></div>`;
  const c = $('#eCode');
  c.addEventListener('input', () => { const p = c.selectionStart === c.value.length; c.value = fmtCode(c.value); if (p) c.selectionStart = c.selectionEnd = c.value.length; });
  $('#fEntree').addEventListener('submit', entrer);
  (c.value ? $('#eNom') : c).focus();
}
function msgEntree(txt) { const m = $('#eMsg'); if (m) m.innerHTML = `<div class="msg err">${esc(txt)}</div>`; }
async function entrer(ev) {
  ev.preventDefault();
  const code = $('#eCode').value.toUpperCase().replace(/[^A-Z0-9]/g, ''), nom = $('#eNom').value.trim(), ddn = parseDdn($('#eDdn').value);
  if (code.length !== 6) { msgEntree('Le code de séance comporte 6 caractères (par exemple K7P-4QM).'); $('#eCode').focus(); return; }
  if (nom.replace(/[^A-Za-zÀ-ÿ]/g, '').length < 2) { msgEntree('Écrivez votre nom de famille.'); $('#eNom').focus(); return; }
  if (!ddn) { msgEntree('Indiquez votre date de naissance.'); $('#eDdn').focus(); return; }
  // Plein écran sur ordinateur (demandé pendant le clic, comme l'exige le navigateur).
  try { const d = document.documentElement; if (d.requestFullscreen && matchMedia('(pointer: fine)').matches && !document.fullscreenElement) d.requestFullscreen().catch(() => {}); } catch (e) {}
  const b = $('#eGo'); b.disabled = true; b.textContent = 'Ouverture…';
  let r = null;
  try { r = await rpc('passation_ouvrir', { p_code: code, p_nom: nom, p_ddn: ddn }); }
  catch (e) { b.disabled = false; b.textContent = 'Commencer le test'; msgEntree(MSG.reseau); return; }
  if (!r || !r.ok) { b.disabled = false; b.textContent = 'Commencer le test'; msgEntree(MSG[r && r.err] || MSG.reseau); return; }
  demarrer(r, memo.lire());
}

/* ---------- Test ---------- */
function demarrer(r, local) {
  T = {
    token: r.token, copie: r.copie, nom: r.nom, prenom: r.prenom, n: r.n, sujet: r.sujet || [], images: r.images || {},
    answers: r.answers || {}, current: Math.max(0, Math.min(r.current || 0, r.n)), sorties: r.sorties || 0,
    fin: Date.parse(r.fin), skew: Date.parse(r.now) - Date.now()
  };
  dirty = false; remise = false;
  // Réponses données sur ce poste mais pas encore arrivées en ligne (coupure, rechargement) : on les garde.
  if (local && local.dirty && local.copie && local.copie === T.copie) {
    T.answers = local.answers || T.answers; T.current = Math.max(0, Math.min(local.current ?? T.current, T.n));
    T.sorties = Math.max(T.sorties, local.sorties || 0); dirty = true;
  }
  memo.ecrire();
  $('#who').textContent = `${T.prenom} ${T.nom}`.trim();
  vue = 'test'; afficher(); horloge();
  if (dirty) envoyer(); else etat('ok', '✓ Réponses enregistrées');
}
const rep = q => !!(T.answers[q.id] && T.answers[q.id].length);
const nbRep = () => T.sujet.filter(rep).length;
function grilleHtml() {
  return `<details class="aller"${grilleOuverte ? ' open' : ''}><summary>Aller à une question (${nbRep()} / ${T.n} répondues)</summary>
    <div class="grille">${T.sujet.map((q, k) => `<button type="button" data-a="aller" data-i="${k}" class="${rep(q) ? 'fait' : ''}${k === T.current ? ' ici' : ''}" aria-label="Question ${k + 1}${rep(q) ? ', répondue' : ', sans réponse'}">${k + 1}</button>`).join('')}</div></details>`;
}
function afficher(focusO) {
  if (!T) return;
  const n = T.n, i = T.current;
  if (i >= n) return vueVerif();
  const q = T.sujet[i], sel = T.answers[q.id] || [], img = q.img && T.images[q.img];
  main.innerHTML = `<div class="qhead"><span class="small muted">Question ${i + 1} / ${n}</span><span class="pill">${q.m ? 'Plusieurs réponses possibles' : 'Une seule réponse'}</span></div>
    <div class="prog"><div style="width:${Math.round(100 * i / n)}%"></div></div>
    <h2 class="q" id="qt">${esc(q.q)}</h2>
    ${img ? `<div class="qimg"><img src="${esc(img)}" alt="Illustration de la question"></div>` : ''}
    <div role="group" aria-labelledby="qt">${q.c.map((c, k) => {
      const on = sel.includes(c.o);
      return `<button type="button" class="opt${on ? ' sel' : ''}" data-o="${c.o}" aria-pressed="${on}"><span class="l">${LET[k]}</span><span>${esc(c.t)}</span></button>`;
    }).join('')}</div>
    <div class="row nav"><button class="btn sec" type="button" data-a="prec"${i ? '' : ' disabled'}>◀ Précédente</button>
      <button class="btn right" type="button" data-a="suiv">${i === n - 1 ? 'Terminer ▶' : 'Suivante ▶'}</button></div>
    ${grilleHtml()}`;
  const d = main.querySelector('details.aller'); if (d) d.addEventListener('toggle', () => { grilleOuverte = d.open; });
  if (focusO !== undefined) { const b = main.querySelector(`.opt[data-o="${focusO}"]`); if (b) b.focus(); }
}
function vueVerif(msg) {
  const vides = T.sujet.map((q, k) => [q, k]).filter(([q]) => !rep(q));
  main.innerHTML = `<div class="carte large"><h2>Vérification avant remise</h2>
    ${msg ? `<div class="msg err">${esc(msg)}</div>` : ''}
    <p style="font-size:17px">${vides.length ? `<b>${vides.length} question${vides.length > 1 ? 's' : ''} sans réponse.</b> Vous pouvez y revenir :` : 'Toutes les questions ont une réponse.'}</p>
    ${vides.length ? `<div class="grille">${vides.map(([, k]) => `<button type="button" class="vide" data-a="aller" data-i="${k}">${k + 1}</button>`).join('')}</div>` : ''}
    <div class="row nav"><button class="btn sec" type="button" data-a="revenir">Revenir aux questions</button>
      <button class="btn amb" type="button" data-a="remettre" id="bRemettre">Remettre ma copie</button></div>
    <p class="small muted">Après la remise, vos réponses ne peuvent plus être modifiées.</p></div>`;
}
function choisir(o) {
  const q = T.sujet[T.current]; if (!q || !q.c.some(c => c.o === o)) return;
  let s = T.answers[q.id] || [];
  s = q.m ? (s.includes(o) ? s.filter(x => x !== o) : [...s, o]) : [o];
  if (s.length) T.answers[q.id] = s; else delete T.answers[q.id];
  modifie(0); afficher(o);
}
function aller(i) {
  T.current = Math.max(0, Math.min(i, T.n));
  modifie(1500); afficher(); window.scrollTo(0, 0);
}
function modifie(delai) {
  dirty = true; memo.ecrire();
  if (!sending) etat('busy', 'Enregistrement…');
  clearTimeout(posT); posT = setTimeout(envoyer, delai);
}
async function envoyer() {
  if (!T || remise) return;
  if (sending) { again = true; return; }
  clearTimeout(posT); clearTimeout(retryT);
  sending = true;
  const snap = JSON.stringify([T.answers, T.current, T.sorties]);
  let r;
  try { r = await rpc('passation_enregistrer', { p_token: T.token, p_answers: T.answers, p_current: T.current, p_sorties: T.sorties, p_remettre: false }); }
  catch (e) {
    sending = false;
    if (dirty) { etat('err', '⚠ Hors connexion : réponses gardées sur ce poste, nouvel essai…'); retryT = setTimeout(envoyer, 4000); }
    return;
  }
  sending = false;
  if (!T || remise) return;
  if (!r || !r.ok) return arret(r && r.err);
  if (r.fin) { T.fin = Date.parse(r.fin); if (r.now) T.skew = Date.parse(r.now) - Date.now(); horloge(); }
  if (JSON.stringify([T.answers, T.current, T.sorties]) === snap) { dirty = false; memo.ecrire(); }
  if (again || dirty) { again = false; return envoyer(); }
  etat('ok', '✓ Réponses enregistrées');
}
async function remettre() {
  if (!confirm('Remettre votre copie ?\nVous ne pourrez plus modifier vos réponses.')) return;
  const b = $('#bRemettre'); if (b) { b.disabled = true; b.textContent = 'Remise…'; }
  clearTimeout(posT); clearTimeout(retryT);
  while (sending) await sleep(150);
  let r;
  try { r = await rpc('passation_enregistrer', { p_token: T.token, p_answers: T.answers, p_current: T.current, p_sorties: T.sorties, p_remettre: true }); }
  catch (e) { etat('err', '⚠ Hors connexion'); vueVerif("La copie n'a pas pu être remise (connexion). Vos réponses sont gardées sur ce poste : vérifiez le réseau, puis cliquez à nouveau sur « Remettre ma copie »."); return; }
  if (r && (r.ok || r.err === 'remise')) return vueRemise();
  arret(r && r.err);
}
function vueRemise(deja) {
  const p = T ? T.prenom : '';
  remise = true; dirty = false; memo.effacer(); vue = 'fin';
  $('#fin').hidden = true; etat('ok', deja ? '' : '✓ Copie remise');
  main.innerHTML = `<div class="carte fini"><div class="grand" aria-hidden="true">✓</div><h1>${deja ? 'Copie déjà remise' : 'Copie remise'}</h1>
    <p>${deja ? esc(MSG.remise) : `Merci${p ? ' ' + esc(p) : ''}. Vos réponses sont enregistrées : le formateur vous communiquera le résultat.`}</p>
    <p class="small muted">Vous pouvez fermer cette page et rendre le poste.</p></div>`;
  T = null;
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
}
function arret(err) {
  if (err === 'remise') return vueRemise(true);
  if (err === 'format') { etat('err', '⚠ ' + MSG.format); return; }
  memo.effacer();
  if (err === 'jeton') { vueEntree(MSG.jeton, 'info'); return; }
  remise = true; vue = 'fin'; T = null; $('#fin').hidden = true; etat('', '');
  main.innerHTML = `<div class="carte fini"><div class="grand" aria-hidden="true">⏹</div><h1>Séance terminée</h1>
    <p>La séance a été clôturée par le formateur, ou son délai est écoulé. Les réponses déjà enregistrées seront ramassées par le formateur.</p>
    <p class="small muted">Vous pouvez fermer cette page.</p></div>`;
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
}

/* ---------- Heure de fin ---------- */
function horloge() {
  const f = $('#fin');
  if (!T || !T.fin) { f.hidden = true; return; }
  const reste = T.fin - (Date.now() + (T.skew || 0)), min = Math.ceil(reste / 60000);
  f.hidden = false;
  f.className = 'ph-fin' + (reste < 10 * 60000 ? ' vite' : '');
  f.textContent = reste <= 0 ? 'Temps écoulé' : reste < 10 * 60000 ? `Il reste ${min} min` : `Fin à ${hm(T.fin - (T.skew || 0))}`;
}
setInterval(() => {
  if (!T || remise) return;
  horloge();
  if (T.fin - (Date.now() + (T.skew || 0)) <= 0) envoyer();   // le serveur confirme la fin (ou la prolongation)
}, 15000);
setInterval(() => { if (T && !remise && !document.hidden) envoyer(); }, 60000);   // présence + prolongation éventuelle

/* ---------- Événements ---------- */
main.addEventListener('click', e => {
  if (!T) return;
  const o = e.target.closest('.opt');
  if (o) { choisir(+o.dataset.o); return; }
  const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
  const a = b.dataset.a;
  if (a === 'prec') aller(T.current - 1);
  else if (a === 'suiv') aller(T.current + 1);
  else if (a === 'aller') aller(+b.dataset.i);
  else if (a === 'revenir') aller(T.n - 1);
  else if (a === 'remettre') remettre();
});
document.addEventListener('keydown', e => {
  if (vue !== 'test' || !T || T.current >= T.n || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest && e.target.closest('input, textarea, select, summary')) return;
  const q = T.sujet[T.current], k = (e.key || '').toUpperCase(), i = LET.indexOf(k);
  if (k.length === 1 && i >= 0 && i < q.c.length) { e.preventDefault(); choisir(q.c[i].o); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); aller(T.current + 1); }
  else if (e.key === 'ArrowLeft' && T.current > 0) { e.preventDefault(); aller(T.current - 1); }
});
// Sortie de la page (autre onglet, autre application, écran éteint) : comptée au retour,
// pour qu'un simple rechargement de la page ne soit pas compté.
let cacheDepuis = 0;
document.addEventListener('visibilitychange', () => {
  if (!T || remise || vue !== 'test') { cacheDepuis = 0; return; }
  if (document.hidden) { cacheDepuis = Date.now(); if (dirty) envoyer(); return; }
  if (cacheDepuis) { cacheDepuis = 0; T.sorties++; modifie(0); }
  else envoyer();
});
window.addEventListener('online', () => { if (T && dirty) envoyer(); });
window.addEventListener('beforeunload', e => { if (T && !remise) { memo.ecrire(); e.preventDefault(); e.returnValue = ''; } });

/* ---------- Ouverture : reprise dans le même onglet (rechargement) ---------- */
(async () => {
  const m = memo.lire();
  if (m && m.token) {
    try {
      const r = await rpc('passation_reprendre', { p_token: m.token });
      if (r && r.ok) return demarrer(r, m);
      memo.effacer();
      if (r && r.err === 'remise') { vueRemise(true); return; }
      vueEntree(MSG[r && r.err] || MSG.reseau, r && r.err === 'jeton' ? 'info' : 'err');
    } catch (e) { vueEntree(MSG.reseau + ' Vos réponses restent gardées sur ce poste : rechargez la page quand le réseau revient.'); }
    return;
  }
  vueEntree();
})();
})();
