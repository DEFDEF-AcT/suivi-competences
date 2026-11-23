/* Habilitations PRE-VE : ouvre l'interface d'origine, sans la modifier, et enregistre ses données en ligne.
   - L'interface (fichier HTML qui contient la banque de questions et ses réponses) est livrée avec
     l'application, chiffrée (assets/pre-ve.bin, AES-256-GCM). La clé est dans la base et ne se lit
     qu'après connexion : sur le site public, le fichier est illisible.
   - À l'ouverture, les dernières données de la base sont placées dans le bloc de données du fichier
     (<script id="preve-data">), exactement comme si vous ouvriez votre fichier enregistré.
   - L'interface enregistre chaque modification dans le navigateur ; cette page la détecte et l'envoie
     aussitôt à la base, avec contrôle de version (un autre appareil ne peut pas écraser vos saisies sans le savoir). */
(() => {
'use strict';
const A = window.Auth, sb = A.client;
const KEY = 'preve.etab.v2', SYNC = 'preve.sync';
const BUNDLE = 'assets/pre-ve.bin', SEED = 'assets/pre-donnees-initiales.bin';
const RE_DATA = /(<script id="preve-data" type="application\/json">)([\s\S]*?)(<\/script>)/;
const $ = s => document.querySelector(s);
const safe = fn => { try { return fn(); } catch (e) { return null; } };
const esc = A.esc;
const hhmm = d => String(d.getHours()).padStart(2, '0') + 'h' + String(d.getMinutes()).padStart(2, '0');
const sleep = ms => new Promise(r => setTimeout(r, ms));

let uid = null, base = 0, dirty = false, uploading = false, again = false, conflict = false;
let seen = null, timer = 0, retryT = 0, lastSaved = null;

function toast(msg, ms) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, ms || 5000); }
function status(cls, txt) {
  const el = $('#preState');
  if (el) { el.className = 'savestate ' + cls; el.querySelector('span').textContent = txt; }
  // Le même état s'affiche dans l'indicateur d'enregistrement de l'interface PRE.
  hintText = cls === 'ok' ? '✓ ' + txt : cls === 'busy' ? 'Enregistrement en ligne…' : cls === 'err' ? '⚠ ' + txt + ' en ligne : nouvel essai automatique' : txt;
  hintWarn = cls === 'err';
  syncHint();
}

/* ---------- Intégration à l'interface PRE (sans modifier son fichier) ---------- */
let preWin = null, hintText = '', hintWarn = false;
// L'indicateur de l'interface (« Modifications non enregistrées dans le fichier ») affiche l'état en ligne.
function syncHint() {
  try {
    const h = preWin && preWin.document.getElementById('savehint'); if (!h) return;
    if (h.textContent !== hintText) h.textContent = hintText;
    h.style.color = hintWarn ? '#ffd27a' : '#c9f0c0';
  } catch (e) { /* cadre fermé */ }
}
// Un champ en cours de saisie est validé (l'interface l'enregistre alors, comme quand on change de champ).
function commitFocused() {
  try {
    const d = preWin && preWin.document, a = d && d.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'file') a.blur();
  } catch (e) {}
}
function attachPre(win) {
  preWin = win;
  // Avertissement de fermeture : celui de l'interface parle du fichier local ; c'est l'application qui
  // prévient, seulement s'il reste des modifications à envoyer en ligne.
  win.addEventListener('beforeunload', e => { e.stopImmediatePropagation(); }, true);
  const h = win.document.getElementById('savehint');
  if (h) new win.MutationObserver(() => { if (h.textContent !== hintText) { changed(); syncHint(); } })
    .observe(h, { childList: true, characterData: true, subtree: true });
  syncHint();
}
function banner(html, cls) { const b = $('#preBanner'); b.innerHTML = html; b.className = 'prebanner' + (cls ? ' ' + cls : ''); b.hidden = !html; }
const readLocal = () => safe(() => JSON.parse(localStorage.getItem(KEY)));
const readSync = () => safe(() => JSON.parse(localStorage.getItem(SYNC)));
const writeSync = () => safe(() => localStorage.setItem(SYNC, JSON.stringify({ user: uid, base, dirty, at: new Date().toISOString() })));
function clearLocal() { safe(() => { localStorage.removeItem(KEY); localStorage.removeItem(SYNC); }); }
function removeFrame() { const f = $('#preFrame'); if (f) f.remove(); }
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function embedded(html) {
  const m = html.match(RE_DATA); if (!m) return null;
  const j = safe(() => JSON.parse(m[2].trim()));
  return j && j.state && j.state.version ? j.state : null;
}
/* Ouvre un fichier chiffré par outils/construire-pre.mjs : en-tête « PREV1 », identifiant de clé, IV, données. */
async function openSealed(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) { const e = new Error('Fichier ' + url + ' introuvable (' + r.status + ').'); e.missing = r.status === 404; throw e; }
  const u8 = new Uint8Array(await r.arrayBuffer());
  const td = new TextDecoder();
  if (td.decode(u8.slice(0, 5)) !== 'PREV1') throw new Error('Format de fichier inconnu : ' + url);
  const n = u8[5], kid = td.decode(u8.slice(6, 6 + n));
  const iv = u8.slice(6 + n, 18 + n), ct = u8.slice(18 + n);
  const { data, error } = await sb.from('app_keys').select('key').eq('name', kid).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Clé de déchiffrement « ' + kid + ' » absente de la base.');
  const raw = Uint8Array.from(atob(data.key), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}
