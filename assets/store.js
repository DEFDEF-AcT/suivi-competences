/* Stockage des évaluations (ISMI ou BTS) dans la base sécurisée.
   Offre à l'application la même interface que la première mouture (window.claude.use('db')) :
   documents « collection/identifiant », requêtes where('classId', '==', …), abonnements onSnapshot.
   - Après connexion, les données de la formation sont chargées en mémoire (rien n'est conservé sur l'appareil).
   - Chaque modification est envoyée tout de suite ; la promesse renvoyée échoue si le serveur refuse,
     ce qui déclenche l'indicateur « Non enregistré · Réessayer » de l'application.
   - Les modifications faites sur un autre appareil arrivent en direct. */
(() => {
'use strict';
const CFG = window.EVAL_CONFIG;
const APP = CFG.app;
const Auth = window.Auth;
const sb = Auth.client;
const CLIENT_ID = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

let store = new Map();            // « coll/id » → données
const listeners = new Set();
const busy = new Map();           // chemins en cours d'envoi
const failed = new Set();         // chemins dont le dernier envoi a échoué
let inflight = 0, me = null, names = null;

const clone = o => o == null ? o : JSON.parse(JSON.stringify(o));
const split = path => { const i = path.indexOf('/'); return { coll: path.slice(0, i), id: path.slice(i + 1) }; };
const isDirty = p => busy.has(p) || failed.has(p);
function merge(t, s) {
  Object.keys(s).forEach(k => {
    const v = s[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && t[k] && typeof t[k] === 'object' && !Array.isArray(t[k])) merge(t[k], v);
    else t[k] = clone(v);
  });
  return t;
}
function snapOf(path, d) {
  return { id: split(path).id, exists: d !== undefined && d !== null, data: () => (d == null ? undefined : clone(d)), metadata: { fromCache: false, hasPendingWrites: isDirty(path) } };
}
const snap = path => snapOf(path, store.get(path));
let nt = 0;
function notify() {
  if (nt) return;
  nt = setTimeout(() => { nt = 0; listeners.forEach(l => { try { l(); } catch (e) { console.error(e); } }); }, 0);
}
function say(msg) {
  const t = document.getElementById('toast'); if (!t) return;
  t.textContent = msg; t.hidden = false; clearTimeout(say.t); say.t = setTimeout(() => { t.hidden = true; }, 5000);
}

/* Codes d'erreur compris par l'application d'origine. */
function mapErr(e) {
  if (e && e.__mapped) return e;
  const c = (e && e.code) || '';
  const m = (e && e.message) || String(e || '');
  const out = code => ({ code, message: m, __mapped: true });
  if (c === '42501' || /row-level security|permission denied/i.test(m)) { Auth.verify(); return out('not_granted'); }
  if (/^PGRST30/.test(c) || /jwt/i.test(m)) { Auth.verify(); return out('unavailable'); }
  if (c === '53100' || c === '54000') return out('quota_exceeded');
  if (!c || /fetch|network|timeout|failed|load/i.test(m)) return out('unavailable');
  return out('unknown');
}
function track(path, run) {
  inflight++; busy.set(path, (busy.get(path) || 0) + 1);
  return Promise.resolve().then(run)
    .then(res => { if (res && res.error) throw res.error; failed.delete(path); })
    .catch(e => { failed.add(path); throw mapErr(e); })
    .finally(() => { inflight--; const n = busy.get(path) - 1; if (n > 0) busy.set(path, n); else busy.delete(path); });
}

/* ---------- Documents ---------- */
function docRef(path) {
  const { coll, id } = split(path);
  return {
    path, id,
    get(opts) {
      if (!(opts && opts.source === 'server')) return Promise.resolve(snap(path));
      return sb.from('docs').select('data').eq('app', APP).eq('coll', coll).eq('id', id).maybeSingle().then(r => {
        if (r.error) throw mapErr(r.error);
        const d = r.data ? r.data.data : undefined;
        if (!isDirty(path)) { if (d === undefined) store.delete(path); else store.set(path, d); }
        return snapOf(path, d);
      });
    },
    set(d) {
      store.set(path, clone(d)); notify();
      return track(path, () => sb.from('docs').upsert({ app: APP, coll, id, data: d, client_id: CLIENT_ID }));
    },
    update(d) {
      const cur = store.get(path);
      if (!cur) return Promise.reject({ code: 'invalid_argument', message: 'Document absent' });
      merge(cur, clone(d)); notify();
      return track(path, () => sb.rpc('doc_merge', { p_app: APP, p_coll: coll, p_id: id, p_patch: d, p_client: CLIENT_ID }));
    },
    delete() {
      store.delete(path); notify();
      return track(path, () => sb.from('docs').delete().eq('app', APP).eq('coll', coll).eq('id', id));
    },
    onSnapshot(next) { const l = () => next(snap(path)); listeners.add(l); setTimeout(l, 0); return () => listeners.delete(l); }
  };
}
function query(coll, filters) {
  function run() {
    const docs = [];
    store.forEach((v, k) => {
      if (k.indexOf(coll + '/') !== 0) return;
      if (filters.every(f => v[f[0]] === f[2])) docs.push(snap(k));
    });
    docs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } };
  }
  return {
    where(f, op, v) { return query(coll, filters.concat([[f, op, v]])); },
    orderBy() { return this; }, limit() { return this; },
    get() { return Promise.resolve(run()); },
    onSnapshot(next) { const l = () => next(run()); listeners.add(l); setTimeout(l, 0); return () => listeners.delete(l); },
    doc(id) { return docRef(coll + '/' + (id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)))); },
    add(d) { const r = this.doc(); return r.set(d).then(() => r); }
  };
}
/* Suppression groupée (classe, évaluation, étudiant et leurs résultats) : quelques requêtes au lieu de centaines. */
async function deleteMany(paths) {
  paths.forEach(p => store.delete(p)); notify();
  const by = new Map();
  paths.forEach(p => { const { coll, id } = split(p); if (!by.has(coll)) by.set(coll, []); by.get(coll).push(id); });
  for (const [coll, ids] of by) {
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      await track(coll + '/*', () => sb.from('docs').delete().eq('app', APP).eq('coll', coll).in('id', chunk));
    }
  }
}
async function ping() {
  const { error } = await sb.from('docs').select('id').eq('app', APP).limit(1);
  return !error;
}
const db = { doc: docRef, collection: c => query(c, []), deleteMany, ping, reload: () => reload().catch(() => {}) };

