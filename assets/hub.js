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
  global: 'Tous vos appareils ont été déconnectés.',
  acces: "Votre compte n'a pas accès à cette partie de l'application."
};
function show(id) { ['vLogin', 'vMfa', 'vPwd', 'vHub'].forEach(v => { $('#' + v).hidden = v !== id; }); }
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
  if (s.mustChange) { showFirst(); return; }
  const next = A.nextPage();
  if (next && A.canUse(next.replace('.html', ''))) { location.replace(next); return; }
  const msg = new URLSearchParams(location.search).get('msg');
  history.replaceState(null, '', location.pathname + location.hash);
  show('vHub');
  A.mountBar('Accueil').querySelector('[data-auth=home]').hidden = true;
  $('#hubName').textContent = s.name.includes('@') ? '' : s.name;
  $('#hubEtab').textContent = C.etablissement + (A.isAdmin() ? ' · administrateur' : '');
  $('#tIsmi').hidden = !A.canUse('ismi'); $('#tBts').hidden = !A.canUse('bts'); $('#tPre').hidden = !A.canUse('pre');
  $('#noAccess').hidden = ['ismi', 'bts', 'pre'].some(a => A.canUse(a));
  if (msg === 'acces') toast(MSG.acces);
  $('#tabAdmin').hidden = !A.isAdmin();
  stats(); renderMfa();
  showTab();
}