const newId = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

/* ---------- Envoi des modifications ---------- */
function changed() {
  const raw = safe(() => localStorage.getItem(KEY));
  if (raw === seen) return;
  seen = raw; dirty = true; writeSync();
  if (conflict) return;
  status('busy', 'Modifications en attente…');
  clearTimeout(timer); timer = setTimeout(() => upload(), 700);
}
async function upload(force) {
  if (conflict && !force) return false;
  if (uploading) { again = true; return false; }
  clearTimeout(timer); clearTimeout(retryT);
  const raw = safe(() => localStorage.getItem(KEY));
  if (!raw) return true;
  const st = safe(() => JSON.parse(raw));
  if (!st) return false;
  uploading = true; status('busy', 'Enregistrement…');
  const { data: v, error } = await sb.rpc('pre_save', { p_state: st, p_expected: base, p_force: !!force });
  uploading = false;
  if (error) {
    if (error.code === 'PT409' || /pre_conflict/.test(error.message || '')) { conflict = true; showConflict(); return false; }
    if (error.code === '42501' || /jwt/i.test(error.message || '')) A.verify();
    status('err', 'Non enregistré');
    banner(`<span><b>Les dernières modifications PRE ne sont pas encore enregistrées en ligne</b> (connexion ?). Elles sont gardées sur cet appareil ; nouvel essai automatique dans 15 secondes.</span><button class="btn" type="button" data-pre="retry">Réessayer maintenant</button>`, 'err');
    retryT = setTimeout(() => upload(), 15000);
    return false;
  }
  base = v; lastSaved = new Date(); conflict = false;
  if (safe(() => localStorage.getItem(KEY)) === raw) dirty = false;
  writeSync();
  banner('');
  status(dirty ? 'busy' : 'ok', dirty ? 'Modifications en attente…' : 'Enregistré en ligne à ' + hhmm(lastSaved));
  if (again || dirty) { again = false; return upload(); }
  return true;
}
async function flush() {
  clearTimeout(timer);
  commitFocused();
  changed();
  while (uploading) await sleep(150);
  if (conflict) return false;
  if (!dirty) return true;
  return upload();
}

