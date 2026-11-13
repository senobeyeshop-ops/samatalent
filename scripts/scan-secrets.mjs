#!/usr/bin/env node
// Règle 21 — cherche les secrets oubliés avant la mise en ligne.
// Contrôle rapide sans dépendance ; la CI lance aussi gitleaks sur tout l'historique.
//   node scripts/scan-secrets.mjs           → scanne le projet
//   node scripts/scan-secrets.mjs --build   → scanne aussi le code envoyé au navigateur (.next/static)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SKIP_DIRS = new Set(['node_modules', '.git', '.netlify', 'coverage']);
const SKIP_FILES = new Set(['.env.local', '.env', 'package-lock.json']); // .env* ignorés par git
const scanBuild = process.argv.includes('--build');

const RULES = [
  ['Clé Supabase service_role / JWT', /eyJhbGciOi[\w-]{10,}\.eyJ[\w-]{20,}\.[\w-]{20,}/],
  ['Clé Supabase secrète', /sb_secret_[A-Za-z0-9_-]{20,}/],
  ['Clé Wave', /wave_(sn|ci|ml|bf)_(prod|AKS|WHS)_[A-Za-z0-9_-]{16,}/i],
  ['Clé Groq', /gsk_[A-Za-z0-9]{30,}/],
  ['Clé OpenAI', /sk-(proj-)?[A-Za-z0-9_-]{32,}/],
  ['Clé Anthropic', /sk-ant-[A-Za-z0-9_-]{30,}/],
  ['Clé Resend', /re_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}/],
  ['Clé Google', /AIza[0-9A-Za-z_-]{35}/],
  ['Clé AWS', /AKIA[0-9A-Z]{16}/],
  ['Jeton GitHub', /gh[pousr]_[A-Za-z0-9]{36,}/],
  ['Clé privée', /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['URL Postgres avec mot de passe', /postgres(ql)?:\/\/[^:\s]+:[^@\s]{6,}@/],
];
// Dans le code envoyé au navigateur, ces NOMS ne doivent jamais apparaître
const SERVER_ONLY_NAMES = ['SUPABASE_SERVICE_ROLE_KEY', 'WAVE_API_KEY', 'WAVE_WEBHOOK_SECRET', 'GROQ_API_KEY', 'RESEND_API_KEY', 'RATE_LIMIT_SALT'];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    if (name === '.next' && !scanBuild) continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) yield* walk(p);
    else if (!SKIP_FILES.has(name) && s.size < 5_000_000) yield p;
  }
}

const findings = [];
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  if (rel.startsWith('.next') && !rel.startsWith('.next/static')) continue;
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { continue; }
  for (const [label, re] of RULES) if (re.test(text)) findings.push(`${rel} : ${label}`);
  if (rel.startsWith('.next/static'))
    for (const n of SERVER_ONLY_NAMES) if (text.includes(n)) findings.push(`${rel} : nom de secret serveur « ${n} » dans le code navigateur`);
}

if (findings.length) {
  console.error('✗ Secrets potentiels trouvés :\n  ' + findings.join('\n  '));
  console.error('→ Retirez-les, mettez-les dans une variable d’environnement, et RÉVOQUEZ la clé chez le fournisseur.');
  process.exit(1);
}
console.log(`✓ Aucun secret trouvé${scanBuild ? ' (code source + code navigateur)' : ''}.`);
