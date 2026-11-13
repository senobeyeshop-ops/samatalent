# Sama Talent

Réseau de talents et d'annonces pour le Sénégal et l'UEMOA (clone fonctionnel de KizzyTalent).
Ce qui marche :
- **connexion (lien magique ou Google) → profil avec photo → publier une annonce avec 5 photos → la voir → contacter sur WhatsApp**
- **Mes annonces** : modifier, gérer les photos, renouveler (60 j), supprimer
- **Signalements** : signaler une annonce ou un profil ; masquage automatique après 3 signalements ;
  file de modération admin (masquer, rétablir, suspendre l'auteur, rejeter), journal d'audit
- accueil, recherche, page publique d'un talent, admin protégé par code à 6 chiffres

Stack : Next.js 16 · Supabase (Postgres + Auth) · Netlify · PWA installable.

---

## État du déploiement (13/11/2026)
| élément | valeur |
| --- | --- |
| Site | https://samatalent.netlify.app (projet Netlify « samatalent », équipe OBEYE) |
| Code | github.com/senobeyeshop-ops/samatalent, branche `main` |
| Base production | Supabase `samatalent-prod` (eaxacivqiywkrphmgsio, Paris) — migrations 0001 à 0003 |
| Base de test | Supabase `samatalent-dev` (cqnsqkgyczgbngqfxxfs, Paris) — utilisée par les aperçus Netlify |
| Aperçus Netlify | protégés par la connexion de l'équipe Netlify |

Variables Netlify déjà réglées : `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`RATE_LIMIT_SALT` (une valeur pour la production, une autre pour les aperçus).
**À ajouter à la main :** `SUPABASE_SERVICE_ROLE_KEY` (clé secrète de chaque projet Supabase).

## Mise en route (≈ 30 min)

### 1. Deux projets Supabase (règle 20 : test ≠ production)
Sur supabase.com, dans ton organisation, crée **`samatalent-dev`** et **`samatalent-prod`** (région la plus proche : Europe West).
Dans **chacun** :
1. **SQL Editor** → exécute dans l'ordre `0001_init.sql`, `0002_photos_annonces_signalements.sql`,
   `0003_droits_fonctions.sql` (dossier `supabase/migrations/`). *Déjà fait pour samatalent-dev et samatalent-prod.*
   Les deux espaces de stockage `avatars` et `listings` sont créés par la 1re migration
   (2 Mo max, WebP uniquement, aucune écriture possible depuis le navigateur).
2. **Authentication → URL Configuration** :
   - *Site URL* : `http://localhost:3000` (dev) / `https://ton-domaine` (prod)
   - *Redirect URLs* : `http://localhost:3000/auth/callback` (dev) / `https://ton-domaine/auth/callback` (prod)
3. **Authentication → Sessions** (règle 8) : *Refresh token rotation* activé, *Reuse interval* 10 s ;
   *JWT expiry* (Project Settings → JWT) : **3600**.
4. **Authentication → Rate Limits** (règle 7) : emails 30/h, vérifications 30/5 min.
5. **Authentication → Multi-Factor** : activer **TOTP** (exigé pour l'admin).
6. **Authentication → Providers → Google** : colle l'ID client et le secret de ton projet Google Cloud
   (*APIs & Services → Credentials → OAuth client*, URI de redirection = celle donnée par Supabase).
7. **Authentication → Emails → SMTP** : brancher Resend (sinon Supabase limite à quelques emails/heure).

### 2. Variables d'environnement (règles 1 et 2)
```bash
cp .env.example .env.local     # .env.local est ignoré par git
```
Remplis avec les valeurs du projet **dev** (*Project Settings → API*).
Génère le sel : `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

### 3. Lancer en local
```bash
npm ci
npm run dev        # http://localhost:3000
npm run verify     # typage + lint + tests + secrets + audit
```

### 4. Te nommer admin
Après ta 1re connexion, dans le SQL Editor du projet concerné :
```sql
update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'TON_EMAIL');
```
Ouvre `/admin` : l'app te demandera de scanner un QR code (Google Authenticator) — obligatoire.

### 5. Mettre en ligne sur Netlify
1. Pousse le dossier sur un dépôt GitHub **privé** (les contrôles de `.github/workflows` se lancent seuls).
2. Netlify → *Add new project* → importe le dépôt (le build lance `npm run verify` avant de compiler).
3. *Site configuration → Environment variables* : les mêmes variables, avec des valeurs **différentes par contexte** :
   - *Production* → projet `samatalent-prod`, `NEXT_PUBLIC_APP_URL=https://ton-domaine`
   - *Deploy previews / Branch deploys* → projet `samatalent-dev`
   - Coche « *Contains secret values* » pour `SUPABASE_SERVICE_ROLE_KEY` et `RATE_LIMIT_SALT`.
4. *Domain management* : branche ton domaine ; HTTPS est automatique (règle 25). Décommente ensuite la redirection dans `netlify.toml`.

### 6. Sauvegarde nocturne (règle 26)
```bash
age-keygen -o samatalent-backup.key   # garde ce fichier HORS du projet, sur une clé USB
```
Dans GitHub → *Settings → Secrets → Actions* : `PROD_DB_URL` (chaîne de connexion *Session pooler*) et
`BACKUP_PUBLIC_KEY` (la ligne `age1…` affichée). Lance une fois *Actions → Sauvegarde base → Run workflow*.
Teste une restauration sur `samatalent-dev` une fois par mois (commande en tête de `sauvegarde.yml`).

---

## Contrôles disponibles
| commande | rôle |
| --- | --- |
| `npm run verify` | tout, avant chaque mise en ligne |
| `npm test` | 15 tests : validation, logs, redirections, et 10 fichiers piégés (GPS, faux JPEG, SVG, bombe…) |
| `npm run check:packages` | règle 19 — chaque dépendance existe vraiment |
| `npm run check:packages -- nom-du-paquet` | à lancer **avant** d'installer un paquet suggéré par une IA |
| `npm run check:secrets` / `check:secrets:build` | règle 21 — secrets dans le code / dans le code navigateur |
| `npm run audit:deps` | règle 22 — bloque si faille haute ou critique |
| CI *Sécurité* → job *database* | règles 3-5 — 34 attaques contre la base + parcours admin |

## Où est quoi
```
src/proxy.ts                 CSP à nonce, contrôle d'origine, expiration des sessions, garde des pages
src/lib/server/              env (secrets), log + redact (données perso masquées), errors, rate-limit, guards
src/lib/validation.ts        schémas Zod de toutes les saisies
src/app/connexion/           lien magique, Google, MFA admin
src/app/profil|publier|annonces|recherche|talents|admin
src/app/api/contact/[userId] WhatsApp via le serveur (numéro jamais dans les pages)
src/lib/server/image.ts      contrôle et ré-encodage des images (règle 11)
src/app/api/listings/[id]/photos · api/photos/[id] · api/profile/avatar   envois et suppressions
src/app/mes-annonces/        modifier, renouveler, supprimer
src/app/admin/signalements/  file de modération
supabase/migrations/         schéma + RLS
supabase/tests/              attaques contre la base
.github/workflows/           sécurité (à chaque push) + sauvegarde (chaque nuit)
```
