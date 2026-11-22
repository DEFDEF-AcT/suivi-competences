/* Évaluations par compétences — moteur commun ISMI et BTS MV.
   Issu de la première mouture « Évaluations ISMI » ; le référentiel et les réglages propres à chaque
   formation sont dans assets/ref-ismi.js et assets/ref-bts.js ; les données passent par assets/store.js. */
(() => {
'use strict';

/* ---------- Référentiel et réglages (assets/ref-ismi.js ou assets/ref-bts.js) ---------- */
const CFG = window.EVAL_CONFIG;
const REF = CFG.ref;
const UNITS = Object.keys(REF).map(Number);
const DEFAULT_UNIT = CFG.defaultUnit;
const UNIT = CFG.unitLabel;
const W = CFG.words;
let COMPS = REF[DEFAULT_UNIT].comps, ACTS = REF[DEFAULT_UNIT].acts;
const COMP = Object.fromEntries(UNITS.flatMap(u => REF[u].comps).map(c => [c.code, c]));
const ACT = Object.fromEntries(UNITS.flatMap(u => REF[u].acts).map(a => [a.code, a]));
const LEVELS = ['MI','MF','MS','TBM'];
const LEVEL_NAME = {MI:'Maîtrise insuffisante', MF:'Maîtrise fragile', MS:'Maîtrise satisfaisante', TBM:'Très bonne maîtrise'};
const LEVEL_DESC = CFG.levelDesc || {};
const DEFAULT_POINTS = CFG.defaultPoints;
const TYPES = CFG.types;
const STATUSES = CFG.statuses;
const UNGRADED = CFG.ungraded || [];
const unitOf = ev => (ev && REF[ev.bloc]) ? ev.bloc : DEFAULT_UNIT;
const actOf = c => c.act;
const LSK = k => CFG.app + '-eval-' + k;

/* ---------- Outils ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clone = o => o == null ? o : JSON.parse(JSON.stringify(o));
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const LS = {
  get(k){ try { return localStorage.getItem(k); } catch(e){ return null; } },
  set(k, v){ try { localStorage.setItem(k, v); } catch(e){} }
};
function deepMerge(t, s){
  for (const k of Object.keys(s)){
    const v = s[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && t[k] && typeof t[k] === 'object' && !Array.isArray(t[k])) deepMerge(t[k], v);
    else t[k] = clone(v);
  }
  return t;
}
const fmtNote = n => n == null ? '—' : n.toLocaleString('fr-FR', {minimumFractionDigits:1, maximumFractionDigits:1});
const fmtDate = d => { if (!d) return '—'; const x = new Date(d + 'T12:00:00'); return isNaN(x) ? d : x.toLocaleDateString('fr-FR', {day:'2-digit', month:'short', year:'numeric'}); };
const fmtHour = iso => { const d = new Date(iso); if (isNaN(d)) return ''; return String(d.getHours()).padStart(2,'0') + 'h' + String(d.getMinutes()).padStart(2,'0'); };
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };
const fullName = s => s ? (s.nom || '') + ' ' + (s.prenom || '') : '';
const cmpFr = (a, b) => String(a).localeCompare(String(b), 'fr', {sensitivity:'base'});

/* ---------- État ---------- */
const S = {
  phase:'connecting', bloc:(() => { const v = Number(LS.get(LSK('bloc'))); return REF[v] ? v : DEFAULT_UNIT; })(), db:null, user:null, dl:null, me:null, canWrite:true,
  classes:[], classesLoaded:false, classId:null, config:{points:{...DEFAULT_POINTS}},
  students:[], evals:[], results:new Map(), loaded:{students:false, evals:false, results:false},
  unsubClass:[], route:{view:'evaluations', id:null}, builtKey:'', panel:null, editing:null, slow:false,
  pending:0, lastSaved:null, failed:[]
};
const main = $('#main');

const points = () => ({...DEFAULT_POINTS, ...(S.config.points || {})});
const evById = id => S.evals.find(e => e.id === id);
const stById = id => S.students.find(s => s.id === id);
const resFor = (evId, sid) => S.results.get(evId + '_' + sid);
const sortedStudents = () => S.students.slice().sort((a, b) => cmpFr(a.nom, b.nom) || cmpFr(a.prenom, b.prenom));
const blocEvals = () => S.evals.filter(e => unitOf(e) === S.bloc);
const sortedEvals = (dir = 'desc') => blocEvals().sort((a, b) => {
  const k = String(a.date || '').localeCompare(String(b.date || '')) || String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  return dir === 'desc' ? -k : k;
});

function evalLines(ev){
  const lines = (ev.comps || []).filter(c => COMP[c.code]).map(c => ({
    key:c.code, code:c.code, short:COMP[c.code].short, crit:COMP[c.code].crit, weight:UNGRADED.includes(c.status) ? 0 : num(c.weight, 1), status:c.status || ''
  }));
  if (ev.transverse && ev.transverse.label) lines.push({key:'TR', code:'Transverse', short:ev.transverse.label, crit:'Objectif transverse', weight:num(ev.transverse.weight, 1), status:'Objectif transverse'});
  return lines;
}
function calcNote(ev, r){
  if (!r || r.absent) return null;
  const p = points(); let sum = 0, w = 0;
  for (const l of evalLines(ev)){
    const lv = r.levels && r.levels[l.key];
    if (lv && p[lv] != null && l.weight > 0){ sum += p[lv] * l.weight; w += l.weight; }
  }
  return w ? sum / w : null;
}
function finalNote(ev, r){
  if (!r || r.absent) return null;
  if (typeof r.override === 'number') return r.override;
  return calcNote(ev, r);
}
function isDone(ev, r){
  if (!r) return false;
  if (r.absent) return true;
  return evalLines(ev).every(l => r.levels && r.levels[l.key]);
}
function evStats(ev){
  const st = S.students; let done = 0, val = 0; const notes = [];
  for (const s of st){ const r = resFor(ev.id, s.id); if (isDone(ev, r)) done++; if (r && r.validated && r.validated.at) val++; const n = finalNote(ev, r); if (n != null) notes.push(n); }
  const avg = notes.length ? notes.reduce((a, b) => a + b, 0) / notes.length : null;
  return {done, validated:val, total:st.length, avg, min:notes.length ? Math.min(...notes) : null, max:notes.length ? Math.max(...notes) : null};
}
function studentAvg(sid){
  const ns = blocEvals().map(ev => finalNote(ev, resFor(ev.id, sid))).filter(n => n != null);
  return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : null;
}
function compHistory(sid, code){
  const out = [];
  for (const ev of sortedEvals('asc')){
    if (!(ev.comps || []).some(c => c.code === code)) continue;
    const r = resFor(ev.id, sid); const lv = r && !r.absent && r.levels && r.levels[code];
    if (lv) out.push({ev, lv});
  }
  return out;
}
const lvChip = (lv, title) => lv ? `<span class="lv lv-${lv}"${title ? ` title="${esc(title)}"` : ''}>${lv}</span>` : `<span class="lv lv-none">—</span>`;

/* ---------- Analyse de l'acquisition ---------- */
const seuilLevel = () => LEVELS.includes(S.config.seuil) ? S.config.seuil : 'MS';
const usedComps = () => COMPS.filter(c => blocEvals().some(ev => (ev.comps || []).some(x => x.code === c.code)));
const lvNum = lv => LEVELS.indexOf(lv) + 1;
const fmtDateShort = d => { const x = new Date((d || '') + 'T12:00:00'); return isNaN(x) ? '' : x.toLocaleDateString('fr-FR', {day:'2-digit', month:'2-digit'}); };
function acquisition(sid){
  const si = LEVELS.indexOf(seuilLevel()); const counts = {MI:0, MF:0, MS:0, TBM:0}; let evaluated = 0, acquired = 0;
  for (const c of usedComps()){
    const h = compHistory(sid, c.code); if (!h.length) continue;
    const lv = h[h.length - 1].lv; counts[lv]++; evaluated++; if (LEVELS.indexOf(lv) >= si) acquired++;
  }
  return {counts, evaluated, acquired};
}
function classAvgLevel(code){
  const v = S.students.map(s => { const h = compHistory(s.id, code); return h.length ? lvNum(h[h.length - 1].lv) : null; }).filter(x => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
function acqCell(sid){
  const a = acquisition(sid); if (!a.evaluated) return `<span class="muted small">—</span>`;
  const tip = LEVELS.map(k => k + ' : ' + a.counts[k]).join(' · ') + `\n${a.acquired} compétence${a.acquired > 1 ? 's' : ''} acquise${a.acquired > 1 ? 's' : ''} sur ${a.evaluated} évaluée${a.evaluated > 1 ? 's' : ''}`;
  return `<div class="acqcell" data-tip="${esc(tip)}"><div class="seg-bar">${LEVELS.filter(k => a.counts[k]).map(k => `<i class="f-${k}" style="flex:${a.counts[k]}"></i>`).join('')}</div><span>${a.acquired} / ${a.evaluated}</span></div>`;
}
const acqLegend = () => `<div class="legend">${LEVELS.map(k => `<span><i class="sw f-${k}"></i>${k}</span>`).join('')}<span>Acquisition : compétences au niveau ${seuilLevel()} ou plus, au dernier positionnement</span></div>`;
const trackPos = v => `calc(${v * 25}% + ${(v / 2 - 2).toFixed(1)}px)`;
function sparkSVG(h){
  const W = 132, H = 38, m = 6, n = h.length, si = lvNum(seuilLevel());
  const x = i => n === 1 ? W / 2 : m + i * (W - 2 * m) / (n - 1), y = l => m + (4 - l) / 3 * (H - 2 * m);
  const L = h.map(z => lvNum(z.lv)); let g = '';
  for (let l = 1; l <= 4; l++) g += `<line class="${l === si ? 'ch-seuil' : 'ch-grid'}" x1="0" x2="${W}" y1="${y(l)}" y2="${y(l)}"/>`;
  if (n > 1) g += `<path class="ch-l1" d="${L.map((l, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(l).toFixed(1)).join('')}"/>`;
  h.forEach((z, i) => { g += `<circle class="ch-d1" cx="${x(i).toFixed(1)}" cy="${y(L[i]).toFixed(1)}" r="${i === n - 1 ? 4.5 : 3.5}"/><circle class="ch-hit" cx="${x(i).toFixed(1)}" cy="${y(L[i]).toFixed(1)}" r="11" data-tip="${esc(z.ev.title + '\n' + fmtDate(z.ev.date) + ' : ' + z.lv)}"/>`; });
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc('Évolution : ' + h.map(z => z.lv).join(', '))}">${g}</svg>`;
}
function wrapWords(t, max, nLines){
  const words = String(t).split(/\s+/); const out = []; let cur = '';
  for (const w of words){
    if (!cur) cur = w; else if ((cur + ' ' + w).length <= max) cur += ' ' + w; else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  if (out.length > nLines){ const keep = out.slice(0, nLines); keep[nLines - 1] = keep[nLines - 1].slice(0, max - 1) + '…'; return keep; }
  return out;
}
function radarSVG(Wc, items, sl, who, actAvg){
  const W = Math.max(320, Math.min(680, Math.floor(Wc || 520)));
  const R = Math.max(80, Math.min(W / 2 - 140, 190)), Rb = R + 16, H = Math.round(2 * R + 176);
  const cx = W / 2, cy = H / 2 + 2, n = items.length, step = 2 * Math.PI / n, wrapN = W < 460 ? 13 : n > 10 ? 16 : 18;
  const ang = i => -Math.PI / 2 + step * i;
  const at = (a, r) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  const pt = (i, v) => at(ang(i), R * v / 4);
  const f = p => p[0].toFixed(1) + ',' + p[1].toFixed(1);
  const ringPts = v => items.map((_, i) => f(pt(i, v)));
  const mid = (i, j) => { const a = pt(i, 4), b = pt(j, 4); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
  const groups = [];
  items.forEach((it, i) => { const last = groups[groups.length - 1]; if (last && last.act === it.act) last.end = i; else groups.push({act:it.act, start:i, end:i}); });
  let g = '', defs = '';
  // Secteurs des compétences (activités 3-A1 à 3-A4)
  groups.forEach((gr, k) => {
    const p = [f([cx, cy]), f(mid((gr.start - 1 + n) % n, gr.start))];
    for (let i = gr.start; i <= gr.end; i++) p.push(f(pt(i, 4)));
    p.push(f(mid(gr.end, (gr.end + 1) % n)));
    g += `<polygon class="rd-sector${k % 2 ? ' odd' : ''}" points="${p.join(' ')}"/>`;
  });
  g += `<path class="rd-zone" fill-rule="evenodd" d="M${ringPts(4).join('L')}Z M${ringPts(sl).join('L')}Z"/>`;
  for (let l = 1; l <= 4; l++) g += `<polygon class="${l === sl ? 'rd-seuil' : 'rd-ring'}" points="${ringPts(l).join(' ')}"/>`;
  items.forEach((_, i) => { const p = pt(i, 4); g += `<line class="rd-axis" x1="${cx}" y1="${cy}" x2="${p[0].toFixed(1)}" y2="${p[1].toFixed(1)}"/>`; });
  groups.forEach(gr => { const m = mid((gr.start - 1 + n) % n, gr.start); g += `<line class="rd-sep" x1="${cx}" y1="${cy}" x2="${m[0].toFixed(1)}" y2="${m[1].toFixed(1)}"/>`; });
  for (let l = 1; l <= 4; l++) g += `<text class="rd-lv" x="${(cx + 5).toFixed(1)}" y="${(cy - R * l / 4 + 11).toFixed(1)}">${LEVELS[l - 1]}</text>`;
  // Bandeau des compétences autour de la toile
  groups.forEach((gr, k) => {
    const gap = 2.5 / Rb, a0 = ang(gr.start) - step / 2 + gap, a1 = ang(gr.end) + step / 2 - gap, span = a1 - a0;
    const large = span > Math.PI ? 1 : 0, bottom = Math.sin((a0 + a1) / 2) > 0.2;
    const p0 = at(a0, Rb), p1 = at(a1, Rb);
    const d = bottom ? `M${f(p1)} A${Rb},${Rb} 0 ${large} 0 ${f(p0)}` : `M${f(p0)} A${Rb},${Rb} 0 ${large} 1 ${f(p1)}`;
    const A = ACT[gr.act] || {code:gr.act, band:'', name:''};
    const full = A.code + ' · ' + A.band; const txt = full.length * 6.4 < span * Rb - 12 ? full : A.code;
    const av = actAvg[gr.act];
    const tip = `${A.code} — ${A.name}\n${who} : ${av == null ? W.none : 'niveau moyen ' + fmtNote(av) + ' sur 4 (≈ ' + LEVELS[Math.round(av) - 1] + ')'}`;
    defs += `<path id="rdArc${k}" d="${d}"/>`;
    g += `<g class="rd-act" data-tip="${esc(tip)}" tabindex="0"><path class="rd-band${k % 2 ? ' odd' : ''}" d="${d}"/><text class="rd-bandtxt" text-anchor="middle" dominant-baseline="central"><textPath href="#rdArc${k}" startOffset="50%">${esc(txt)}</textPath></text></g>`;
  });
  // Moyenne de la classe puis étudiant
  const polyOf = key => items.map((it, i) => f(pt(i, it[key] || 0))).join(' ');
  if (items.some(it => it.avg != null)){
    g += `<polygon class="rd-class" points="${polyOf('avg')}"/>`;
    items.forEach((it, i) => { if (it.avg != null){ const p = pt(i, it.avg); g += `<circle class="ch-d2" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5"/>`; } });
  }
  g += `<polygon class="rd-student" points="${polyOf('v')}"/>`;
  items.forEach((it, i) => { if (!it.v) return; const p = pt(i, it.v); g += `<circle class="ch-d1" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="5"/>`; });
  // Libellés des sous-compétences
  items.forEach((it, i) => {
    const a = ang(i), c = Math.cos(a), s = Math.sin(a); const [x, y] = at(a, R + 36);
    const anc = c > 0.3 ? 'start' : c < -0.3 ? 'end' : 'middle';
    const lines = wrapWords(it.short, wrapN, 2); const h = 13 * (1 + lines.length);
    const y0 = s < -0.3 ? y - h + 10 : s > 0.3 ? y + 10 : y - h / 2 + 10;
    const state = it.na ? 'non évaluée dans la classe' : it.lv ? it.lv + (it.title ? ' (' + it.title + ')' : '') : 'pas encore positionné';
    const tip = `${it.code} — ${it.short}\n${who} : ${state}\nMoyenne de la classe : ${it.avg == null ? '—' : fmtNote(it.avg) + ' sur 4'}`;
    g += `<g class="rd-label" data-tip="${esc(tip)}" tabindex="0"><text x="${x.toFixed(1)}" y="${y0.toFixed(1)}" text-anchor="${anc}"><tspan class="rd-code${it.na ? ' na' : ''}" x="${x.toFixed(1)}">${it.code}</tspan>${lines.map(t => `<tspan class="rd-short${it.na ? ' na' : ''}" x="${x.toFixed(1)}" dy="13">${esc(t)}</tspan>`).join('')}</text></g>`;
    if (it.v){ const p = pt(i, it.v); g += `<circle class="ch-hit" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="12" data-tip="${esc(tip)}"/>`; }
  });
  const aria = 'Toile d\'araignée des compétences du ' + UNIT.toLowerCase() + ' ' + S.bloc + ' : ' + items.map(it => it.code + ' ' + (it.na ? 'non évaluée' : it.lv || 'non positionné')).join(', ');
  return `<svg class="chart radar" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(aria)}"><defs>${defs}</defs>${g}</svg>`;
}

/* ---------- Toast, modale, confirmation ---------- */
let toastT;
function toast(msg){ const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 4200); }
let modalCleanup = null;
function openModal(html, opts = {}){
  const m = $('#modal'); m.className = 'modal' + (opts.small ? ' small' : ''); m.innerHTML = html;
  $('#overlay').hidden = false;
  modalCleanup = opts.onClose || null;
  const f = m.querySelector('[autofocus], input, select, textarea, button'); if (f) f.focus();
  return m;
}
function closeModal(){ $('#overlay').hidden = true; $('#modal').innerHTML = ''; if (modalCleanup){ const c = modalCleanup; modalCleanup = null; c(); } }
$('#overlay').addEventListener('mousedown', e => { if (e.target.id === 'overlay') closeModal(); });
function confirmBox(title, text, okLabel = 'Supprimer'){
  return new Promise(resolve => {
    let answered = false;
    const h = e => {
      const a = e.target.closest('[data-a]'); if (!a) return;
      answered = true; resolve(a.dataset.a === 'yes'); closeModal();
    };
    const m = openModal(`<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="formactions"><button class="btn" data-a="no">Annuler</button><button class="btn btn-primary" data-a="yes" style="background:var(--danger);border-color:var(--danger);color:#fff">${esc(okLabel)}</button></div>`, {small:true, onClose:() => { $('#modal').removeEventListener('click', h); if (!answered) resolve(false); }});
    m.querySelector('[data-a=no]').focus();
    m.addEventListener('click', h);
  });
}

/* ---------- Écritures (une à la fois par document) ---------- */
const queues = new Map();
function queue(path, fn){
  const prev = queues.get(path) || Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  queues.set(path, next);
  S.pending++; renderSaveState();
  next.then(() => { S.lastSaved = new Date(); })
    .catch(e => { S.failed.push({path, fn}); onWriteError(e); })
    .finally(() => { S.pending--; if (queues.get(path) === next) queues.delete(path); renderSaveState(); });
  return next;
}
function saveStateInfo(){
  if (S.failed.length) return {cls:'err', txt:'Non enregistré'};
  if (S.pending > 0) return {cls:'busy', txt:'Enregistrement…'};
  if (S.lastSaved) return {cls:'ok', txt:'Enregistré à ' + fmtHour(S.lastSaved.toISOString())};
  return {cls:'', txt:'Enregistrement automatique'};
}
function renderSaveState(){
  const st = saveStateInfo();
  document.querySelectorAll('.savestate').forEach(el => {
    el.className = 'savestate ' + st.cls; el.querySelector('span').textContent = st.txt;
    const b = el.querySelector('button'); if (b) b.hidden = !S.failed.length;
  });
}
const SAVESTATE = `<div class="savestate" role="status" aria-live="polite"><i aria-hidden="true"></i><span>Enregistrement automatique</span><button type="button" class="linkbtn" data-act="retry-save" hidden>Réessayer</button></div>`;
function panelLocked(){
  if (!S.panel) return false;
  const r = resFor(S.panel.evId, S.panel.sid); return !!(r && r.validated && r.validated.at);
}
async function validateCurrent(goNext){
  const ev = evById(S.panel.evId), sid = S.panel.sid; if (!ev || !S.canWrite) return;
  flushTexts();
  await Promise.allSettled([...queues.values()]);
  if (S.failed.length){ toast("Des saisies n'ont pas pu être enregistrées : cliquez sur « Réessayer » puis validez de nouveau."); return; }
  const at = new Date().toISOString();
  try { await saveResult(ev, sid, {validated:{at, ...(S.me ? {by:S.me} : {})}}); } catch(e){ return; }
  let ok = false;
  try { const snap = await S.db.doc('results/' + ev.id + '_' + sid).get({source:'server'}); const d = snap.exists ? snap.data() : null; ok = !!(d && d.validated && d.validated.at === at); } catch(e){}
  toast(ok ? 'Positionnement enregistré et validé' : "Validation envoyée, mais la relecture ne l'a pas confirmée. Vérifiez la connexion.");
  if (ok && goNext && S.panel){ const studs = sortedStudents(); const i = studs.findIndex(x => x.id === sid); if (studs[i + 1]) openPanel(ev.id, studs[i + 1].id); }
}
async function flushAll(){
  flushTexts();
  if (S.failed.length){ const f = S.failed; S.failed = []; renderSaveState(); f.forEach(x => queue(x.path, x.fn)); }
  await Promise.allSettled([...queues.values()]);
  return !S.failed.length;
}
async function saveNow(){
  if (!S.db){ toast('La base de données n\'est pas encore connectée.'); return; }
  const ok = await flushAll();
  if (!ok){ toast("Certaines saisies n'ont pas pu être enregistrées. Vérifiez la connexion, puis cliquez de nouveau sur « Enregistrer »."); return; }
  const n = S.db.ping ? await S.db.ping() : true;
  toast(n ? 'Tout est enregistré dans la base sécurisée' + (S.lastSaved ? ' (dernier envoi à ' + fmtHour(S.lastSaved.toISOString()) + ').' : '.') : "Le serveur ne répond pas : vos dernières saisies sont gardées sur cette page, réessayez dans un instant.");
}
window.EvalApp = {flush:flushAll, busy:() => S.pending > 0 || S.failed.length > 0 || Object.keys(textTimers).length > 0};
async function retry(fn){
  try { return await fn(); }
  catch(e){ if (e && e.code === 'unavailable'){ await sleep(400 + Math.random() * 700); return fn(); } throw e; }
}
function onWriteError(e){
  console.error(e);
  const c = e && e.code;
  if (c === 'invalid_argument' || c === 'not_granted'){ S.canWrite = false; S.builtKey = ''; render(); toast("Enregistrement refusé : ce compte peut consulter mais pas modifier ces évaluations."); }
  else if (c === 'quota_exceeded') toast("Stockage plein : supprimez d'anciennes évaluations pour pouvoir en enregistrer de nouvelles.");
  else if (c === 'resource_exhausted') toast("Trop d'enregistrements en même temps : attendez quelques secondes puis recommencez.");
  else toast("Enregistrement impossible pour l'instant. Vérifiez la connexion puis recommencez.");
}
const stamp = () => ({updatedAt:new Date().toISOString(), ...(S.me ? {updatedBy:S.me} : {})});
function saveResult(ev, sid, patch){
  if (!S.canWrite || !S.db) return;
  const rid = ev.id + '_' + sid;
  const base = {evalId:ev.id, studentId:sid, classId:ev.classId, levels:{}};
  S.results.set(rid, deepMerge(clone(S.results.get(rid)) || clone(base), patch));
  scheduleRender();
  const ref = S.db.doc('results/' + rid);
  return queue(ref.path, () => retry(async () => {
    const snap = await ref.get();
    const body = {...clone(patch), ...stamp()};
    if (snap.exists) await ref.update(body);
    else await ref.set(deepMerge(clone(base), body));
  }));
}
function setDoc(path, data){ return queue(path, () => retry(() => S.db.doc(path).set(data))); }
function updDoc(path, data){ return queue(path, () => retry(() => S.db.doc(path).update(data))); }
function delDoc(path){ return queue(path, () => retry(() => S.db.doc(path).delete())); }
async function delMany(paths){
  if (!paths.length) return;
  if (!S.db.deleteMany){ for (const p of paths) await delDoc(p); return; }
  S.pending++; renderSaveState();
  try { await retry(() => S.db.deleteMany(paths)); S.lastSaved = new Date(); }
  catch(e){ onWriteError(e); throw e; }
  finally { S.pending--; renderSaveState(); }
}

/* ---------- Abonnements ---------- */
function subscribeGlobal(){
  const timer = setTimeout(() => { if (!S.classesLoaded){ S.slow = true; renderBanner(); } }, 10000);
  S.db.collection('classes').onSnapshot(snap => {
    S.classes = snap.docs.map(d => ({id:d.id, ...d.data()})).sort((a, b) => cmpFr(a.name, b.name));
    if (!snap.metadata.fromCache){ S.classesLoaded = true; S.slow = false; clearTimeout(timer); }
    pickClass();
  }, err => { clearTimeout(timer); console.error(err); S.slow = true; renderBanner(); });
  S.db.doc('config/main').onSnapshot(snap => {
    S.config = snap.exists ? {points:{...DEFAULT_POINTS}, ...snap.data()} : {points:{...DEFAULT_POINTS}};
    scheduleRender();
  }, err => console.error(err));
}
function pickClass(){
  let id = S.classId;
  if (!id || !S.classes.some(c => c.id === id)){
    const saved = LS.get(LSK('class'));
    id = S.classes.some(c => c.id === saved) ? saved : (S.classes[0] && S.classes[0].id) || null;
  }
  if (id !== S.classId) setClass(id);
  else { S.phase = id ? 'ready' : (S.classesLoaded ? 'noclass' : 'connecting'); scheduleRender(); }
}
function setClass(id){
  S.unsubClass.forEach(u => { try { u(); } catch(e){} });
  S.unsubClass = []; S.classId = id; S.students = []; S.evals = []; S.results = new Map();
  S.loaded = {students:false, evals:false, results:false}; S.builtKey = ''; closePanel();
  if (id) LS.set(LSK('class'), id);
  S.phase = id ? 'ready' : (S.classesLoaded ? 'noclass' : 'connecting');
  if (id){
    const on = (name, coll, map) => S.unsubClass.push(S.db.collection(coll).where('classId', '==', id).onSnapshot(snap => {
      map(snap.docs); if (!snap.metadata.fromCache) S.loaded[name] = true; scheduleRender();
    }, err => { console.error(err); S.loaded[name] = true; toast("Une partie des données n'a pas pu être chargée. Rechargez la page."); scheduleRender(); }));
    on('students', 'students', docs => { S.students = docs.map(d => ({id:d.id, ...d.data()})); });
    on('evals', 'evaluations', docs => { S.evals = docs.map(d => ({id:d.id, ...d.data()})); });
    on('results', 'results', docs => { const m = new Map(); docs.forEach(d => m.set(d.id, d.data())); S.results = m; });
  }
  scheduleRender();
}

/* ---------- Bloc évalué (Bloc 1 / Bloc 3) ---------- */
function applyBloc(){
  COMPS = REF[S.bloc].comps; ACTS = REF[S.bloc].acts;
  $('#blocMark').textContent = CFG.unitMark + S.bloc; $('#blocSub').textContent = REF[S.bloc].label;
  document.querySelectorAll('.blocbtn').forEach(x => x.setAttribute('aria-pressed', String(+x.dataset.bloc === S.bloc)));
}
function setBloc(b, keepRoute){
  if (!REF[b] || b === S.bloc) return;
  S.bloc = b; LS.set(LSK('bloc'), String(b)); applyBloc(); closePanel(); S.builtKey = '';
  if (!keepRoute && S.route.view === 'eval') location.hash = '#evaluations';
  scheduleRender();
}

/* ---------- Rendu ---------- */
let raf = 0;
function scheduleRender(){ if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); }
function parseRoute(){
  const h = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (h.startsWith('eval-')) return {view:'eval', id:h.slice(5)};
  if (h.startsWith('etudiant-')) return {view:'etudiant', id:h.slice(9)};
  if (['etudiants','synthese','reglages'].includes(h)) return {view:h, id:null};
  return {view:'evaluations', id:null};
}
function render(){
  renderClassSelect(); renderTabs(); renderBanner(); renderMain();
  if (S.panel) updatePanel();
  renderSaveState();
}
function renderClassSelect(){
  const sel = $('#classSel'); if (document.activeElement === sel) return;
  if (!S.db || !S.classesLoaded && !S.classes.length){ sel.disabled = true; return; }
  sel.disabled = false;
  sel.innerHTML = S.classes.map(c => `<option value="${esc(c.id)}"${c.id === S.classId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')
    + (S.canWrite ? `<option value="__new">+ Nouvelle classe…</option>` : '');
  if (!S.classes.length) sel.value = '__new';
}
function renderTabs(){
  const v = S.route.view === 'eval' ? 'evaluations' : S.route.view === 'etudiant' ? 'etudiants' : S.route.view;
  document.querySelectorAll('#tabs a').forEach(a => { if (a.dataset.v === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
}
function renderBanner(){
  const b = $('#banner'); const parts = [];
  if (S.slow) parts.push(`<span>Les données ne répondent pas encore. Vérifiez la connexion ; la page se mettra à jour toute seule.</span>`);
  if (S.db && !S.canWrite) parts.push(`<span><b>Lecture seule.</b> Ce compte peut consulter les évaluations mais pas les modifier.</span>`);
  const ex = S.students.filter(s => s.example).length;
  if (ex && S.canWrite) parts.push(`<span><b>${ex} étudiants d'exemple</b> (nom EXEMPLE) servent à essayer la grille. Supprimez-les quand vous ajoutez vos étudiants.</span><button class="btn" data-act="del-examples">Supprimer les exemples</button>`);
  b.innerHTML = parts.join(''); b.hidden = !parts.length;
}

const VIEWS = {};
function renderMain(){
  if (S.phase === 'unavailable'){ if (S.builtKey !== 'unavail'){ S.builtKey = 'unavail'; main.innerHTML = `<div class="card empty"><h2>Les évaluations ne sont pas accessibles pour l'instant</h2><p>La connexion sécurisée à la base de données n'a pas abouti. Vérifiez la connexion Internet, puis rechargez la page.</p></div>`; } return; }
  if (S.phase === 'connecting' || (S.phase === 'ready' && !(S.loaded.students && S.loaded.evals && S.loaded.results) && !S.students.length && !S.evals.length)){
    if (S.builtKey !== 'connecting'){ S.builtKey = 'connecting'; main.innerHTML = `<div class="card empty"><h2>Connexion à vos évaluations…</h2><p>Les classes, les étudiants et les grilles s'affichent dès que les données répondent.</p></div>`; }
    return;
  }
  if (S.phase === 'noclass'){ if (S.builtKey !== 'noclass'){ S.builtKey = 'noclass'; main.innerHTML = buildNoClass(); } return; }
  const r = S.route; const view = VIEWS[r.view] || VIEWS.evaluations;
  const key = [r.view, r.id, S.classId, S.canWrite, S.bloc].join('|');
  const fk = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.fk : null;
  const gw = $('.tablewrap', main); const sl = gw ? gw.scrollLeft : 0;
  if (key !== S.builtKey){ S.builtKey = key; main.innerHTML = view.build(); }
  view.update();
  const gw2 = $('.tablewrap', main); if (gw2 && sl) gw2.scrollLeft = sl;
  if (fk){ const el = main.querySelector(`[data-fk="${CSS.escape(fk)}"]`); if (el && document.activeElement !== el) el.focus(); }
}
function buildNoClass(){
  if (!S.canWrite) return `<div class="card empty"><h2>Aucune classe pour l'instant</h2><p>Le propriétaire de l'application n'a pas encore créé de classe.</p></div>`;
  return `<div class="card empty"><span class="eyebrow">Premier pas</span><h2>Créez votre première classe</h2>
    <p>Une classe regroupe ses étudiants et ses évaluations. Vous pourrez en ajouter d'autres (${esc(CFG.classExamples)}) depuis le sélecteur en haut.</p>
    <form class="row" data-form="first-class"><label class="fld"><span>Nom de la classe</span><input id="firstClassName" type="text" value="${esc(CFG.defaultClassName)}" required></label><button class="btn btn-primary" type="submit">Créer la classe</button></form></div>`;
}

/* --- Vue : liste des évaluations --- */
VIEWS.evaluations = {
  build(){
    return `<div class="vhead"><div class="grow"><h1>Évaluations — ${UNIT} ${S.bloc}</h1><div class="meta" id="evCount"></div></div>
      <div class="actions">${S.canWrite ? `<button class="btn btn-primary" data-act="new-eval">+ Nouvelle évaluation</button>` : ''}</div></div>
      <div id="evHint"></div><div class="evlist" id="evList"></div>`;
  },
  update(){
    const evs = sortedEvals('desc');
    $('#evCount').textContent = `${evs.length} évaluation${evs.length > 1 ? 's' : ''} · ${S.students.length} étudiant${S.students.length > 1 ? 's' : ''}`;
    $('#evHint').innerHTML = !S.students.length ? `<div class="card pad" style="margin-bottom:12px"><b>Ajoutez d'abord vos étudiants.</b> <span class="muted">Collez la liste de la classe dans l'onglet</span> <a href="#etudiants">Étudiants</a><span class="muted">, puis ouvrez une évaluation pour remplir la grille.</span></div>` : '';
    if (!evs.length){
      $('#evList').innerHTML = `<div class="card empty"><h2>Aucune évaluation dans cette classe</h2><p>Créez un TP, un oral ou un cas pratique, choisissez les compétences du ${UNIT.toLowerCase()} ${S.bloc} évaluées (2 à 4 suffisent), puis positionnez chaque étudiant de MI à TBM.</p>${S.canWrite ? `<button class="btn btn-primary" data-act="new-eval">+ Nouvelle évaluation</button>` : ''}</div>`;
      return;
    }
    $('#evList').innerHTML = evs.map(ev => {
      const st = evStats(ev); const pct = st.total ? Math.round(st.done / st.total * 100) : 0;
      const chips = evalLines(ev).map(l => `<span class="chip code" title="${esc(l.short)}">${esc(l.key === 'TR' ? 'Transverse' : l.code)}</span>`).join('');
      return `<a class="card evrow" href="#eval-${esc(ev.id)}">
        <div class="evdate">${esc(fmtDate(ev.date))}</div>
        <div class="evmain"><div class="evtitle">${esc(ev.title)}</div><div class="evchips"><span class="chip type">${esc(ev.type || 'TP')}</span>${ev.code ? `<span class="chip">${esc(ev.code)}</span>` : ''}${chips}</div></div>
        <div class="evprog"><div class="prog">${st.done} / ${st.total} évalués · ${st.validated} validé${st.validated > 1 ? 's' : ''}</div><div class="bar"><i style="width:${pct}%"></i></div></div>
        <div class="avg"><span class="xs muted">Moyenne</span><br><strong>${fmtNote(st.avg)}</strong></div></a>`;
    }).join('');
  }
};

/* --- Vue : une évaluation (grille) --- */
VIEWS.eval = {
  build(){
    return `<div id="evHead"></div><div class="stats" id="evStats"></div><div class="tablewrap" id="evGrid"></div>
      <div class="legend" id="evLegend"></div>`;
  },
  update(){
    const ev = evById(S.route.id);
    if (ev && unitOf(ev) !== S.bloc){ setBloc(unitOf(ev), true); return; }
    if (!ev){ $('#evHead').innerHTML = `<a class="back" href="#evaluations">← Évaluations</a><div class="card empty"><h2>Évaluation introuvable</h2><p>Elle a peut-être été supprimée, ou elle appartient à une autre classe.</p></div>`; $('#evStats').innerHTML = ''; $('#evGrid').innerHTML = ''; $('#evGrid').style.display = 'none'; $('#evLegend').innerHTML = ''; return; }
    $('#evGrid').style.display = '';
    const lines = evalLines(ev); const st = evStats(ev);
    $('#evHead').innerHTML = `<a class="back" href="#evaluations">← Évaluations</a>
      <div class="vhead"><div class="grow"><span class="eyebrow">${esc(ev.type || 'TP')}${ev.code ? ' · ' + esc(ev.code) : ''}</span><h1>${esc(ev.title)}</h1>
      <div class="meta"><span>${esc(fmtDate(ev.date))}</span><span>${lines.length} ligne${lines.length > 1 ? 's' : ''} évaluée${lines.length > 1 ? 's' : ''}</span></div></div>
      <div class="actions">${S.canWrite ? `<button class="btn" data-act="edit-eval" data-id="${esc(ev.id)}">Modifier</button>` : ''}${S.dl ? `<button class="btn" data-act="export-eval" data-id="${esc(ev.id)}">Exporter (.xlsx)</button>` : ''}${S.canWrite ? `<button class="btn btn-danger" data-act="del-eval" data-id="${esc(ev.id)}">Supprimer</button>` : ''}</div></div>`;
    $('#evStats').innerHTML = `<div class="card stat"><span>Évalués</span><b>${st.done} / ${st.total}</b></div>
      <div class="card stat"><span>Validés</span><b>${st.validated} / ${st.total}</b></div>
      <div class="card stat"><span>Moyenne</span><b>${fmtNote(st.avg)}</b></div>
      <div class="card stat"><span>Min – max</span><b>${fmtNote(st.min)} – ${fmtNote(st.max)}</b></div>`;
    const studs = sortedStudents();
    if (!studs.length){ $('#evGrid').innerHTML = `<div class="empty"><h2>Aucun étudiant dans la classe</h2><p>Ajoutez-les dans l'onglet <a href="#etudiants">Étudiants</a> : ils apparaîtront ici, prêts à être positionnés.</p></div>`; $('#evLegend').innerHTML = ''; return; }
    const head = lines.map(l => {
      const cnt = {MI:0, MF:0, MS:0, TBM:0}; let tot = 0;
      for (const s of studs){ const r = resFor(ev.id, s.id); const lv = r && !r.absent && r.levels && r.levels[l.key]; if (lv && cnt[lv] != null){ cnt[lv]++; tot++; } }
      const dist = tot ? LEVELS.map(k => cnt[k] ? `<i class="d-${k}" style="width:${cnt[k] / tot * 100}%"></i>` : '').join('') : '';
      const tip = LEVELS.map(k => `${k} ${cnt[k]}`).join(' · ');
      return `<th class="comp" title="${esc(l.short)}${l.weight !== 1 ? ' — coef. ' + l.weight : ''}"><b>${esc(l.key === 'TR' ? 'Transv.' : l.code)}</b><span>${esc(l.short.length > 38 ? l.short.slice(0, 36) + '…' : l.short)}</span><div class="dist" title="${esc(tip)}">${dist}</div></th>`;
    }).join('');
    const dis = S.canWrite ? '' : ' disabled';
    const rows = studs.map(s => {
      const r = resFor(ev.id, s.id) || {}; const ab = !!r.absent; const val = !!(r.validated && r.validated.at);
      const cells = lines.map(l => {
        const v = (!ab && r.levels && r.levels[l.key]) || '';
        return `<td class="cell"><select class="lvsel${v ? ' lv-' + v : ''}" data-ev="${esc(ev.id)}" data-s="${esc(s.id)}" data-k="${esc(l.key)}" data-fk="${esc(s.id + '|' + l.key)}" aria-label="${esc(l.code + ' — ' + fullName(s))}"${ab || val ? ' disabled' : dis}>
          <option value="">${ab ? 'ABS' : '—'}</option>${LEVELS.map(k => `<option value="${k}"${v === k ? ' selected' : ''}>${k}</option>`).join('')}</select></td>`;
      }).join('');
      const n = finalNote(ev, r); const hasTxt = (r.comment || '').trim() || (r.oral || '').trim();
      return `<tr class="${ab ? 'absent' : ''}"><td class="stick"><button class="namebtn" data-act="open" data-ev="${esc(ev.id)}" data-s="${esc(s.id)}" data-fk="${esc('n|' + s.id)}">${esc(s.nom)} ${esc(s.prenom)}<small${val ? ' class="v"' : ''}>${val ? '✓ Validé' : ab ? 'Absent' : isDone(ev, r) ? 'Complet — à valider' : 'Ouvrir la fiche'}</small></button></td>${cells}
        <td class="num"><span class="note${typeof r.override === 'number' && !ab ? ' override' : ''}">${ab ? 'ABS' : fmtNote(n)}</span></td>
        <td class="ctr">${hasTxt ? `<span class="dot" title="Commentaire ou notes d'oral saisis"></span>` : ''}</td></tr>`;
    }).join('');
    $('#evGrid').innerHTML = `<table class="grid"><thead><tr><th class="stick">Étudiant</th>${head}<th class="num">Note /20</th><th class="ctr" title="Commentaire">Obs.</th></tr></thead><tbody>${rows}</tbody></table>`;
    const p = points();
    $('#evLegend').innerHTML = LEVELS.map(k => `<span>${lvChip(k)} ${LEVEL_NAME[k]} · ${p[k]} pts</span>`).join('') + `<span>Note = moyenne pondérée des points · * note retenue modifiée à la main</span>`;
  }
};

/* --- Vue : étudiants --- */
VIEWS.etudiants = {
  build(){
    const w = S.canWrite;
    return `<div class="vhead"><div class="grow"><h1>Étudiants</h1><div class="meta" id="stCount"></div></div></div>
      ${w ? `<div class="twocol" style="margin-bottom:18px">
        <form class="card pad form" data-form="add-student"><h2>Ajouter un étudiant</h2>
          <div class="row"><label class="fld"><span>Nom</span><input id="addNom" type="text" autocomplete="off" required></label><label class="fld"><span>Prénom</span><input id="addPrenom" type="text" autocomplete="off"></label></div>
          <div class="formactions"><button class="btn btn-primary" type="submit">Ajouter</button></div></form>
        <form class="card pad form" data-form="import"><h2>Coller une liste</h2>
          <label class="fld"><span>Une ligne par étudiant : « NOM Prénom », ou deux colonnes copiées depuis Pronote ou Excel</span><textarea id="importTxt" rows="4" placeholder="MARTIN Léa&#10;DUPONT Hugo"></textarea></label>
          <div class="formactions"><span class="small muted" id="importInfo"></span><button class="btn btn-primary" type="submit">Importer</button></div></form></div>` : ''}
      <div id="stList"></div>`;
  },
  update(){
    const studs = sortedStudents();
    $('#stCount').textContent = `${studs.length} étudiant${studs.length > 1 ? 's' : ''} dans ${(S.classes.find(c => c.id === S.classId) || {}).name || 'cette classe'}`;
    if (S.editing && document.activeElement && document.activeElement.closest && document.activeElement.closest('#stList')) return;
    if (!studs.length){ $('#stList').innerHTML = `<div class="card empty"><h2>Aucun étudiant pour l'instant</h2><p>Collez la liste de la classe ci-dessus : une ligne par étudiant, nom puis prénom.</p></div>`; return; }
    const rows = studs.map(s => {
      const nEv = blocEvals().filter(ev => resFor(ev.id, s.id)).length; const avg = studentAvg(s.id);
      if (S.editing === s.id) return `<tr><td colspan="5"><form class="row" data-form="edit-student" data-id="${esc(s.id)}"><label class="fld"><span>Nom</span><input id="edNom" type="text" value="${esc(s.nom)}" required></label><label class="fld"><span>Prénom</span><input id="edPrenom" type="text" value="${esc(s.prenom)}"></label><button class="btn btn-primary" type="submit">Enregistrer</button><button class="btn" type="button" data-act="cancel-edit">Annuler</button></form></td></tr>`;
      return `<tr><td class="stick"><a class="namebtn" href="#etudiant-${esc(s.id)}" style="text-decoration:none">${esc(s.nom)} ${esc(s.prenom)}${s.example ? ' <span class="chip">exemple</span>' : ''}</a></td>
        <td>${acqCell(s.id)}</td><td class="num">${nEv}</td><td class="num"><b>${fmtNote(avg)}</b></td>
        <td class="num">${S.canWrite ? `<button class="btn btn-ghost" data-act="edit-student" data-id="${esc(s.id)}">Renommer</button><button class="btn btn-ghost btn-danger" data-act="del-student" data-id="${esc(s.id)}">Supprimer</button>` : ''}</td></tr>`;
    }).join('');
    $('#stList').innerHTML = `<div class="tablewrap"><table><thead><tr><th class="stick">Nom et prénom</th><th>Acquisition</th><th class="num">Évaluations</th><th class="num">Moyenne /20</th><th class="num"><span class="sr">Actions</span></th></tr></thead><tbody>${rows}</tbody></table></div>${acqLegend()}`;
    if (S.editing){ const i = $('#edNom'); if (i && document.activeElement !== i && !document.activeElement.closest('#stList')) i.focus(); }
  }
};

/* --- Vue : fiche d'un étudiant --- */
VIEWS.etudiant = {
  build(){ return `<div id="sfBody"></div>`; },
  update(){
    const s = stById(S.route.id);
    if (!s){ $('#sfBody').innerHTML = `<a class="back" href="#etudiants">← Étudiants</a><div class="card empty"><h2>Étudiant introuvable</h2><p>Il a peut-être été supprimé, ou il appartient à une autre classe.</p></div>`; return; }
    const evs = sortedEvals('asc'); const avg = studentAvg(s.id); const acq = acquisition(s.id); const seuil = seuilLevel(); const si = LEVELS.indexOf(seuil);
    const usedCodes = usedComps();
    const compRows = usedCodes.map(c => {
      const h = compHistory(s.id, c.code); const last = h.length ? h[h.length - 1].lv : null;
      return `<tr><td class="stick"><b>${c.code}</b><br><span class="xs muted">${esc(c.short)}</span></td>
        <td>${h.length ? sparkSVG(h) : '<span class="muted small">Pas encore positionné</span>'}</td>
        <td><div class="timeline">${h.map(x => lvChip(x.lv, x.ev.title + ' — ' + fmtDate(x.ev.date))).join('')}</div></td>
        <td class="ctr">${lvChip(last)}</td></tr>`;
    }).join('');
    const lastOf = c => { const h = compHistory(s.id, c.code); return h.length ? h[h.length - 1] : null; };
    const usedSet = new Set(usedCodes.map(c => c.code));
    const actAvg = {};
    ACTS.forEach(a => { const vals = COMPS.filter(c => actOf(c) === a.code).map(lastOf).filter(Boolean).map(l => lvNum(l.lv)); actAvg[a.code] = vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null; });
    const groupsHtml = ACTS.map(a => `<div class="plist"><h3><span><b>${a.code}</b> ${esc(a.band)}</span>${actAvg[a.code] == null ? '' : lvChip(LEVELS[Math.round(actAvg[a.code]) - 1], 'Niveau moyen : ' + fmtNote(actAvg[a.code]) + ' sur 4')}</h3>
      <p class="xs muted" style="margin:0 0 4px">${esc(a.name)}</p>
      ${COMPS.filter(c => actOf(c) === a.code).map(c => { const l = lastOf(c); return `<div class="plrow"><span><b>${c.code}</b>${esc(c.short)}</span>${l ? lvChip(l.lv, l.ev.title + ' — ' + fmtDate(l.ev.date)) : `<span class="xs muted">${usedSet.has(c.code) ? 'à positionner' : 'non évaluée'}</span>`}</div>`; }).join('')}</div>`).join('');
    const evRows = evs.slice().reverse().map(ev => {
      const r = resFor(ev.id, s.id); const lines = evalLines(ev); const n = finalNote(ev, r);
      const lv = lines.map(l => lvChip(r && !r.absent && r.levels && r.levels[l.key], l.code)).join(' ');
      const txt = r ? [r.oral ? `<div class="small"><b>Oral :</b> ${esc(r.oral)}</div>` : '', r.comment ? `<div class="small"><b>Commentaire :</b> ${esc(r.comment)}</div>` : ''].join('') : '';
      return `<tr><td class="small">${esc(fmtDate(ev.date))}</td><td><a href="#eval-${esc(ev.id)}"><b>${esc(ev.title)}</b></a>${txt}</td><td>${r && r.absent ? '<span class="chip">Absent</span>' : `<div class="timeline">${lv}</div>`}</td>
        <td class="num"><span class="note${r && typeof r.override === 'number' && !r.absent ? ' override' : ''}">${r && r.absent ? 'ABS' : fmtNote(n)}</span></td>
        <td class="num"><button class="btn btn-ghost" data-act="open" data-ev="${esc(ev.id)}" data-s="${esc(s.id)}">${S.canWrite ? 'Saisir' : 'Voir'}</button></td></tr>`;
    }).join('');
    $('#sfBody').innerHTML = `<a class="back" href="#etudiants">← Étudiants</a>
      <div class="vhead"><div class="grow"><span class="eyebrow">Fiche étudiant</span><h1>${esc(s.nom)} ${esc(s.prenom)}</h1><div class="meta"><span>${evs.filter(ev => resFor(ev.id, s.id)).length} évaluation(s) saisie(s)</span><span>Seuil d'acquisition : ${seuil}</span></div></div>
      <div class="actions"><div class="card stat"><span>Moyenne</span><b>${fmtNote(avg)}</b></div><div class="card stat" title="${esc(W.acqTitle.replace('{seuil}', seuil))}"><span>${esc(W.acquired)}</span><b>${acq.evaluated ? acq.acquired + ' / ' + acq.evaluated : '—'}</b></div></div></div>
      <section class="card pad chartcard"><h2>Profil de compétences — ${UNIT} ${S.bloc}</h2><p class="hint">Les ${ACTS.length} ${W.acts} du ${UNIT.toLowerCase()} (${ACTS[0].code} à ${ACTS[ACTS.length - 1].code}) et leurs ${COMPS.length} ${W.comps}. Dernier positionnement de l'étudiant, comparé à la moyenne de la classe.</p>
        ${usedCodes.length ? `<div class="profile-grid">
          <div class="radar-wrap"><div id="radar"></div>
            <div class="legend"><span><i class="sw sw-poly"></i>${esc(s.nom)} ${esc(s.prenom)}</span><span><i class="sw sw-line2"></i>Moyenne de la classe</span><span><i class="sw sw-zone"></i>Zone d'acquisition (${seuil} ou plus)</span><span>En gris : ${esc(W.notYet)}</span></div></div>
          <div class="profile-side">
            ${acq.evaluated ? `<div><h3 class="small" style="margin-bottom:6px">Répartition des niveaux</h3><div class="seg-tall" role="img" aria-label="${esc('Répartition : ' + LEVELS.map(k => k + ' ' + acq.counts[k]).join(', '))}">${LEVELS.filter(k => acq.counts[k]).map(k => `<i class="f-${k}" style="flex:${acq.counts[k]}" data-tip="${esc(LEVEL_NAME[k] + ' : ' + acq.counts[k] + ' ' + W.comp + (acq.counts[k] > 1 ? 's' : ''))}">${k} ${acq.counts[k]}</i>`).join('')}</div></div>` : ''}
            ${groupsHtml}
          </div></div>` : '<p class="muted">Aucune compétence évaluée dans cette classe pour l\'instant.</p>'}</section>
      <div class="section"><h2>Progression par compétence</h2>${usedCodes.length ? `<div class="tablewrap"><table><thead><tr><th class="stick">Compétence</th><th>Évolution</th><th>Positionnements, du plus ancien au plus récent</th><th class="ctr">Dernier</th></tr></thead><tbody>${compRows}</tbody></table></div>` : '<p class="muted">Aucune compétence évaluée dans cette classe pour l\'instant.</p>'}</div>
      <div class="section"><h2>Évaluations</h2>${evs.length ? `<div class="tablewrap"><table><thead><tr><th>Date</th><th>Évaluation</th><th>Niveaux</th><th class="num">Note</th><th></th></tr></thead><tbody>${evRows}</tbody></table></div>` : '<p class="muted">Aucune évaluation dans cette classe.</p>'}</div>`;
    const rd = $('#radar');
    if (rd) rd.innerHTML = radarSVG(rd.clientWidth, COMPS.map(c => { const l = lastOf(c); return {code:c.code, short:c.short, act:actOf(c), na:!usedSet.has(c.code), v:l ? lvNum(l.lv) : 0, lv:l && l.lv, title:l && l.ev.title, avg:classAvgLevel(c.code)}; }), lvNum(seuil), fullName(s), actAvg);
  }
};

/* --- Vue : synthèse de classe --- */
VIEWS.synthese = {
  build(){
    return `<div class="vhead"><div class="grow"><h1>Synthèse de la classe — ${UNIT} ${S.bloc}</h1><div class="meta" id="syMeta"></div></div><div class="actions">${S.dl ? `<button class="btn" data-act="export-class">Exporter la classe (.xlsx)</button>` : ''}</div></div><div id="syBody"></div>`;
  },
  update(){
    const studs = sortedStudents(); const evs = sortedEvals('asc');
    $('#syMeta').textContent = `${studs.length} étudiants · ${evs.length} évaluations`;
    if (!studs.length || !evs.length){ $('#syBody').innerHTML = `<div class="card empty"><h2>Pas encore de quoi faire une synthèse</h2><p>La synthèse apparaît dès qu'il y a des étudiants et au moins une évaluation saisie.</p></div>`; return; }
    const used = COMPS.filter(c => evs.some(ev => (ev.comps || []).some(x => x.code === c.code)));
    const lastRows = studs.map(s => `<tr><td class="stick"><a class="namebtn" href="#etudiant-${esc(s.id)}" style="text-decoration:none">${esc(s.nom)} ${esc(s.prenom)}</a></td>${used.map(c => { const h = compHistory(s.id, c.code); const x = h[h.length - 1]; return `<td class="ctr">${lvChip(x && x.lv, x ? x.ev.title : '')}</td>`; }).join('')}<td>${acqCell(s.id)}</td><td class="num"><b>${fmtNote(studentAvg(s.id))}</b></td></tr>`).join('');
    const distRow = used.map(c => { const cnt = {MI:0, MF:0, MS:0, TBM:0}; studs.forEach(s => { const h = compHistory(s.id, c.code); const x = h[h.length - 1]; if (x) cnt[x.lv]++; }); return `<td class="ctr xs">${LEVELS.filter(k => cnt[k]).map(k => `${k} ${cnt[k]}`).join('<br>') || '—'}</td>`; }).join('');
    const avgAll = (() => { const ns = studs.map(s => studentAvg(s.id)).filter(n => n != null); return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : null; })();
    const noteRows = studs.map(s => `<tr><td class="stick">${esc(s.nom)} ${esc(s.prenom)}</td>${evs.map(ev => { const r = resFor(ev.id, s.id); return `<td class="num">${r && r.absent ? 'ABS' : fmtNote(finalNote(ev, r))}</td>`; }).join('')}<td class="num"><b>${fmtNote(studentAvg(s.id))}</b></td></tr>`).join('');
    const evAvgs = evs.map(ev => `<td class="num">${fmtNote(evStats(ev).avg)}</td>`).join('');
    $('#syBody').innerHTML = `<div class="section" style="margin-top:0"><h2>Dernier niveau par compétence</h2>
      <div class="tablewrap"><table><thead><tr><th class="stick">Étudiant</th>${used.map(c => `<th class="ctr" title="${esc(c.short)}">${c.code}<br><span style="font-weight:400">${esc(c.short)}</span></th>`).join('')}<th>Acquisition</th><th class="num">Moyenne</th></tr></thead>
      <tbody>${lastRows}</tbody><tfoot><tr><td class="stick">Répartition</td>${distRow}<td></td><td class="num">${fmtNote(avgAll)}</td></tr></tfoot></table></div>${acqLegend()}</div>
      <div class="section"><h2>Notes par évaluation</h2>
      <div class="tablewrap"><table><thead><tr><th class="stick">Étudiant</th>${evs.map(ev => `<th class="num" title="${esc(ev.title)}">${esc(String(ev.code || ev.title).slice(0, 22))}<br><span style="font-weight:400">${esc(fmtDate(ev.date))}</span></th>`).join('')}<th class="num">Moyenne</th></tr></thead>
      <tbody>${noteRows}</tbody><tfoot><tr><td class="stick">Moyenne de classe</td>${evAvgs}<td class="num">${fmtNote(avgAll)}</td></tr></tfoot></table></div></div>`;
  }
};

/* --- Vue : réglages --- */
VIEWS.reglages = {
  build(){
    const cl = S.classes.find(c => c.id === S.classId) || {}; const p = points(); const w = S.canWrite;
    return `<div class="vhead"><div class="grow"><h1>Réglages</h1></div></div>
      <div class="twocol">
        <form class="card pad form" data-form="rename-class"><h2>Classe</h2>
          <label class="fld"><span>Nom de la classe</span><input id="clName" type="text" value="${esc(cl.name || '')}" required${w ? '' : ' disabled'}></label>
          ${w ? `<div class="formactions"><button class="btn btn-danger" type="button" data-act="del-class">Supprimer la classe</button><button class="btn" type="button" data-act="new-class">Nouvelle classe</button><button class="btn btn-primary" type="submit">Renommer</button></div>` : ''}</form>
        <form class="card pad form" data-form="points"><h2>Barème des niveaux</h2>
          <p class="hint">Points attribués à chaque niveau pour calculer la note indicative sur 20. S'applique à toutes les classes.${CFG.pointsHint ? ' ' + esc(CFG.pointsHint) : ''}</p>
          <div class="row">${LEVELS.map(k => `<label class="fld"><span>${lvChip(k)} ${k}</span><input id="pt-${k}" type="number" min="0" max="20" step="${CFG.pointsStep}" value="${p[k]}"${w ? '' : ' disabled'}></label>`).join('')}</div>
          <label class="fld" style="max-width:320px"><span>Seuil d'acquisition (graphiques et colonne « Acquisition »)</span><select id="pt-seuil" class="inp"${w ? '' : ' disabled'}>${['MF','MS','TBM'].map(k => `<option value="${k}"${k === seuilLevel() ? ' selected' : ''}>${k} ou plus</option>`).join('')}</select></label>
          ${w ? `<div class="formactions"><button class="btn btn-primary" type="submit">Enregistrer le barème</button></div>` : ''}</form>
      </div>
      <div class="section card pad"><h2>Sauvegarde des données</h2>
        <p class="small muted" style="max-width:78ch">Chaque saisie est enregistrée automatiquement dans la base de données sécurisée, hébergée en France : vous retrouvez vos évaluations sur tous vos appareils, après connexion. Le bouton « Enregistrer », en haut de page, vérifie que tout est bien envoyé. Un historique des modifications est conservé ; gardez aussi, de temps en temps, une copie de sécurité dans vos dossiers.</p>
        <div class="formactions" style="justify-content:flex-start">${w ? `<button type="button" class="btn btn-primary" data-act="save-now">Enregistrer maintenant</button>` : ''}<button type="button" class="btn" data-local="download">Télécharger une copie de sécurité (.json)</button>${w ? `<button type="button" class="btn" data-local="open">Restaurer une sauvegarde…</button>` : ''}</div>
        ${CFG.importHint ? `<p class="hint" style="margin-top:10px">${esc(CFG.importHint)}</p>` : ''}</div>
      <div class="section"><h2>Référentiel — ${UNIT} ${S.bloc}</h2><p class="hint">${esc(REF[S.bloc].title)} (${esc(CFG.refSource)}). Évaluation : ${esc(REF[S.bloc].modal)}</p>
        <div class="reflist">${ACTS.map(a => `<h3 class="refgroup"><b>${esc(a.code)}</b> ${esc(a.name)}</h3>` + COMPS.filter(c => actOf(c) === a.code).map(c => `<div class="card pad ref"><b>${esc(c.code)}</b> — ${esc(c.full)}<p><b style="color:var(--ink-2)">${esc(W.crit)} :</b> ${esc(c.crit)}</p></div>`).join('')).join('')}</div></div>
      ${CFG.levelDesc ? `<div class="section"><h2>Échelle de positionnement</h2><div class="reflist">${LEVELS.map(k => `<div class="card pad ref">${lvChip(k)} <b>${LEVEL_NAME[k]}</b><p>${esc(LEVEL_DESC[k])}</p></div>`).join('')}</div></div>` : ''}`;
  },
  update(){}
};

/* ---------- Panneau de saisie ---------- */
let panelTick = 0; const textTimers = {};
function openPanel(evId, sid){
  if (S.panel) flushTexts();
  S.panel = {evId, sid}; buildPanel(); $('#panel').hidden = false;
  clearInterval(panelTick); panelTick = setInterval(() => { if (S.panel) updateChrono(); }, 20000);
}
function closePanel(){
  if (!S.panel) return; flushTexts(); S.panel = null; $('#panel').hidden = true; $('#panel').innerHTML = ''; clearInterval(panelTick);
}
function buildPanel(){
  const ev = evById(S.panel.evId), s = stById(S.panel.sid);
  if (!ev || !s){ closePanel(); return; }
  const studs = sortedStudents(); const i = studs.findIndex(x => x.id === s.id);
  const lines = evalLines(ev);
  $('#panel').innerHTML = `<div class="p-head">
      <button class="icon-btn" data-act="p-prev" aria-label="Étudiant précédent"${i <= 0 ? ' disabled' : ''}>‹</button>
      <div class="p-title"><span class="eyebrow" title="${esc(ev.title)}">${esc(ev.title)}</span><h2>${esc(s.nom)} ${esc(s.prenom)}</h2><span class="xs muted">${i + 1} / ${studs.length}</span></div>
      <button class="icon-btn" data-act="p-next" aria-label="Étudiant suivant"${i >= studs.length - 1 ? ' disabled' : ''}>›</button>
      <button class="icon-btn" data-act="p-close" aria-label="Fermer la fiche">×</button></div>
    <div class="p-body${S.canWrite ? '' : ' p-dis'}" id="pBody">
      <div class="p-top"><label class="switch"><input type="checkbox" id="pAbsent"${S.canWrite ? '' : ' disabled'}> Absent</label>
        <div class="chrono"><span id="pChrono"></span>${S.canWrite ? `<button class="btn" data-act="p-start">Début</button><button class="btn" data-act="p-end">Fin</button>` : ''}</div></div>
      ${lines.map(l => `<section class="p-line" data-k="${esc(l.key)}"><h3><b>${esc(l.key === 'TR' ? 'Transverse' : l.code)}</b>${esc(l.key === 'TR' ? '' : l.short)}<span class="status">${esc(l.key === 'TR' ? l.short : l.status)}${l.weight !== 1 ? ' · coef. ' + l.weight : ''}</span></h3>
        <div class="seg" role="group" aria-label="Niveau ${esc(l.code)}">${LEVELS.map(k => `<button class="segbtn l-${k}" data-act="p-lv" data-k="${esc(l.key)}" data-l="${k}" aria-pressed="false" title="${esc(LEVEL_NAME[k] + (LEVEL_DESC[k] ? ' — ' + LEVEL_DESC[k] : ''))}">${k}</button>`).join('')}<button class="segclear" data-act="p-lv" data-k="${esc(l.key)}" data-l="" aria-label="Effacer le niveau ${esc(l.code)}" title="Effacer">×</button></div>
        ${l.key === 'TR' ? '' : `<p class="crit">${esc(l.crit)}</p>`}</section>`).join('')}
      <div class="p-note"><span>Note calculée <strong id="pCalc">—</strong> /20</span><label for="pOverride">Note retenue <input id="pOverride" type="number" min="0" max="20" step="0.5" inputmode="decimal"></label></div>
      <label class="fld"><span>Restitution orale — questions posées, réponses</span><textarea id="pOral" rows="3"></textarea></label>
      <label class="fld"><span>Commentaires</span><textarea id="pComment" rows="3"></textarea></label>
      <p class="p-by" id="pBy"></p></div>
    ${S.canWrite ? `<div class="p-foot"><p class="p-valid" id="pValid"></p>
      <div class="p-actions">${SAVESTATE}<span class="grow"></span>
        <button class="btn" data-act="p-unlock" id="pUnlock" hidden>Modifier</button>
        <button class="btn" data-act="p-validate" data-next="0" id="pVal1">Valider</button>
        <button class="btn btn-primary" data-act="p-validate" data-next="1" id="pVal2">Valider → suivant</button></div></div>` : ''}`;
  updatePanel(); renderSaveState();
}
function updatePanel(){
  const ev = evById(S.panel.evId), s = stById(S.panel.sid);
  if (!ev || !s){ closePanel(); return; }
  const r = resFor(ev.id, s.id) || {};
  const ab = $('#pAbsent'); if (ab && document.activeElement !== ab) ab.checked = !!r.absent;
  document.querySelectorAll('#panel .segbtn').forEach(b => b.setAttribute('aria-pressed', String(!!(r.levels && r.levels[b.dataset.k] === b.dataset.l))));
  document.querySelectorAll('#panel .p-line').forEach(sec => { sec.style.opacity = r.absent ? '.45' : ''; });
  const calc = calcNote(ev, r); $('#pCalc').textContent = fmtNote(calc);
  const ov = $('#pOverride'); if (document.activeElement !== ov){ ov.value = typeof r.override === 'number' ? r.override : ''; ov.placeholder = calc == null ? '' : calc.toFixed(1); }
  for (const [id, f] of [['pOral', 'oral'], ['pComment', 'comment']]){ const t = $('#' + id); if (document.activeElement !== t && !textTimers[f]) t.value = r[f] || ''; }
  updateChrono();
  const locked = !!(r.validated && r.validated.at);
  const body = $('#pBody'); if (body) body.classList.toggle('p-dis', locked || !S.canWrite);
  const pv = $('#pValid');
  if (pv){
    if (locked){
      const when = new Date(r.validated.at).toLocaleString('fr-FR', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'});
      pv.className = 'p-valid ok'; pv.textContent = '✓ Positionnement validé et enregistré le ' + when + '. Cliquez sur « Modifier » pour le changer.';
    } else {
      const ls = evalLines(ev); const nOk = ls.filter(l => r.levels && r.levels[l.key]).length;
      pv.className = 'p-valid';
      pv.textContent = r.absent ? 'Étudiant absent : validez pour figer la fiche.' : nOk === ls.length ? 'Positionnement complet : validez-le pour le figer.' : `Positionnement en cours : ${nOk} / ${ls.length} lignes. Les saisies sont enregistrées au fur et à mesure.`;
    }
  }
  const un = $('#pUnlock'), v1 = $('#pVal1'), v2 = $('#pVal2');
  if (un){ un.hidden = !locked; v1.hidden = locked; v2.hidden = locked; const studs = sortedStudents(); v2.disabled = studs.findIndex(x => x.id === s.id) >= studs.length - 1; }
  const by = $('#pBy');
  if (r.updatedAt){
    const when = new Date(r.updatedAt).toLocaleString('fr-FR', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'});
    by.textContent = 'Dernière saisie le ' + when;
    if (r.updatedBy && S.user){ const id = r.updatedBy; S.user.profiles([id]).then(ps => { const p = ps[id]; if (!S.panel || !p) return; by.textContent = 'Dernière saisie le ' + when + ' par ' + (p.isMe ? 'vous' : (p.name || 'un collègue')); }).catch(() => {}); }
  } else by.textContent = 'Rien de saisi pour cet étudiant.';
}
function updateChrono(){
  const el = $('#pChrono'); if (!el || !S.panel) return;
  const r = resFor(S.panel.evId, S.panel.sid) || {};
  if (!r.start){ el.textContent = 'Passage non chronométré'; return; }
  const a = new Date(r.start), b = r.end ? new Date(r.end) : new Date();
  const min = Math.max(0, Math.round((b - a) / 60000));
  el.textContent = r.end ? `${fmtHour(r.start)} – ${fmtHour(r.end)} · ${min} min` : `Début ${fmtHour(r.start)} · en cours, ${min} min`;
}
function flushTexts(){
  for (const f of Object.keys(textTimers)){ clearTimeout(textTimers[f].t); textTimers[f].run(); delete textTimers[f]; }
}
function onPanelText(field, value){
  const ev = evById(S.panel.evId), sid = S.panel.sid;
  if (textTimers[field]) clearTimeout(textTimers[field].t);
  const run = () => { delete textTimers[field]; saveResult(ev, sid, {[field]: value}); };
  textTimers[field] = {run, t:setTimeout(run, 900)};
}

/* ---------- Évaluation : création / modification ---------- */
function openEvalEditor(ev){
  const isNew = !ev; ev = ev || {title:'', code:'', date:today(), type:'TP', comps:[], transverse:null};
  const sel = Object.fromEntries((ev.comps || []).map(c => [c.code, c]));
  const m = openModal(`<form class="form" data-form="eval" ${isNew ? '' : `data-id="${esc(ev.id)}"`}>
    <h2>${isNew ? 'Nouvelle évaluation' : 'Modifier l\'évaluation'}</h2>
    <label class="fld"><span>Titre</span><input id="fTitle" type="text" required value="${esc(ev.title)}" placeholder="${esc(CFG.evalTitlePlaceholder)}"></label>
    <div class="row"><label class="fld"><span>Code (cartouche)</span><input id="fCode" type="text" value="${esc(ev.code || '')}" placeholder="${esc(CFG.codePlaceholder(S.bloc))}"></label>
      <label class="fld" style="flex:0 1 170px"><span>Date</span><input id="fDate" type="date" value="${esc(ev.date || '')}"></label>
      <label class="fld" style="flex:0 1 150px"><span>Type</span><select id="fType" class="inp">${TYPES.map(t => `<option${t === ev.type ? ' selected' : ''}>${t}</option>`).join('')}</select></label></div>
    <fieldset><legend>Compétences évaluées</legend><p class="hint">${esc(CFG.compHint)}</p><p class="small" id="fFm" style="color:var(--danger)" hidden></p>
      ${COMPS.map((c, i) => { const x = sel[c.code]; const g = actOf(c); const head = (i === 0 || actOf(COMPS[i - 1]) !== g) && ACT[g] ? `<div class="compgroup"><b>${esc(g)}</b> ${esc(ACT[g].name)}</div>` : ''; return head + `<div class="comprow"><label class="chk"><input type="checkbox" data-code="${c.code}"${x ? ' checked' : ''}><span><b>${c.code}</b> ${esc(c.short)}</span></label>
        <select class="inp" data-status="${c.code}" aria-label="Statut de ${c.code}">${STATUSES.map(st => `<option value="${esc(st)}"${(x ? (x.status || '') : CFG.defaultStatus) === st ? ' selected' : ''}>${st || '(sans statut)'}</option>`).join('')}</select>
        <label class="w">Coef. <input type="number" min="0" max="10" step="0.5" value="${x ? num(x.weight, 1) : 1}" data-weight="${c.code}" aria-label="Coefficient ${c.code}"></label></div>`; }).join('')}</fieldset>
    <fieldset><legend>Objectif transverse (facultatif)</legend>
      <div class="row"><label class="fld"><span>Intitulé</span><input id="fTrLabel" type="text" value="${esc(ev.transverse && ev.transverse.label || '')}" placeholder="${esc(CFG.trPlaceholder)}"></label>
      <label class="fld" style="flex:0 1 100px"><span>Coef.</span><input id="fTrW" type="number" min="0" max="10" step="0.5" value="${ev.transverse ? num(ev.transverse.weight, 1) : 1}"></label></div>
      <p class="hint">Coefficient 0 : la ligne est positionnée mais ne compte pas dans la note.</p></fieldset>
    <p class="small" id="fErr" style="color:var(--danger)" hidden></p>
    <div class="formactions"><button class="btn" type="button" data-act="modal-cancel">Annuler</button><button class="btn btn-primary" type="submit">${isNew ? 'Créer l\'évaluation' : 'Enregistrer'}</button></div></form>`);
  $('#fTitle', m).focus(); checkFm();
}
function checkFm(){
  const m = $('#modal'); const el = m && $('#fFm', m); if (!el || !CFG.fmMax) return;
  const acts = new Set([...m.querySelectorAll('[data-code]')].filter(i => i.checked && m.querySelector(`[data-status="${i.dataset.code}"]`).value === 'Fortement mobilisée')
    .map(i => COMP[i.dataset.code] && actOf(COMP[i.dataset.code])).filter(a => a && !/^T/.test(a)));
  el.hidden = acts.size <= CFG.fmMax;
  el.textContent = `${acts.size} compétences fortement mobilisées (${[...acts].join(', ')}) : la règle de l'équipe en prévoit ${CFG.fmMax} au plus par activité.`;
}
async function submitEval(form){
  const m = $('#modal'); const title = $('#fTitle', m).value.trim();
  const comps = [...m.querySelectorAll('[data-code]')].filter(i => i.checked).map(i => ({code:i.dataset.code, status:m.querySelector(`[data-status="${i.dataset.code}"]`).value, weight:num(m.querySelector(`[data-weight="${i.dataset.code}"]`).value, 1)}));
  const trLabel = $('#fTrLabel', m).value.trim();
  const err = $('#fErr', m);
  if (!title){ err.textContent = 'Donnez un titre à l\'évaluation.'; err.hidden = false; return; }
  if (!comps.length && !trLabel){ err.textContent = 'Cochez au moins une compétence, ou renseignez un objectif transverse.'; err.hidden = false; return; }
  const id = form.dataset.id || newId(); const old = evById(id);
  const data = {classId:old ? old.classId : S.classId, bloc:old ? unitOf(old) : S.bloc, title, code:$('#fCode', m).value.trim(), date:$('#fDate', m).value || today(), type:$('#fType', m).value,
    comps, transverse:trLabel ? {label:trLabel, weight:num($('#fTrW', m).value, 1)} : null, createdAt:old ? (old.createdAt || new Date().toISOString()) : new Date().toISOString(), ...stamp()};
  closeModal();
  S.evals = S.evals.filter(e => e.id !== id).concat([{id, ...data}]);
  await setDoc('evaluations/' + id, data);
  if (!old) location.hash = '#eval-' + id; else scheduleRender();
  toast(old ? 'Évaluation enregistrée' : 'Évaluation créée');
}

/* ---------- Étudiants ---------- */
function parseNames(text){
  const out = [];
  for (let line of text.split(/\r?\n/)){
    line = line.trim(); if (!line) continue;
    let nom, prenom;
    const parts = line.split(/\t|;/).map(x => x.trim()).filter(Boolean);
    if (parts.length >= 2){ nom = parts[0]; prenom = parts[1]; if (/^nom$/i.test(nom) && /^pr[ée]nom/i.test(prenom)) continue; }
    else {
      const toks = line.split(/\s+/); let i = 0;
      while (i < toks.length - 1 && /\p{L}/u.test(toks[i]) && toks[i] === toks[i].toLocaleUpperCase('fr')) i++;
      if (i > 0){ nom = toks.slice(0, i).join(' '); prenom = toks.slice(i).join(' '); }
      else if (toks.length >= 2){ nom = toks[0]; prenom = toks.slice(1).join(' '); }
      else { nom = toks[0]; prenom = ''; }
    }
    if (prenom && prenom === prenom.toLocaleUpperCase('fr')) prenom = prenom.toLocaleLowerCase('fr').replace(/(^|[\s-])(\p{L})/gu, (m0, a, b) => a + b.toLocaleUpperCase('fr'));
    out.push({nom:nom.toLocaleUpperCase('fr'), prenom});
  }
  return out;
}
async function addStudents(list){
  const exists = new Set(S.students.map(s => (s.nom + '|' + s.prenom).toLowerCase()));
  const todo = list.filter(x => x.nom && !exists.has((x.nom + '|' + x.prenom).toLowerCase()));
  let n = 0;
  for (const x of todo){
    const id = newId(); const data = {classId:S.classId, nom:x.nom, prenom:x.prenom, createdAt:new Date().toISOString()};
    S.students = S.students.concat([{id, ...data}]); scheduleRender();
    try { await retry(() => S.db.doc('students/' + id).set(data)); n++; } catch(e){ onWriteError(e); break; }
  }
  return {added:n, skipped:list.length - todo.length};
}
async function deleteStudent(id){
  const rs = S.evals.map(ev => ev.id + '_' + id).filter(rid => S.results.has(rid));
  await delMany([...rs.map(rid => 'results/' + rid), 'students/' + id]);
}
async function deleteEval(id){
  const rs = [...S.results.keys()].filter(k => k.startsWith(id + '_'));
  await delMany([...rs.map(rid => 'results/' + rid), 'evaluations/' + id]);
}

/* ---------- Export Excel ---------- */
let xlsxP = null;
function loadXLSX(){
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!xlsxP) xlsxP = new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'assets/vendor/xlsx.full.min.js'; sc.onload = () => res(window.XLSX); sc.onerror = () => { xlsxP = null; rej(new Error('xlsx')); }; document.head.appendChild(sc); });
  return xlsxP;
}
const r2 = n => n == null ? '' : Math.round(n * 100) / 100;
function sheetName(s, used){
  let b = String(s).replace(/[:\\/?*\[\]]/g, ' ').trim().slice(0, 28) || 'Feuille'; let n = b, i = 2;
  while (used.has(n.toLowerCase())) n = b.slice(0, 25) + ' (' + (i++) + ')';
  used.add(n.toLowerCase()); return n;
}
function evalSheet(X, ev){
  const lines = evalLines(ev); const studs = sortedStudents();
  const rows = [[ev.title], [`Code : ${ev.code || '—'}`, `Date : ${fmtDate(ev.date)}`, `Type : ${ev.type || ''}`], [],
    ['Nom', 'Prénom', ...lines.map(l => l.key === 'TR' ? 'Transverse' : l.code), 'Note calculée /20', 'Note retenue /20', 'Restitution orale', 'Commentaires', 'Début', 'Fin', 'Validé le']];
  for (const s of studs){
    const r = resFor(ev.id, s.id) || {};
    rows.push([s.nom, s.prenom, ...lines.map(l => r.absent ? 'ABS' : (r.levels && r.levels[l.key]) || ''), r.absent ? 'ABS' : r2(calcNote(ev, r)), r.absent ? 'ABS' : r2(finalNote(ev, r)), r.oral || '', r.comment || '', r.start ? fmtHour(r.start) : '', r.end ? fmtHour(r.end) : '', r.validated && r.validated.at ? new Date(r.validated.at).toLocaleString('fr-FR') : '']);
  }
  rows.push([], ['Moyenne de la classe', '', ...lines.map(() => ''), '', r2(evStats(ev).avg)]);
  rows.push([], ['Lignes évaluées']);
  lines.forEach(l => rows.push([l.key === 'TR' ? 'Transverse' : l.code, l.short, l.status, 'Coef. ' + l.weight]));
  const ws = X.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:18}, {wch:16}, ...lines.map(() => ({wch:9})), {wch:14}, {wch:14}, {wch:40}, {wch:40}, {wch:7}, {wch:7}, {wch:18}];
  return ws;
}
function legendSheet(X){
  const p = points();
  const rows = [['Niveau', 'Signification', 'Points'], ...LEVELS.map(k => [k, LEVEL_NAME[k], p[k]]), [], ['Code', 'Compétence (' + UNIT + ' ' + S.bloc + ')', W.crit], ...COMPS.map(c => [c.code, c.full, c.crit])];
  const ws = X.utils.aoa_to_sheet(rows); ws['!cols'] = [{wch:10}, {wch:70}, {wch:70}]; return ws;
}
async function saveWorkbook(wb, filename){
  const X = window.XLSX; const buf = X.write(wb, {bookType:'xlsx', type:'array'});
  try { await S.dl.save({filename, data:buf}); toast('Fichier Excel prêt'); }
  catch(e){ const c = e && e.code; if (c === 'declined') return; if (c === 'rate_limited') toast('Un téléchargement est déjà en attente de confirmation.'); else toast("Le téléchargement n'est pas disponible ici."); }
}
const fileSafe = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'evaluation';
async function exportEval(ev){
  let X; try { X = await loadXLSX(); } catch(e){ toast("L'export Excel n'a pas pu se charger. Vérifiez la connexion puis réessayez."); return; }
  const wb = X.utils.book_new(); const used = new Set();
  X.utils.book_append_sheet(wb, evalSheet(X, ev), sheetName('Évaluation', used));
  X.utils.book_append_sheet(wb, legendSheet(X), sheetName('Légende', used));
  await saveWorkbook(wb, fileSafe(ev.code || ev.title) + '.xlsx');
}
async function exportClass(){
  let X; try { X = await loadXLSX(); } catch(e){ toast("L'export Excel n'a pas pu se charger. Vérifiez la connexion puis réessayez."); return; }
  const studs = sortedStudents(); const evs = sortedEvals('asc'); const cl = S.classes.find(c => c.id === S.classId) || {name:'Classe'};
  const wb = X.utils.book_new(); const used = new Set();
  const notes = [[cl.name + ' — notes par évaluation'], [], ['Nom', 'Prénom', ...evs.map(ev => (ev.code || ev.title) + ' (' + fmtDate(ev.date) + ')'), 'Moyenne']];
  studs.forEach(s => notes.push([s.nom, s.prenom, ...evs.map(ev => { const r = resFor(ev.id, s.id); return r && r.absent ? 'ABS' : r2(finalNote(ev, r)); }), r2(studentAvg(s.id))]));
  notes.push([], ['Moyenne de classe', '', ...evs.map(ev => r2(evStats(ev).avg))]);
  const w1 = X.utils.aoa_to_sheet(notes); w1['!cols'] = [{wch:18}, {wch:16}, ...evs.map(() => ({wch:16})), {wch:10}];
  X.utils.book_append_sheet(wb, w1, sheetName('Notes', used));
  const used3 = COMPS.filter(c => evs.some(ev => (ev.comps || []).some(x => x.code === c.code)));
  const comp = [[cl.name + ' — dernier niveau par compétence'], [], ['Nom', 'Prénom', ...used3.map(c => c.code + ' ' + c.short)]];
  studs.forEach(s => comp.push([s.nom, s.prenom, ...used3.map(c => { const h = compHistory(s.id, c.code); return h.length ? h[h.length - 1].lv : ''; })]));
  const w2 = X.utils.aoa_to_sheet(comp); w2['!cols'] = [{wch:18}, {wch:16}, ...used3.map(() => ({wch:16}))];
  X.utils.book_append_sheet(wb, w2, sheetName('Compétences', used));
  evs.forEach(ev => X.utils.book_append_sheet(wb, evalSheet(X, ev), sheetName(ev.code || ev.title, used)));
  X.utils.book_append_sheet(wb, legendSheet(X), sheetName('Légende', used));
  await saveWorkbook(wb, fileSafe(cl.name) + '_' + CFG.unitFile + S.bloc + '_evaluations.xlsx');
}

/* ---------- Classes ---------- */
function openNewClass(){
  const m = openModal(`<form class="form" data-form="new-class"><h2>Nouvelle classe</h2><label class="fld"><span>Nom de la classe</span><input id="ncName" type="text" required placeholder="${esc(CFG.classPlaceholder)}"></label><div class="formactions"><button class="btn" type="button" data-act="modal-cancel">Annuler</button><button class="btn btn-primary" type="submit">Créer</button></div></form>`, {small:true, onClose:() => renderClassSelect()});
  $('#ncName', m).focus();
}
async function createClass(name){
  const id = newId(); const data = {name, createdAt:new Date().toISOString()};
  S.classes = S.classes.concat([{id, ...data}]).sort((a, b) => cmpFr(a.name, b.name));
  await setDoc('classes/' + id, data);
  setClass(id); location.hash = '#etudiants'; toast('Classe créée : ajoutez ses étudiants');
}
async function deleteClass(){
  const cl = S.classes.find(c => c.id === S.classId); if (!cl) return;
  const ok = await confirmBox('Supprimer la classe ?', `« ${cl.name} », ses ${S.students.length} étudiants, ses ${S.evals.length} évaluations et toutes les notes seront supprimés définitivement.`, 'Supprimer la classe');
  if (!ok) return;
  toast('Suppression en cours…');
  const rids = [...S.results.keys()], sids = S.students.map(s => s.id), eids = S.evals.map(e => e.id), cid = cl.id;
  await delMany([...rids.map(r => 'results/' + r), ...sids.map(s => 'students/' + s), ...eids.map(e => 'evaluations/' + e), 'classes/' + cid]);
  LS.set(LSK('class'), ''); S.classes = S.classes.filter(c => c.id !== cid); setClass(null); pickClass(); location.hash = '#evaluations'; toast('Classe supprimée');
}

/* ---------- Événements ---------- */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'open'){ openPanel(b.dataset.ev, b.dataset.s); return; }
  if (a === 'bloc'){ setBloc(+b.dataset.bloc); return; }
  if (a === 'p-close'){ closePanel(); return; }
  if (a === 'p-prev' || a === 'p-next'){
    const studs = sortedStudents(); const i = studs.findIndex(x => x.id === S.panel.sid); const j = a === 'p-prev' ? i - 1 : i + 1;
    if (studs[j]) openPanel(S.panel.evId, studs[j].id); return;
  }
  if (a === 'modal-cancel' || a === 'cancel-edit'){ if (a === 'modal-cancel') closeModal(); else { S.editing = null; S.builtKey = ''; render(); } return; }
  if (a === 'save-now'){ saveNow(); return; }
  if (!S.canWrite && !['export-eval','export-class'].includes(a)) return;
  if ((a === 'p-lv' || a === 'p-start' || a === 'p-end') && panelLocked()) return;
  if (a === 'p-validate'){ validateCurrent(b.dataset.next === '1'); return; }
  if (a === 'p-unlock'){ saveResult(evById(S.panel.evId), S.panel.sid, {validated:null}); toast('Positionnement déverrouillé : vous pouvez le modifier'); return; }
  if (a === 'retry-save'){ const f = S.failed; S.failed = []; renderSaveState(); f.forEach(x => queue(x.path, x.fn)); return; }
  if (a === 'p-lv'){
    const ev = evById(S.panel.evId); const r = resFor(ev.id, S.panel.sid) || {};
    const cur = r.levels && r.levels[b.dataset.k]; const val = b.dataset.l && b.dataset.l !== cur ? b.dataset.l : null;
    if (r.absent) await saveResult(ev, S.panel.sid, {absent:false});
    saveResult(ev, S.panel.sid, {levels:{[b.dataset.k]: val}}); return;
  }
  if (a === 'p-start'){ saveResult(evById(S.panel.evId), S.panel.sid, {start:new Date().toISOString(), end:null}); return; }
  if (a === 'p-end'){ const r = resFor(S.panel.evId, S.panel.sid) || {}; const now = new Date().toISOString(); saveResult(evById(S.panel.evId), S.panel.sid, r.start ? {end:now} : {start:now, end:now}); return; }
  if (a === 'new-eval'){ openEvalEditor(null); return; }
  if (a === 'edit-eval'){ openEvalEditor(evById(b.dataset.id)); return; }
  if (a === 'export-eval'){ const ev = evById(b.dataset.id); if (ev) exportEval(ev); return; }
  if (a === 'export-class'){ exportClass(); return; }
  if (a === 'del-eval'){
    const ev = evById(b.dataset.id); if (!ev) return;
    if (await confirmBox('Supprimer cette évaluation ?', `« ${ev.title} » et les positionnements de tous les étudiants seront supprimés définitivement.`)){ location.hash = '#evaluations'; await deleteEval(ev.id); toast('Évaluation supprimée'); }
    return;
  }
  if (a === 'edit-student'){ S.editing = b.dataset.id; S.builtKey = ''; render(); return; }
  if (a === 'del-student'){
    const s = stById(b.dataset.id); if (!s) return;
    if (await confirmBox('Supprimer cet étudiant ?', `${fullName(s)} et toutes ses évaluations seront supprimés définitivement.`)){ await deleteStudent(s.id); toast('Étudiant supprimé'); }
    return;
  }
  if (a === 'del-examples'){
    const ex = S.students.filter(s => s.example);
    if (await confirmBox('Supprimer les exemples ?', `${ex.length} étudiants d'exemple et leurs positionnements seront supprimés.`)){ for (const s of ex) await deleteStudent(s.id); toast('Exemples supprimés'); }
    return;
  }
  if (a === 'new-class'){ openNewClass(); return; }
  if (a === 'del-class'){ deleteClass(); return; }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.closest && t.closest('form[data-form="eval"]')) checkFm();
  if (t.id === 'classSel'){ if (t.value === '__new'){ if (S.canWrite) openNewClass(); else renderClassSelect(); } else { setClass(t.value); location.hash = '#evaluations'; } return; }
  if (!S.canWrite) return;
  if (t.classList.contains('lvsel')){ const ev = evById(t.dataset.ev); if (ev) saveResult(ev, t.dataset.s, {levels:{[t.dataset.k]: t.value || null}}); return; }
  if (S.panel && panelLocked() && (t.id === 'pAbsent' || t.id === 'pOverride')){ updatePanel(); return; }
  if (t.id === 'pAbsent' && S.panel){ saveResult(evById(S.panel.evId), S.panel.sid, {absent:t.checked}); return; }
  if (t.id === 'pOverride' && S.panel){ const v = t.value.trim(); let n = v === '' ? null : Math.min(20, Math.max(0, num(v.replace(',', '.'), NaN))); if (Number.isNaN(n)) n = null; saveResult(evById(S.panel.evId), S.panel.sid, {override:n}); return; }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (S.panel && (t.id === 'pOral' || t.id === 'pComment')){ if (S.canWrite && !panelLocked()) onPanelText(t.id === 'pOral' ? 'oral' : 'comment', t.value); return; }
  if (t.id === 'importTxt'){ const n = parseNames(t.value).length; $('#importInfo').textContent = n ? `${n} étudiant${n > 1 ? 's' : ''} détecté${n > 1 ? 's' : ''}` : ''; }
});
document.addEventListener('focusout', e => { if (S.panel && (e.target.id === 'pOral' || e.target.id === 'pComment')) flushTexts(); });
document.addEventListener('submit', async e => {
  const f = e.target.closest('form[data-form]'); if (!f) return; e.preventDefault();
  if (!S.canWrite) return;
  const k = f.dataset.form;
  if (k === 'eval') return submitEval(f);
  if (k === 'first-class'){ const n = $('#firstClassName').value.trim(); if (n) createClass(n); return; }
  if (k === 'new-class'){ const n = $('#ncName').value.trim(); if (!n) return; closeModal(); createClass(n); return; }
  if (k === 'rename-class'){ const n = $('#clName').value.trim(); if (n){ await updDoc('classes/' + S.classId, {name:n}); toast('Classe renommée'); } return; }
  if (k === 'points'){ const p = {}; for (const lv of LEVELS){ p[lv] = Math.min(20, Math.max(0, num($('#pt-' + lv).value, DEFAULT_POINTS[lv]))); } const sv = $('#pt-seuil').value; await setDoc('config/main', {points:p, seuil:LEVELS.includes(sv) ? sv : 'MS', ...stamp()}); toast('Barème enregistré'); return; }
  if (k === 'add-student'){
    const nom = $('#addNom').value.trim(), prenom = $('#addPrenom').value.trim(); if (!nom) return;
    const res = await addStudents([{nom:nom.toLocaleUpperCase('fr'), prenom}]);
    $('#addNom').value = ''; $('#addPrenom').value = ''; $('#addNom').focus();
    toast(res.added ? 'Étudiant ajouté' : 'Cet étudiant est déjà dans la classe'); return;
  }
  if (k === 'import'){
    const list = parseNames($('#importTxt').value); if (!list.length){ toast('Collez au moins une ligne « NOM Prénom ».'); return; }
    toast(`Import de ${list.length} étudiants…`);
    const res = await addStudents(list);
    $('#importTxt').value = ''; $('#importInfo').textContent = '';
    toast(`${res.added} étudiant${res.added > 1 ? 's' : ''} ajouté${res.added > 1 ? 's' : ''}${res.skipped ? ` · ${res.skipped} déjà présent${res.skipped > 1 ? 's' : ''}` : ''}`); return;
  }
  if (k === 'edit-student'){
    const nom = $('#edNom').value.trim().toLocaleUpperCase('fr'), prenom = $('#edPrenom').value.trim(); if (!nom) return;
    const id = f.dataset.id; S.editing = null; S.builtKey = '';
    S.students = S.students.map(s => s.id === id ? {...s, nom, prenom} : s); render();
    await updDoc('students/' + id, {nom, prenom}); toast('Étudiant renommé'); return;
  }
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!$('#overlay').hidden){ closeModal(); return; }
  if (S.panel){ closePanel(); return; }
  if (S.editing){ S.editing = null; S.builtKey = ''; render(); }
});
window.addEventListener('beforeunload', e => { if (window.EvalApp.busy()){ flushTexts(); e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushTexts(); });
window.addEventListener('hashchange', () => { S.route = parseRoute(); S.editing = null; closePanel(); hideTip(); render(); window.scrollTo(0, 0); });

/* ---------- Infobulles des graphiques ---------- */
const tipEl = $('#tip');
function placeTip(cx, cy){
  const r = tipEl.getBoundingClientRect(); let x = cx + 14, y = cy + 14;
  if (x + r.width > innerWidth - 8) x = cx - r.width - 14;
  if (y + r.height > innerHeight - 8) y = cy - r.height - 14;
  tipEl.style.left = Math.max(8, x) + 'px'; tipEl.style.top = Math.max(8, y) + 'px';
}
function showTip(el, cx, cy){
  const t = el.getAttribute('data-tip'); if (!t) return;
  tipEl.textContent = t; tipEl.hidden = false; placeTip(cx, cy);
  const c = el.getAttribute('data-cx'); const ch = document.getElementById('chCross');
  if (ch){ if (c){ ch.setAttribute('x1', c); ch.setAttribute('x2', c); ch.setAttribute('visibility', 'visible'); } else ch.setAttribute('visibility', 'hidden'); }
}
function hideTip(){ tipEl.hidden = true; const ch = document.getElementById('chCross'); if (ch) ch.setAttribute('visibility', 'hidden'); }
document.addEventListener('mouseover', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) showTip(el, e.clientX, e.clientY); else if (!tipEl.hidden) hideTip(); });
document.addEventListener('mousemove', e => { if (!tipEl.hidden) placeTip(e.clientX, e.clientY); });
document.addEventListener('focusin', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el){ const r = el.getBoundingClientRect(); showTip(el, r.left + r.width / 2, r.bottom); } });
document.addEventListener('focusout', () => hideTip());
window.addEventListener('scroll', () => { if (!tipEl.hidden) hideTip(); }, {passive:true});
let resizeT = 0;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (S.route.view === 'etudiant') scheduleRender(); }, 150); });

/* ---------- Démarrage ---------- */
async function start(){
  S.route = parseRoute(); applyBloc(); render();
  const c = window.claude;
  if (!c || typeof c.use !== 'function'){ S.phase = 'unavailable'; render(); return; }
  const [db, user, dl] = await Promise.all([c.use('db'), c.use('user'), c.use('downloads')].map(p => Promise.resolve(p).catch(() => null)));
  S.db = db; S.user = user; S.dl = dl;
  if (!db){ S.phase = 'unavailable'; render(); return; }
  if (user){
    try { S.me = await user.id(); } catch(e){}
    try { const can = await user.can('data.write'); if (can === false) S.canWrite = false; } catch(e){}
  }
  subscribeGlobal(); render();
}
start();
})();