/* ---------- Autre appareil ---------- */
function showConflict() {
  status('err', 'Conflit');
  banner(`<span><b>Les données PRE ont aussi été modifiées sur un autre appareil</b> depuis l'ouverture de cette page. Laquelle garder ?</span>
    <button class="btn" type="button" data-pre="theirs">La version de l'autre appareil</button>
    <button class="btn btn-primary" type="button" data-pre="mine">La version de cet appareil</button>`, 'err');
}
async function checkRemote() {
  if (uploading || conflict || document.hidden) return;
  const { data } = await sb.from('pre_state').select('version,saved_at').eq('id', 'main').maybeSingle();
  if (!data || data.version <= base) return;
  if (dirty) { conflict = true; showConflict(); return; }
  banner(`<span>Les données PRE ont été enregistrées depuis un autre appareil (${esc(new Date(data.saved_at).toLocaleString('fr-FR'))}).</span><button class="btn btn-primary" type="button" data-pre="reload">Afficher la version la plus récente</button>`);
}
document.addEventListener('click', async e => {
  const b = e.target.closest && e.target.closest('[data-pre]'); if (!b) return;
  const a = b.dataset.pre;
  if (a === 'retry') upload();
  else if (a === 'mine') { conflict = false; banner(''); upload(true); }
  else if (a === 'theirs') {
    const raw = safe(() => localStorage.getItem(KEY));
    if (raw) download('PRE-VE_version_cet_appareil_' + new Date().toISOString().slice(0, 10) + '.json', raw);
    dirty = false; clearLocal(); removeFrame(); location.reload();
  } else if (a === 'reload') { removeFrame(); clearLocal(); location.reload(); }
  else if (a === 'reopen') location.reload();
  else if (a === 'save') {
    const ok = await flush();
    toast(ok ? 'Données PRE enregistrées dans la base sécurisée' + (lastSaved ? ' (dernier envoi à ' + hhmm(lastSaved) + ').' : '.') : "Enregistrement impossible pour l'instant : vos modifications restent sur cet appareil.");
  }
});

function showError(msg) {
  $('#preMain').innerHTML = `<div class="card empty"><h2>L'interface PRE ne s'est pas ouverte</h2><p>${esc(msg)}</p><button class="btn btn-primary" type="button" data-pre="reopen">Réessayer</button></div>`;
}

/* ---------- Passation multi-postes : services demandés par l'interface PRE ----------
   L'interface n'a aucun accès réseau (cadre isolé) : elle appelle ces fonctions de la page,
   qui parlent à la base avec la session du formateur. Les postes des stagiaires, eux, passent
   par passation.html, sans compte, et ne reçoivent jamais le corrigé. */
function erreurSeance(error) {
  const m = (error && (error.message || error.details)) || String(error || '');
  if (error && (error.code === '42501' || /pre_acces|jwt/i.test(m))) { A.verify(); return new Error('accès refusé : reconnectez-vous'); }
  if (/pre_duree/.test(m)) return new Error('durée de validité incorrecte');
  if (/pre_copies/.test(m)) return new Error('aucun stagiaire choisi');
  if (/pre_images/.test(m)) return new Error('illustrations trop volumineuses');
  if (/pre_seance_close/.test(m)) return new Error('la séance est déjà clôturée');
  if (/pre_seance_inconnue/.test(m)) return new Error('séance introuvable');
  if (/fetch|network|load failed/i.test(m)) return new Error('connexion impossible');
  return new Error(m || 'erreur inconnue');
}
async function rpcSeance(fn, args) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw erreurSeance(error);
  return data;
}
window.PRE_HOTE = {
  url: new URL('passation.html', location.href).href,
  etat: () => rpcSeance('pre_seances_etat'),
  creer: p => rpcSeance('pre_seance_creer', { p_session: p.session, p_intitule: p.intitule, p_minutes: p.minutes, p_copies: p.copies, p_images: p.images }),
  copie: id => rpcSeance('pre_copie_lire', { p_id: id }),
  action: (id, action, minutes) => rpcSeance('pre_seance_action', { p_id: id, p_action: action, p_minutes: minutes || null }),
  flush: () => flush()
};

