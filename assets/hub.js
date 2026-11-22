/* Accueil : connexion, double authentification, tableau de bord et réglages du compte. */
(() => {
'use strict';
const A = window.Auth, sb = A.client, C = window.APP_CONFIG;
const $ = s => document.querySelector(s);
const esc = A.esc;
const MSG = {
  inactivite: "Vous avez été déconnecté après une période d'inactivité. Reconnectez-vous pour continuer.",
  refuse: "Ce compte n'est pas autorisé à utiliser l'application. Contactez l'administrateur.",
  expire: 'Votre session a expiré : reconnectez-vous.',
  deconnecte: 'Vous avez été déconnecté.',
  global: 'Tous vos appareils ont été déconnectés.'
};
function show(id) { ['vLogin', 'vMfa', 'vHub'].forEach(v => { $('#' + v).hidden = v !== id; }); }
function note(el, txt, cls) { el.textContent = txt; el.className = 'msg' + (cls ? ' ' + cls : ''); el.hidden = !txt; }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 4500); }
const fmt = iso => new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const day = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

/* ---------- Connexion ---------- */
function showLogin() {
  show('vLogin');
  $('#etab').textContent = C.etablissement;
  $('#lRemember').checked = A.remembered();
  const m = new URLSearchParams(location.search).get('msg');
  if (m && MSG[m]) note($('#loginMsg'), MSG[m], m === 'refuse' ? 'err' : '');
  $('#lEmail').focus();
}
$('#fLogin').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('#lEmail').value.trim(), pass = $('#lPass').value;
  if (!email || !pass) { note($('#loginMsg'), 'Saisissez votre identifiant et votre mot de passe.', 'err'); return; }
  const b = $('#lGo'); if (b.disabled) return;
  b.disabled = true; b.textContent = 'Connexion…';
  A.setRemember($('#lRemember').checked);
  try {
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (error) throw error;
    $('#lPass').value = '';
    A.touch();
    const a = await A.assurance();
    if (a && a.nextLevel === 'aal2' && a.currentLevel !== 'aal2') { showMfa(); return; }
    await enter();
  } catch (err) {
    note($('#loginMsg'), A.frError(err), 'err');
  } finally { b.disabled = false; b.textContent = 'Se connecter'; }
});

/* ---------- Second facteur ---------- */
function showMfa() { show('vMfa'); $('#mCode').value = ''; $('#mCode').focus(); }
$('#fMfa').addEventListener('submit', async e => {
  e.preventDefault();
  const code = $('#mCode').value.replace(/\D/g, '');
  if (code.length !== 6) { note($('#mfaMsg'), 'Le code comporte 6 chiffres.', 'err'); return; }
  try {
    const { data, error } = await sb.auth.mfa.listFactors();
    if (error) throw error;
    const f = (data.totp || [])[0];
    if (!f) throw new Error('Aucune application d’authentification enregistrée.');
    const { error: e2 } = await sb.auth.mfa.challengeAndVerify({ factorId: f.id, code });
    if (e2) throw e2;
    A.touch();
    await enter();
  } catch (err) { note($('#mfaMsg'), A.frError(err), 'err'); $('#mCode').select(); }
});
$('#mCode').addEventListener('input', e => { if (e.target.value.replace(/\D/g, '').length === 6) $('#fMfa').requestSubmit(); });
$('#mCancel').addEventListener('click', async () => { await sb.auth.signOut({ scope: 'local' }); showLogin(); });

/* ---------- Accueil ---------- */
let entering = null;
function enter() { return entering || (entering = doEnter().finally(() => { entering = null; })); }
async function doEnter() {
  const s = await A.requireSession();
  const next = A.nextPage();
  if (next) { location.replace(next); return; }
  history.replaceState(null, '', location.pathname);
  show('vHub');
  A.mountBar('Accueil').querySelector('[data-auth=home]').hidden = true;
  $('#hubName').textContent = s.name.includes('@') ? '' : s.name;
  $('#hubEtab').textContent = C.etablissement;
  stats(); renderMfa();
}
async function count(app, coll) {
  const { count, error } = await sb.from('docs').select('id', { count: 'exact', head: true }).eq('app', app).eq('coll', coll);
  return error ? null : count;
}
async function stats() {
  for (const [app, el] of [['ismi', '#stIsmi'], ['bts', '#stBts']]) {
    const [c, s, e] = await Promise.all([count(app, 'classes'), count(app, 'students'), count(app, 'evaluations')]);
    $(el).textContent = c == null ? '' : c ? `${c} classe${c > 1 ? 's' : ''} · ${s} étudiant${s > 1 ? 's' : ''} · ${e} évaluation${e > 1 ? 's' : ''}` : 'Aucune classe pour l’instant';
  }
  const { data } = await sb.from('pre_state').select('saved_at').eq('id', 'main').maybeSingle();
  $('#stPre').textContent = data ? 'Dernier enregistrement : ' + fmt(data.saved_at) : 'Première ouverture : vos données seront reprises du fichier PRE';
}