/* ---------- Onglets de l'accueil ---------- */
let teamLoaded = false;
function showTab() {
  let t = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (!['enseignements', 'compte', 'administration'].includes(t) || (t === 'administration' && !A.isAdmin())) t = 'enseignements';
  document.querySelectorAll('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== t; });
  document.querySelectorAll('.hubtabs a').forEach(a => { if (a.dataset.tab === t) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if (t === 'administration' && !teamLoaded) { teamLoaded = true; renderTeam(); }
}
window.addEventListener('hashchange', () => { if (!$('#vHub').hidden) showTab(); });

/* ---------- Premier mot de passe ---------- */
function showFirst() { show('vPwd'); $('#f1').focus(); }
$('#fFirst').addEventListener('submit', async e => {
  e.preventDefault();
  const p1 = $('#f1').value, p2 = $('#f2').value, m = $('#firstMsg');
  const err = checkPassword(p1, p2); if (err) { note(m, err, 'err'); return; }
  const { error } = await sb.auth.updateUser({ password: p1 });
  if (error) { note(m, A.frError(error), 'err'); return; }
  await sb.rpc('password_changed');
  $('#f1').value = ''; $('#f2').value = '';
  toast('Mot de passe enregistré.');
  await enter();
});
function checkPassword(p1, p2) {
  if (p1.length < 12) return '12 caractères au moins.';
  if (!(/[a-zA-Z]/.test(p1) && /\d/.test(p1) && /[^a-zA-Z0-9]/.test(p1))) return 'Mélangez lettres, chiffres et au moins un symbole.';
  if (p1 !== p2) return 'Les deux saisies sont différentes.';
  return '';
}
async function count(app, coll) {
  const { count, error } = await sb.from('docs').select('id', { count: 'exact', head: true }).eq('app', app).eq('coll', coll);
  return error ? null : count;
}
async function stats() {
  for (const [app, el] of [['ismi', '#stIsmi'], ['bts', '#stBts']]) {
    if (!A.canUse(app)) continue;
    const [c, s, e] = await Promise.all([count(app, 'classes'), count(app, 'students'), count(app, 'evaluations')]);
    $(el).textContent = c == null ? '' : c ? `${c} classe${c > 1 ? 's' : ''} · ${s} étudiant${s > 1 ? 's' : ''} · ${e} évaluation${e > 1 ? 's' : ''}` : 'Aucune classe pour l’instant';
  }
  if (!A.canUse('pre')) return;
  const { data } = await sb.from('pre_state').select('saved_at').eq('id', 'main').maybeSingle();
  $('#stPre').textContent = data ? 'Dernier enregistrement : ' + fmt(data.saved_at) : 'Première ouverture : vos données seront reprises du fichier PRE';
}


/* ---------- Équipe (administrateur) ---------- */
let TEAM = [], CLASSES = { ismi: [], bts: [] };
const siteUrl = () => new URL('.', location.href).href;
async function callTeam(body) {
  const { data, error } = await sb.functions.invoke('equipe', { body });
  if (error) {
    let msg = error.message || 'Erreur';
    try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e) {}
    throw new Error(msg);
  }
  return data;
}
async function loadClasses() {
  const { data } = await sb.from('docs').select('app,id,data').eq('coll', 'classes');
  CLASSES = { ismi: [], bts: [] };
  (data || []).forEach(r => { if (CLASSES[r.app]) CLASSES[r.app].push({ id: r.id, name: (r.data && r.data.name) || r.id }); });
  Object.values(CLASSES).forEach(l => l.sort((a, b) => a.name.localeCompare(b.name, 'fr')));
}
function accessSummary(a) {
  const parts = [];
  for (const app of ['ismi', 'bts']) {
    const v = a && a[app]; if (!v) continue;
    const label = app === 'ismi' ? 'ISMI' : 'BTS MV';
    if (!v.classes) parts.push(label + ' : toutes les classes');
    else parts.push(label + ' : ' + (v.classes.map(id => (CLASSES[app].find(c => c.id === id) || { name: 'classe supprimée' }).name).join(', ') || 'aucune classe'));
  }
  if (a && a.pre) parts.push('PRE');
  return parts.join(' · ') || 'Aucun accès';
}
function accessFields(a) {
  a = a || {};
  return ['ismi', 'bts'].map(app => {
    const v = a[app], all = !v || !v.classes, sel = new Set((v && v.classes) || []);
    const cls = CLASSES[app];
    return `<fieldset class="acc"><legend><label class="chkline"><input type="checkbox" name="${app}"${v ? ' checked' : ''}> <b>${esc(A.LABELS[app])}</b></label></legend>
      <div class="acc-body"><label class="chkline"><input type="radio" name="${app}-scope" value="all"${all ? ' checked' : ''}> Toutes les classes, y compris celles créées plus tard</label>
      <label class="chkline"><input type="radio" name="${app}-scope" value="some"${all ? '' : ' checked'}> Seulement les classes cochées :</label>
      <div class="acc-cls">${cls.length ? cls.map(c => `<label class="chkline"><input type="checkbox" name="${app}-cls" value="${esc(c.id)}"${sel.has(c.id) ? ' checked' : ''}> ${esc(c.name)}</label>`).join('') : '<span class="xs muted">Aucune classe créée pour l’instant.</span>'}</div></div></fieldset>`;
  }).join('') + `<fieldset class="acc"><legend><label class="chkline"><input type="checkbox" name="pre"${a.pre ? ' checked' : ''}> <b>${esc(A.LABELS.pre)}</b></label></legend>
    <p class="xs muted">Accès complet à l’interface PRE (sessions, stagiaires, tests, attestations) : elle ne distingue pas les droits par formateur.</p></fieldset>`;
}
function readAccess(f) {
  const a = {};
  for (const app of ['ismi', 'bts']) {
    if (!f.querySelector(`[name=${app}]`).checked) continue;
    const all = f.querySelector(`[name=${app}-scope][value=all]`).checked;
    const cls = [...f.querySelectorAll(`[name=${app}-cls]:checked`)].map(i => i.value);
    if (!all && !cls.length) throw new Error('Cochez au moins une classe pour ' + A.LABELS[app] + ', ou choisissez « Toutes les classes ».');
    a[app] = { classes: all ? null : cls };
  }
  if (f.querySelector('[name=pre]').checked) a.pre = true;
  if (!Object.keys(a).length) throw new Error('Cochez au moins une partie de l’application.');
  return a;
}
async function renderTeam() {
  const box = $('#teamBox');
  try {
    await loadClasses();
    const r = await callTeam({ action: 'list' });
    TEAM = r.members || [];
    const rows = TEAM.map(m => `<tr><td><b>${esc(m.display_name)}</b>${m.role === 'admin' ? ' <span class="chip">administrateur</span>' : ''}<br><span class="xs muted">${esc(m.email || '')}</span></td>
      <td class="small">${m.role === 'admin' ? 'Tous les droits' : esc(accessSummary(m.access))}${m.must_change_password ? '<br><span class="xs muted">Mot de passe provisoire pas encore changé</span>' : ''}</td>
      <td class="small">${m.last_sign_in_at ? esc(fmt(m.last_sign_in_at)) : '<span class="muted">jamais</span>'}</td>
      <td class="num">${m.role === 'admin' ? '' : `<button class="btn btn-ghost" type="button" data-team="edit" data-id="${esc(m.user_id)}">Modifier</button><button class="btn btn-ghost" type="button" data-team="reset" data-id="${esc(m.user_id)}">Nouveau mot de passe</button><button class="btn btn-ghost btn-danger" type="button" data-team="remove" data-id="${esc(m.user_id)}">Retirer</button>`}</td></tr>`).join('');
    box.innerHTML = `<div class="tablewrap"><table><thead><tr><th>Formateur</th><th>Accès</th><th>Dernière connexion</th><th class="num"><span class="sr">Actions</span></th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="inline" style="margin-top:12px"><button class="btn btn-primary" type="button" data-team="add">+ Ajouter un collègue</button></div><div id="teamForm"></div>`;
  } catch (e) { box.innerHTML = `<p class="msg err">${esc(e.message)}</p>`; }
}
function teamForm(m) {
  const f = $('#teamForm');
  f.innerHTML = `<form class="card pad stack teamform" id="fTeam" novalidate><h3>${m ? 'Accès de ' + esc(m.display_name) : 'Ajouter un collègue'}</h3>
    <div class="row"><label class="fld"><span>Nom affiché</span><input name="name" type="text" value="${esc(m ? m.display_name : '')}" autocomplete="off"></label>
    ${m ? '' : '<label class="fld"><span>Adresse e-mail (son identifiant)</span><input name="email" type="email" autocomplete="off"></label>'}</div>
    ${accessFields(m && m.access)}
    <div class="msg err" id="teamErr" hidden></div>
    <div class="inline"><button class="btn btn-primary" type="submit">${m ? 'Enregistrer les accès' : 'Créer le compte'}</button><button class="btn" type="button" data-team="cancel">Annuler</button></div></form>`;
  const form = $('#fTeam');
  form.querySelector('input').focus();
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#teamErr'), btn = form.querySelector('[type=submit]');
    try {
      const access = readAccess(form), name = form.name.value.trim();
      if (!name) throw new Error('Indiquez le nom du collègue.');
      btn.disabled = true;
      if (m) { await callTeam({ action: 'update', user_id: m.user_id, name, access }); toast('Accès enregistrés.'); f.innerHTML = ''; renderTeam(); return; }
      const r = await callTeam({ action: 'create', name, email: form.email.value.trim(), access });
      showCredentials(name, r.email, r.password, 'Compte créé');
      renderTeam().then(() => showCredentials(name, r.email, r.password, 'Compte créé'));
    } catch (x) { note(err, x.message, 'err'); btn.disabled = false; }
  });
}
function showCredentials(name, email, password, title) {
  const f = $('#teamForm'); if (!f) return;
  const text = `Adresse : ${siteUrl()}\nIdentifiant : ${email}\nMot de passe provisoire : ${password}`;
  f.innerHTML = `<div class="card pad stack creds"><h3>${esc(title)} : ${esc(name)}</h3>
    <p class="small">Transmettez ces informations à votre collègue par un moyen sûr (de vive voix, ou message direct). Elles ne seront plus affichées. À sa première connexion, il devra choisir son propre mot de passe.</p>
    <pre class="secret">${esc(text)}</pre>
    <div class="inline"><button class="btn btn-primary" type="button" id="copyCreds">Copier</button><button class="btn" type="button" data-team="cancel">Fermer</button></div></div>`;
  $('#copyCreds').addEventListener('click', () => navigator.clipboard.writeText(text).then(() => toast('Copié.'), () => toast('Copie impossible : sélectionnez le texte.')));
}
document.addEventListener('click', async e => {
  const b = e.target.closest && e.target.closest('[data-team]'); if (!b) return;
  const a = b.dataset.team, m = TEAM.find(x => x.user_id === b.dataset.id);
  if (a === 'add') teamForm(null);
  else if (a === 'cancel') $('#teamForm').innerHTML = '';
  else if (a === 'edit' && m) teamForm(m);
  else if (a === 'reset' && m) {
    if (!confirm('Donner un nouveau mot de passe provisoire à ' + m.display_name + ' ?\n\nSon mot de passe actuel cessera de fonctionner et sa double authentification sera remise à zéro (utile en cas de téléphone perdu).')) return;
    try { const r = await callTeam({ action: 'reset', user_id: m.user_id }); showCredentials(m.display_name, r.email, r.password, 'Nouveau mot de passe'); }
    catch (x) { toast(x.message); }
  } else if (a === 'remove' && m) {
    if (!confirm('Retirer l’accès de ' + m.display_name + ' ?\n\nSon compte est supprimé et il ne peut plus se connecter. Les évaluations et les notes qu’il a saisies restent dans l’application.')) return;
    try { await callTeam({ action: 'remove', user_id: m.user_id }); toast('Accès retiré.'); renderTeam(); }
    catch (x) { toast(x.message); }
  }
});

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
  const err = checkPassword(p1, p2); if (err) { note(m, err, 'err'); return; }
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