/* ---------- Ouverture ---------- */
(async () => {
  const s = await A.requireSession({ app: 'pre' });
  uid = s.user.id;
  const bar = A.mountBar('Habilitations PRE-VE');
  bar.querySelector('#appbarSlot').innerHTML = `<span class="savestate" id="preState" role="status" aria-live="polite"><i aria-hidden="true"></i><span>Connexion…</span></span>
    <button class="appbar-btn primary" type="button" data-pre="save" title="Envoie les dernières modifications et vérifie qu'elles sont enregistrées en ligne">Enregistrer</button>`;
  A.onBeforeLeave(async () => { const ok = await flush(); if (ok) { removeFrame(); clearLocal(); } return ok; });

  // 1. L'interface, livrée chiffrée avec l'application
  let html;
  try { html = await openSealed(BUNDLE); }
  catch (e) { status('err', 'Non ouverte'); showError("L'interface n'a pas pu être déchiffrée (" + (e.message || e) + '). Vérifiez la connexion Internet, puis réessayez.'); return; }
  if (!RE_DATA.test(html)) { showError("L'interface livrée n'est pas reconnue."); return; }

  // 2. Les données
  const { data: row, error } = await sb.from('pre_state').select('state,version,saved_at').eq('id', 'main').maybeSingle();
  if (error) { showError('Les données PRE sont inaccessibles pour l\'instant (' + (error.message || error.code) + ').'); return; }
  const sync = readSync(), local = readLocal();
  const pending = !!(local && local.version && sync && sync.dirty && sync.user === uid);
  let state = null, push = false, info = '';
  if (row) {
    base = row.version; state = row.state;
    if (pending) {
      if (sync.base === row.version) { state = local; push = true; info = 'Des modifications PRE faites sur cet appareil n\'avaient pas été envoyées lors de la dernière séance : elles ont été récupérées et enregistrées.'; }
      else if (confirm("Des modifications PRE faites sur cet appareil n'avaient pas été envoyées, mais les données ont été modifiées entre-temps sur un autre appareil.\n\nOK : garder la version en ligne (votre version locale est d'abord téléchargée en fichier .json).\nAnnuler : garder la version de cet appareil et remplacer la version en ligne.")) {
        download('PRE-VE_version_cet_appareil_' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(local, null, 1));
      } else { state = local; push = 'force'; }
    }
  } else if (pending) { state = local; push = true; }
  else {
    state = embedded(html);
    if (!state) {
      try { const j = JSON.parse(await openSealed(SEED)); state = j && j.state && j.state.version ? j.state : null; }
      catch (e) { if (!e.missing) { showError('Les données initiales PRE n\'ont pas pu être lues (' + (e.message || e) + ').'); return; } }
    }
    if (state) { push = true; info = 'Première ouverture : les données de votre fichier PRE ont été copiées dans la base sécurisée.'; }
  }

  // 3. Préparer le document : données dans le bloc prévu par l'interface, copie de travail identique dans le navigateur
  if (state) {
    if (!state.instance) state.instance = newId();
    if (!state.savedAt) state.savedAt = new Date().toISOString();
    const payload = JSON.stringify({ app: 'PRE-VE', savedAt: state.savedAt, state }).replace(/</g, '\\u003c');
    html = html.replace(RE_DATA, (m, a, b, c) => a + payload + c);
    safe(() => localStorage.setItem(KEY, JSON.stringify(state)));
  } else {
    html = html.replace(RE_DATA, (m, a, b, c) => a + 'null' + c);
    safe(() => localStorage.removeItem(KEY));
  }
  seen = safe(() => localStorage.getItem(KEY));
  dirty = !!push; writeSync();

  // 4. Afficher l'interface
  window.__PRE_HTML = html;
  window.__PRE_READY = win => { A.watchActivity(win); attachPre(win); window.__PRE_HTML = null; };
  const f = $('#preFrame');
  f.src = 'PRE-VE_Gestion_Formation.html';
  f.hidden = false; $('#preMain').hidden = true;
  status(row ? 'ok' : 'busy', row ? 'Données à jour (' + hhmm(new Date(row.saved_at)) + ')' : 'Première ouverture');
  if (info) toast(info, 8000);
  if (push) upload(push === 'force');

  // 5. Suivre les modifications
  window.addEventListener('storage', e => { if (e.key === KEY) changed(); });
  setInterval(changed, 2000);
  setInterval(checkRemote, 45000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); else checkRemote(); });
  window.addEventListener('beforeunload', e => { commitFocused(); changed(); if (dirty) { upload(); e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('pagehide', () => { commitFocused(); changed(); if (!dirty) clearLocal(); });
})();
})();
