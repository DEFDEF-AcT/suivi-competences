/* Connexion, session, déconnexion automatique et barre commune à toutes les pages. */
(() => {
'use strict';

// Aucune page de l'application ne doit s'afficher dans le cadre d'un autre site (anti-« clickjacking »).
if (window.top !== window.self) {
  try { window.top.location = window.location.href; } catch (e) { document.documentElement.innerHTML = ''; }
  throw new Error('cadre refusé');
}

const C = window.APP_CONFIG;
const REMEMBER = 'sc.remember';        // « Rester connecté sur cet appareil »
const ACTIVITY = 'sc.lastActivity';
const LOCAL_DATA = ['preve.etab.v2', 'preve.sync'];   // copie de travail PRE, effacée à la déconnexion
const PAGES = ['ismi.html', 'bts.html', 'pre.html'];

const safe = fn => { try { return fn(); } catch (e) { return null; } };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const remembered = () => safe(() => localStorage.getItem(REMEMBER)) === '1';

// Session dans sessionStorage (effacée à la fermeture du navigateur) sauf si l'utilisateur
// a demandé à rester connecté sur son appareil personnel.
const storage = {
  getItem: k => safe(() => (remembered() ? localStorage : sessionStorage).getItem(k)),
  setItem: (k, v) => safe(() => {
    const p = remembered();
    (p ? localStorage : sessionStorage).setItem(k, v);
    (p ? sessionStorage : localStorage).removeItem(k);
  }),
  removeItem: k => safe(() => { localStorage.removeItem(k); sessionStorage.removeItem(k); })
};

const client = window.supabase.createClient(C.supabaseUrl, C.supabaseKey, {
  auth: { storage, storageKey: 'sc-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});

const here = () => decodeURIComponent(location.pathname.split('/').pop() || 'index.html');
const never = () => new Promise(() => {});
function home(params) {
  location.replace('index.html' + (params ? '?' + new URLSearchParams(params) : ''));
  return never();
}

/* ---------- Inactivité ---------- */
const idleLimitMs = () => (remembered() ? 14 * 24 * 60 : C.idleMinutes) * 60000;
const touch = () => safe(() => localStorage.setItem(ACTIVITY, String(Date.now())));
const idleExpired = () => {
  const last = Number(safe(() => localStorage.getItem(ACTIVITY)));
  return !!last && Date.now() - last > idleLimitMs();
};
let lastTouch = 0, idleTimer = 0;
function onActivity() { const n = Date.now(); if (n - lastTouch > 15000) { lastTouch = n; touch(); } }
function watchActivity(win) {
  ['pointerdown', 'keydown', 'wheel', 'touchstart', 'input'].forEach(ev =>
    win.addEventListener(ev, onActivity, { passive: true, capture: true }));
}
function startIdle() {
  if (idleTimer) return;
  watchActivity(window);
  idleTimer = setInterval(() => { if (idleExpired()) logout('inactivite'); }, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && idleExpired()) logout('inactivite'); });
}

/* ---------- Session ---------- */
async function assurance() {
  const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  return error ? null : data;
}
async function memberOf(user) {
  const { data, error } = await client.from('members').select('display_name').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  return data;   // null : compte inconnu de la liste des formateurs autorisés
}
const Auth = {
  client, esc, user: null, name: '',
  remembered,
  setRemember(v) { safe(() => localStorage.setItem(REMEMBER, v ? '1' : '0')); },
  touch, watchActivity, assurance, memberOf,
  nextPage() {
    const n = new URLSearchParams(location.search).get('next');
    return PAGES.includes(n) ? n : null;
  },

  /* Pages protégées : renvoie l'utilisateur, ou redirige vers la connexion. */
  async requireSession() {
    const { data: { session } } = await client.auth.getSession();
    if (!session) return home({ next: here() });
    if (idleExpired()) { await this.logout('inactivite'); return never(); }
    const { data: u, error: ue } = await client.auth.getUser();
    if (ue || !u || !u.user) { storage.removeItem('sc-auth'); return home({ next: here(), msg: 'expire' }); }
    const a = await assurance();
    if (a && a.nextLevel === 'aal2' && a.currentLevel !== 'aal2') return home({ next: here() });
    let m;
    try { m = await memberOf(u.user); } catch (e) { m = undefined; }
    if (m === null) { await client.auth.signOut({ scope: 'local' }); return home({ msg: 'refuse' }); }
    this.user = u.user;
    this.name = (m && m.display_name) || u.user.email || '';
    touch(); startIdle();
    client.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT' && !loggingOut) home({ msg: 'deconnecte' }); });
    return { user: u.user, name: this.name };
  },

  /* Vérifie la session après un refus du serveur (session expirée → reconnexion). */
  async verify() {
    const { data, error } = await client.auth.getUser();
    if (error || !data || !data.user) home({ next: here(), msg: 'expire' });
  },

  /* Actions à mener avant de quitter la page ou de se déconnecter (envoi des dernières saisies). */
  hooks: [],
  onBeforeLeave(fn) { this.hooks.push(fn); },
  async runHooks() {
    const res = await Promise.race([
      Promise.allSettled(this.hooks.map(h => Promise.resolve().then(h))),
      new Promise(r => setTimeout(() => r([{ status: 'rejected' }]), 8000))
    ]);
    return res.every(r => r.status === 'fulfilled' && r.value !== false);
  },
  async leave(url) {
    const ok = await this.runHooks();
    if (!ok && !confirm("Des modifications n'ont pas encore pu être enregistrées (connexion ?). Quitter quand même ?")) return;
    location.href = url;
  },

  async logout(reason, scope) {
    if (loggingOut) return;
    loggingOut = true;
    const ok = await this.runHooks();
    if (!ok && reason !== 'inactivite' &&
        !confirm("Des modifications n'ont pas encore pu être enregistrées (connexion ?). Se déconnecter quand même ?")) {
      loggingOut = false; return;
    }
    // Les données ne restent jamais sur l'appareil après la déconnexion, sauf des
    // modifications PRE non envoyées lors d'une déconnexion automatique (récupérées à la prochaine connexion).
    if (ok || reason !== 'inactivite') LOCAL_DATA.forEach(k => safe(() => localStorage.removeItem(k)));
    try { await client.auth.signOut({ scope: scope === 'global' ? 'global' : 'local' }); } catch (e) {}
    storage.removeItem('sc-auth');
    safe(() => localStorage.removeItem(ACTIVITY));
    home(reason ? { msg: reason } : null);
  },

  /* Barre du haut : retour à l'accueil, utilisateur, déconnexion. */
  mountBar(title) {
    const bar = document.createElement('div');
    bar.className = 'appbar';
    bar.innerHTML = `<a class="appbar-home" href="index.html" data-auth="home" title="Retour à l'accueil">‹ Accueil</a>
      <span class="appbar-title">${esc(title)}</span>
      <span class="appbar-slot" id="appbarSlot"></span>
      <span class="appbar-user" title="${esc(this.user ? this.user.email : '')}">${esc(this.name)}</span>
      <button type="button" class="appbar-out" data-auth="logout">Se déconnecter</button>`;
    document.body.prepend(bar);
    bar.querySelector('[data-auth=home]').addEventListener('click', e => { e.preventDefault(); this.leave('index.html'); });
    bar.querySelector('[data-auth=logout]').addEventListener('click', () => this.logout());
    return bar;
  },

  /* Messages d'erreur en français. */
  frError(e) {
    const m = (e && (e.message || e.error_description)) || '';
    const code = e && e.code;
    if (code === 'invalid_credentials' || /invalid login credentials/i.test(m)) return 'Identifiant ou mot de passe incorrect.';
    if (code === 'email_not_confirmed') return "Ce compte n'est pas encore confirmé.";
    if (code === 'user_banned') return 'Ce compte est suspendu.';
    if ((e && e.status === 429) || /rate limit|too many/i.test(m)) return 'Trop de tentatives : patientez quelques minutes avant de réessayer.';
    if (code === 'mfa_verification_failed' || /invalid totp|invalid code|expired/i.test(m)) return 'Code incorrect ou expiré : saisissez le code affiché en ce moment dans votre application.';
    if (code === 'weak_password' || /password should/i.test(m)) return 'Mot de passe trop faible : 12 caractères au moins, mélangeant lettres, chiffres et symboles.';
    if (code === 'same_password') return "Le nouveau mot de passe doit être différent de l'ancien.";
    if (code === 'reauthentication_needed') return 'Reconnectez-vous, puis changez le mot de passe juste après.';
    if (/fetch|network|failed|load/i.test(m) || (e && e.status === 0)) return 'Serveur injoignable : vérifiez la connexion Internet.';
    return 'Erreur : ' + m;
  }
};
let loggingOut = false;
window.Auth = Auth;
})();
