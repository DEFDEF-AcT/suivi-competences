#!/usr/bin/env node
/* Chiffre l'artefact « Progression Atelier BTS MV.html » (AES-256-GCM), tel quel, pour l'onglet Progression du BTS.
   Le fichier reste illisible sur le site public ; la clé est dans la base (table app_keys, préfixe « prog- »),
   lisible seulement par les comptes ayant accès au BTS. Ajouter la clé à la base AVANT de publier le fichier.
   Usage : node outils/construire-progression.mjs "/chemin/Progression Atelier BTS MV.html" */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes, createCipheriv } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2];
if (!src) { console.error('Indiquez le fichier de progression (.html).'); process.exit(1); }
const html = readFileSync(src, 'utf8');
if (!/<script id="data" type="application\/json">/.test(html)) { console.error("Ce fichier n'est pas l'artefact de progression (bloc de données introuvable)."); process.exit(1); }
const kid = 'prog-' + new Date().toISOString().replace(/\D/g, '').slice(0, 12);
const key = randomBytes(32), iv = randomBytes(12);
const c = createCipheriv('aes-256-gcm', key, iv);
const ct = Buffer.concat([c.update(gzipSync(Buffer.from(html, 'utf8'), { level: 9 })), c.final(), c.getAuthTag()]);
const k = Buffer.from(kid, 'utf8');
writeFileSync(join(ROOT, 'assets/progression-atelier.bin'), Buffer.concat([Buffer.from('PREV1'), Buffer.from([k.length]), k, iv, ct]));
const kf = join(ROOT, 'outils/cles.local.json');
const keys = existsSync(kf) ? JSON.parse(readFileSync(kf, 'utf8')) : {};
keys[kid] = key.toString('base64');
writeFileSync(kf, JSON.stringify(keys, null, 1));
console.log('assets/progression-atelier.bin : clé ' + kid + ' (à ajouter à app_keys)');