/* ---------- Chargement et direct ---------- */
async function fetchAll() {
  const out = [], size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await sb.from('docs').select('coll,id,data').eq('app', APP)
      .order('coll').order('id').range(from, from + size - 1);
    if (error) throw mapErr(error);
    out.push(...data);
    if (data.length < size) break;
  }
  return out;
}
async function reload() {
  const rows = await fetchAll();
  const next = new Map(rows.map(r => [r.coll + '/' + r.id, r.data]));
  [...busy.keys(), ...failed].forEach(k => { if (store.has(k)) next.set(k, store.get(k)); else next.delete(k); });
  store = next; notify();
}
let everUp = false, broken = false;
function subscribe() {
  sb.channel('docs-' + APP + '-' + CLIENT_ID.slice(0, 8))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, p => {
      if (p.eventType === 'DELETE') {
        const o = p.old || {}; if (o.app !== APP) return;
        const k = o.coll + '/' + o.id; if (!isDirty(k) && store.delete(k)) notify();
        return;
      }
      const n = p.new || {}; if (n.app !== APP || n.client_id === CLIENT_ID) return;
      const k = n.coll + '/' + n.id; if (isDirty(k)) return;
      store.set(k, n.data); notify();
    })
    .subscribe(status => {
      if (status === 'SUBSCRIBED') { if (everUp && broken) reload().catch(() => {}); everUp = true; broken = false; }
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') broken = true;
    });
  // Téléphone ou tablette en veille : on resynchronise au retour.
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > 120000) reload().catch(() => {});
  });
}

