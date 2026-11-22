#!/usr/bin/env node
/* Ajoute un numéro de version (?v=…) aux fichiers de assets/ appelés par les pages HTML.
   À lancer avant chaque publication : le navigateur charge alors toujours un ensemble cohérent
   de fichiers, au lieu de mélanger une version gardée en cache et la nouvelle. */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const v = new Date().toISOString().replace(/\D/g, '').slice(0, 12);
for (const f of readdirSync(ROOT).filter(n => n.endsWith('.html'))) {
  const p = join(ROOT, f);
  const s = readFileSync(p, 'utf8');
  const out = s.replace(/((?:src|href)="assets\/[^"?]+)(?:\?v=\d+)?"/g, `$1?v=${v}"`);
  if (out !== s) { writeFileSync(p, out); console.log(f + ' → v=' + v); }
}
