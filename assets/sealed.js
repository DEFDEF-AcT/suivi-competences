/* Ouvre un fichier chiffré livré avec l'application (outils/construire-*.mjs) :
   en-tête « PREV1 », identifiant de clé, IV, données AES-256-GCM compressées.
   La clé est lue dans la base (table app_keys), selon les droits du compte connecté. */
window.openSealed = async url => {
  const sb = window.Auth.client;
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) { const e = new Error('Fichier ' + url + ' introuvable (' + r.status + ').'); e.missing = r.status === 404; throw e; }
  const u8 = new Uint8Array(await r.arrayBuffer());
  const td = new TextDecoder();
  if (td.decode(u8.slice(0, 5)) !== 'PREV1') throw new Error('Format de fichier inconnu : ' + url);
  const n = u8[5], kid = td.decode(u8.slice(6, 6 + n));
  const iv = u8.slice(6 + n, 18 + n), ct = u8.slice(18 + n);
  const { data, error } = await sb.from('app_keys').select('key').eq('name', kid).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Clé de déchiffrement « ' + kid + ' » inaccessible pour ce compte.');
  const raw = Uint8Array.from(atob(data.key), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
};