/* ---------- Utilisateur et téléchargements ---------- */
const user = {
  id: () => Promise.resolve(me),
  can: () => Promise.resolve(true),
  async names() {
    if (!names) { const { data } = await sb.rpc('member_names'); names = Object.fromEntries((data || []).map(m => [m.user_id, m.display_name])); }
    return names;
  },
  async profiles(ids) {
    const n = await this.names();
    const out = {}; ids.forEach(id => { out[id] = { name: n[id] || '', isMe: id === me }; }); return out;
  }
};
const downloads = {
  save(o) {
    return new Promise(res => {
      const blob = o.data instanceof Blob ? o.data : new Blob([o.data]);
      const url = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href = url; a.download = o.filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000); res({ status: 'saved' });
    });
  }
};

/* ---------- Copie de sécurité (.json, même format que la première mouture) ---------- */
const stamp = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
function exportBackup() {
  const data = Object.fromEntries([...store.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
  const json = JSON.stringify({ app: 'evaluations-' + APP, version: 1, savedAt: new Date().toISOString(), data }, null, 1);
  const name = 'evaluations_' + APP + '_' + stamp() + '.json';
  downloads.save({ filename: name, data: new Blob([json], { type: 'application/json' }) });
  say('Copie téléchargée : ' + name + '. Rangez-la dans un dossier sûr.');
}
async function importBackup(txt) {
  let o; try { o = JSON.parse(txt); } catch (e) { say("Ce fichier n'est pas une sauvegarde valide."); return; }
  if (!o || o.app !== 'evaluations-' + APP || !o.data || typeof o.data !== 'object') { say("Ce fichier n'est pas une sauvegarde des " + CFG.name + '.'); return; }
  const entries = Object.entries(o.data).filter(([k, v]) => /^[a-z]{1,40}\/[^]{1,200}$/.test(k) && v && typeof v === 'object');
  const when = o.savedAt ? new Date(o.savedAt).toLocaleString('fr-FR') : '?';
  if (!confirm('Remplacer toutes les données « ' + CFG.name + ' » par celles du fichier (' + entries.length + ' éléments, enregistré le ' + when + ') ?\n\nLes données actuelles restent récupérables dans l\'historique de la base.')) return;
  say('Restauration en cours…');
  const keep = new Set(entries.map(e => e[0]));
  const rows = entries.map(([k, v]) => { const { coll, id } = split(k); return { app: APP, coll, id, data: v, client_id: CLIENT_ID }; });
  try {
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      await track('import/*', () => sb.from('docs').upsert(chunk));
    }
    const gone = [...store.keys()].filter(k => !keep.has(k));
    if (gone.length) await deleteMany(gone);
    await reload();
    say('Sauvegarde restaurée : ' + entries.length + ' éléments.');
  } catch (e) { say('Restauration interrompue (' + (e.message || e.code) + ') : réessayez.'); }
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-local]'); if (!b) return;
  const a = b.getAttribute('data-local');
  if (a === 'download') exportBackup();
  else if (a === 'open') {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) f.text().then(importBackup); };
    inp.click();
  }
});
window.addEventListener('beforeunload', e => { if (inflight > 0 || failed.size) { e.preventDefault(); e.returnValue = ''; } });

/* ---------- Démarrage ---------- */
const ready = (async () => {
  const s = await Auth.requireSession({ app: APP });
  me = s.user.id;
  window.APP_ROLE = { role: s.role, me };
  Auth.mountBar(CFG.name);
  Auth.onBeforeLeave(() => (window.EvalApp ? window.EvalApp.flush() : true));
  try { await reload(); } catch (e) { console.error(e); return null; }
  subscribe();
  return { db, user, downloads };
})();
window.claude = { use: n => ready.then(api => (api ? api[n] || null : null)) };
})();
