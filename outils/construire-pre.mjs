#!/usr/bin/env node
/* Prépare l'interface PRE-VE pour l'application : la chiffre (AES-256-GCM) pour qu'elle puisse être
   publiée avec le reste du site sans que la banque de questions et ses réponses soient lisibles.
   La clé est générée à chaque fois et doit être ajoutée à la table public.app_keys AVANT la publication.

   Usage :
     node outils/construire-pre.mjs "/chemin/PRE-VE_Gestion_Formation_….html" [--donnees]

   Produit :
     assets/pre-ve.bin                    l'interface, son bloc de données vidé (les données sont dans la base)
     assets/pre-donnees-initiales.bin     (avec --donnees) les données du fichier, reprises à la toute première ouverture
     outils/cles.local.json               les clés à enregistrer dans la base (fichier jamais publié) */
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes, createCipheriv } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RE = /(<script id="preve-data" type="application\/json">)([\s\S]*?)(<\/script>)/;
const src = process.argv[2];
if (!src) { console.error('Indiquez le fichier PRE-VE (.html).'); process.exit(1); }
const html = readFileSync(src, 'utf8');
const m = html.match(RE);
if (!m || !/PRE-VE/.test(html)) { console.error("Ce fichier n'est pas une interface PRE-VE (bloc de données introuvable)."); process.exit(1); }

const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 12);
function seal(kid, text) {
  const key = randomBytes(32), iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(gzipSync(Buffer.from(text, 'utf8'), { level: 9 })), c.final(), c.getAuthTag()]);
  const k = Buffer.from(kid, 'utf8');
  return { file: Buffer.concat([Buffer.from('PREV1'), Buffer.from([k.length]), k, iv, ct]), key: key.toString('base64') };
}

const keys = {};
const ui = seal('pre-ve-' + stamp, html.replace(RE, (x, a, b, c) => a + 'null' + c));
writeFileSync(join(ROOT, 'assets/pre-ve.bin'), ui.file);
keys['pre-ve-' + stamp] = ui.key;
console.log('assets/pre-ve.bin : ' + ui.file.length + ' octets');

if (process.argv.includes('--donnees')) {
  const d = seal('pre-donnees-' + stamp, m[2].trim());
  writeFileSync(join(ROOT, 'assets/pre-donnees-initiales.bin'), d.file);
  keys['pre-donnees-' + stamp] = d.key;
  console.log('assets/pre-donnees-initiales.bin : ' + d.file.length + ' octets');
}
writeFileSync(join(ROOT, 'outils/cles.local.json'), JSON.stringify(keys, null, 1));
console.log('Clés écrites dans outils/cles.local.json : ' + Object.keys(keys).join(', '));