/* ---------- Sauvegarde complète ---------- */
async function allDocs(app) {
  const out = {}, size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await sb.from('docs').select('coll,id,data').eq('app', app).order('coll').order('id').range(from, from + size - 1);
    if (error) throw error;
    data.forEach(r => { out[r.coll + '/' + r.id] = r.data; });
    if (data.length < size) break;
  }
  return out;
}
$('#bBackup').addEventListener('click', async () => {
  const msg = $('#backupMsg'); msg.textContent = 'Préparation…';
  try {
    const now = new Date().toISOString();
    const [ismi, bts, pre] = await Promise.all([allDocs('ismi'), allDocs('bts'), sb.from('pre_state').select('state,saved_at').eq('id', 'main').maybeSingle()]);
    if (pre.error) throw pre.error;
    const file = {
      app: 'suivi-competences', version: 1, savedAt: now,
      ismi: { app: 'evaluations-ismi', version: 1, savedAt: now, data: ismi },
      bts: { app: 'evaluations-bts', version: 1, savedAt: now, data: bts },
      pre: pre.data ? { app: 'PRE-VE', savedAt: pre.data.saved_at, state: pre.data.state } : null
    };
    const name = 'suivi-competences_sauvegarde_' + day() + '.json';
    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    msg.textContent = 'Fichier « ' + name + ' » téléchargé. Il contient des données personnelles d’étudiants : rangez-le dans un dossier protégé.';
  } catch (e) { msg.textContent = A.frError(e); }
});

/* ---------- Double authentification ---------- */
async function renderMfa() {
  const box = $('#mfaBox');
  const { data, error } = await sb.auth.mfa.listFactors();
  if (error) { box.innerHTML = `<p>${esc(A.frError(error))}</p>`; return; }
  const f = (data.totp || [])[0];
  if (f) {
    box.innerHTML = `<p><b>Activée</b> depuis le ${esc(fmt(f.created_at))}. À chaque connexion, le code de votre application est demandé après le mot de passe.</p>
      <div class="inline"><button class="btn btn-danger" type="button" id="mfaOff">Désactiver</button></div>`;
    $('#mfaOff').addEventListener('click', async () => {
      if (!confirm('Désactiver la double authentification ? Le mot de passe seul suffira pour se connecter.')) return;
      const { error: e2 } = await sb.auth.mfa.unenroll({ factorId: f.id });
      if (e2) toast(A.frError(e2)); else { toast('Double authentification désactivée.'); renderMfa(); }
    });
  } else {
    box.innerHTML = `<p>Recommandée : en plus du mot de passe, un code à 6 chiffres donné par une application de votre téléphone (Google Authenticator, Microsoft Authenticator, FreeOTP…).</p>
      <div class="inline"><button class="btn btn-primary" type="button" id="mfaOn">Activer</button></div>`;
    $('#mfaOn').addEventListener('click', enroll);
  }
}
async function enroll() {
  const box = $('#mfaBox');
  try {
    const { data: l } = await sb.auth.mfa.listFactors();
    for (const f of ((l && l.all) || [])) if (f.status !== 'verified') await sb.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', issuer: 'Suivi compétences', friendlyName: 'Téléphone ' + new Date().toISOString().slice(0, 16) });
    if (error) throw error;
    box.innerHTML = `<p>1. Dans votre application d'authentification, ajoutez un compte en scannant ce code :</p>
      <img class="qr" alt="QR code à scanner avec l'application d'authentification" src="${esc(data.totp.qr_code)}">
      <p class="xs">Ou saisissez la clé : <span class="secret">${esc(data.totp.secret)}</span></p>
      <form id="fEnroll" class="stack" novalidate><label class="fld"><span>2. Saisissez le code à 6 chiffres affiché</span><input id="eCode" class="code-input" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></label>
      <div class="msg err" id="eMsg" hidden></div>
      <div class="inline"><button class="btn btn-primary" type="submit">Valider</button><button class="btn" type="button" id="eCancel">Annuler</button></div></form>`;
    $('#eCode').focus();
    $('#eCancel').addEventListener('click', async () => { await sb.auth.mfa.unenroll({ factorId: data.id }); renderMfa(); });
    $('#fEnroll').addEventListener('submit', async e => {
      e.preventDefault();
      const code = $('#eCode').value.replace(/\D/g, '');
      const { error: e2 } = await sb.auth.mfa.challengeAndVerify({ factorId: data.id, code });
      if (e2) { note($('#eMsg'), A.frError(e2), 'err'); return; }
      toast('Double authentification activée.');
      renderMfa();
    });
  } catch (e) { box.innerHTML = `<p>${esc(A.frError(e))}</p>`; }
}

/* ---------- Mot de passe et session ---------- */
$('#fPass').addEventListener('submit', async e => {
  e.preventDefault();
  const p1 = $('#p1').value, p2 = $('#p2').value, m = $('#passMsg');
  if (p1.length < 12) { note(m, '12 caractères au moins.', 'err'); return; }
  if (!(/[a-zA-Z]/.test(p1) && /\d/.test(p1) && /[^a-zA-Z0-9]/.test(p1))) { note(m, 'Mélangez lettres, chiffres et au moins un symbole.', 'err'); return; }
  if (p1 !== p2) { note(m, 'Les deux saisies sont différentes.', 'err'); return; }
  const { error } = await sb.auth.updateUser({ password: p1 });
  if (error) { note(m, A.frError(error), 'err'); return; }
  $('#p1').value = ''; $('#p2').value = '';
  note(m, 'Mot de passe changé.', 'ok');
});
$('#bOut').addEventListener('click', () => A.logout());
$('#bOutAll').addEventListener('click', async () => {
  if (!confirm('Fermer la session sur tous vos appareils (ordinateurs, téléphone, tablette) ?')) return;
  A.logout('global', 'global');
});

/* ---------- Démarrage ---------- */
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { showLogin(); return; }
  const a = await A.assurance();
  if (a && a.nextLevel === 'aal2' && a.currentLevel !== 'aal2') { showMfa(); return; }
  await enter();
})();
})();
