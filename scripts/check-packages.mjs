#!/usr/bin/env node
// Exigence 19 — vérifie que chaque dépendance existe vraiment sur npm,
// qu'elle n'est pas toute neuve et qu'elle est réellement utilisée.
// Protège contre le « slopsquatting » : un nom de paquet inventé par une IA,
// puis publié par un pirate avec du code piégé.
//
// Usage : node scripts/check-packages.mjs            (toutes les dépendances)
//         node scripts/check-packages.mjs nom1 nom2  (avant un npm install)
import { readFileSync } from 'node:fs';

const MIN_AGE_DAYS = 30;
const MIN_WEEKLY_DOWNLOADS = 1000;

const names = process.argv.slice(2).length
  ? process.argv.slice(2)
  : (() => {
      const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
      return Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    })();

let failed = 0;
for (const name of names) {
  const enc = name.replace('/', '%2F');
  const meta = await fetch(`https://registry.npmjs.org/${enc}`);
  if (meta.status === 404) {
    console.error(`✗ ${name} : N'EXISTE PAS sur npm — ne pas installer`);
    failed++;
    continue;
  }
  if (!meta.ok) {
    console.error(`? ${name} : registre injoignable (${meta.status})`);
    failed++;
    continue;
  }
  const data = await meta.json();
  const created = new Date(data.time?.created ?? 0);
  const ageDays = Math.floor((Date.now() - created.getTime()) / 86_400_000);

  let downloads = null;
  try {
    const dl = await fetch(`https://api.npmjs.org/downloads/point/last-week/${name}`);
    if (dl.ok) downloads = (await dl.json()).downloads ?? 0;
  } catch {
    // statistiques indisponibles : on garde le contrôle d'existence et d'âge
  }

  const problems = [];
  if (ageDays < MIN_AGE_DAYS) problems.push(`publié il y a ${ageDays} j`);
  if (downloads !== null && downloads < MIN_WEEKLY_DOWNLOADS)
    problems.push(`${downloads} téléchargements/semaine`);
  if (data.deprecated || data.versions?.[data['dist-tags']?.latest]?.deprecated)
    problems.push('déprécié');

  if (problems.length) {
    console.error(`⚠ ${name} : ${problems.join(', ')} — vérifier à la main`);
    failed++;
  } else {
    console.log(`✓ ${name} (${ageDays} j, ${downloads ?? '?'} /sem)`);
  }
}
process.exit(failed ? 1 : 0);
