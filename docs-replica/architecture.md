# Architecture — Sama Talent (clone KizzyTalent, Sénégal + UEMOA)

Entrées : `replica/recon.md`, `replica/features.csv`.
Schéma : `replica/schema.sql` (migration 0001) — testé sur Postgres 16 avec
`replica/tests_securite.sql` : 17 attaques, 17 bloquées.

---

## 1. Stack

| couche | choix | pourquoi |
| --- | --- | --- |
| app web | Next.js 15 (App Router) + TypeScript | rendu serveur = vérifications côté serveur naturelles |
| style | Tailwind | mobile d'abord, rapide |
| mobile | PWA installable (manifest + service worker) | comme tes autres apps, pas de store à gérer |
| base | Postgres sur Supabase (**2 projets : `samatalent-dev` et `samatalent-prod`**) | RLS intégré, base de test séparée |
| accès données | `@supabase/ssr` + requêtes du SDK (toujours paramétrées) + fonctions SQL | pas de SQL concaténé |
| auth | Supabase Auth (email + lien magique, Google) ; MFA obligatoire pour l'admin | service reconnu, rien à inventer |
| validation | Zod sur chaque route / action serveur | une seule source de vérité |
| paiement | Wave Checkout API (+ Orange Money via agrégateur en phase 2) | moyens réels au Sénégal |
| email | Resend | notifications de messages |
| fichiers | Supabase Storage, upload via le serveur seulement, `sharp` pour ré-encoder | contrôle total du fichier |
| IA (Studio) | Groq (Llama) derrière une route serveur à budget plafonné | peu cher, rapide |
| tâches | Netlify Scheduled Functions (maintenance) + GitHub Actions (sauvegarde) | gratuit |
| hébergement | Netlify, domaine perso, HTTPS forcé | ton habitude |

Une base, pas de microservices.

## 2. Schéma (résumé)

17 tables : `countries`, `categories`, `profiles`, `profile_private`, `listings`,
`listing_photos`, `conversations`, `messages`, `blocks`, `reports`, `audit_log`,
`boost_plans`, `payments`, `webhook_events`, `app_settings`, `ai_usage`, `rate_limits`.

Décisions clés :
- **WhatsApp isolé** dans `profile_private`, lisible par le seul propriétaire.
  Le bouton « WhatsApp » appelle une route serveur qui vérifie la connexion,
  limite les clics, puis redirige vers `wa.me` (pas de récolte massive de numéros).
- **Droits par colonne** : l'utilisateur ne peut écrire ni `role`, ni `status`
  de son profil, ni `boosted_until` de son annonce.
- **Prix en base** (`boost_plans`), paiement créé par `create_boost_payment()`.
- **Tables internes** (`ai_usage`, `rate_limits`, `webhook_events`, `app_settings`,
  `audit_log`) : RLS active sans politique = fermées aux clients.
- FCFA en entiers (`bigint`), dates en `timestamptz`.
- Admin : le rôle ne se donne qu'à la main dans la console SQL de prod
  (`update profiles set role='admin' where id='…'`), jamais par l'app.

## 3. API (routes serveur)

**Auth** — gérée par Supabase (`/auth/callback`), plus :
| méthode chemin | rôle | qui | entrée | sortie |
| --- | --- | --- | --- | --- |
| POST /api/auth/magic-link | envoyer le lien | public, limité 5/15 min par IP et par email | email | 204 |

**Annonces (F01, F02)**
| méthode chemin | rôle | qui | entrée | sortie |
| --- | --- | --- | --- | --- |
| GET /api/listings | recherche + filtres, boostées en tête | public | q, catégorie, type, pays, ville, page | liste |
| GET /api/listings/[id] | détail | public | id uuid | annonce + photos |
| POST /api/listings | créer | connecté actif, 10/jour | Zod ListingInput | annonce |
| PATCH /api/listings/[id] | modifier | propriétaire (RLS) | Zod partiel | annonce |
| DELETE /api/listings/[id] | supprimer (status=deleted) | propriétaire | — | 204 |
| POST /api/listings/[id]/photos | ajouter photo | propriétaire, 20/h | multipart, 1 fichier | photo |
| GET /api/contact/[userId]/whatsapp | redirection WhatsApp | connecté, 20/h | — | 302 wa.me |

**Profil**
| PATCH /api/profile | modifier son profil | connecté | Zod ProfileInput | profil |
| POST /api/profile/avatar | photo de profil | connecté, 10/h | multipart | chemin |
| GET /api/profile/export | export de mes données | connecté, 3/jour | — | JSON |
| DELETE /api/profile | supprimer mon compte | connecté + reconfirmation | — | 204 |

**Messagerie (F04)**
| POST /api/conversations | démarrer (RPC `start_conversation`) | connecté | userId, listingId? | id |
| POST /api/conversations/[id]/messages | envoyer | participant, 30/min | body ≤ 2000 | message |
| POST /api/conversations/[id]/read | marquer lu | participant | — | 204 |
| POST /api/blocks · DELETE /api/blocks/[id] | bloquer / débloquer | connecté | userId | 204 |
| POST /api/reports | signaler | connecté, 10/jour | Zod ReportInput | 201 |

**Paiement (F03)**
| POST /api/boost/checkout | crée le paiement (prix en base) puis la session Wave | propriétaire | listingId, plan, provider | URL de paiement |
| POST /api/webhooks/wave | confirmation | Wave (signature vérifiée) | corps brut | 200 / 400 |

**Studio IA (F05)**
| POST /api/studio | génère bio / CV / texte d'annonce | connecté, quota 10/jour, plafond global | tool, brief ≤ 800 car. | texte |

**Admin (F06)** — tout sous `/admin`, rôle admin + MFA (AAL2) vérifiés côté serveur
| GET /api/admin/reports · listings · users · payments | listes | admin | filtres | listes |
| POST /api/admin/listings/[id]/status | masquer / republier | admin | status, raison | 204 |
| POST /api/admin/users/[id]/status | suspendre / réactiver | admin | status, raison | 204 |
| POST /api/admin/reports/[id] | traiter un signalement | admin | status | 204 |

**Tâches**
| quoi | quand | comment |
| --- | --- | --- |
| `run_maintenance()` : expiration annonces 60 j, paiements en attente > 2 h, nettoyage | toutes les heures | Netlify Scheduled Function (clé service_role côté serveur) |
| Sauvegarde base | chaque nuit 02:00 UTC | GitHub Action `pg_dump` chiffré, 30 jours conservés |

## 4. Tes 26 exigences — où et comment, expliqué simplement

Chaque ligne : **la faille** (ce qu'un pirate ferait) → **la parade**.

### Secrets et configuration
1. **Clés hors du code** — *Faille :* une clé dans le code finit sur GitHub, des robots la trouvent en minutes et vident ton compte IA ou ta base. *Parade :* tout dans `process.env`. Seules les variables `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY` vont au navigateur (elles sont faites pour). `SUPABASE_SERVICE_ROLE_KEY`, `WAVE_API_KEY`, `WAVE_WEBHOOK_SECRET`, `GROQ_API_KEY`, `RESEND_API_KEY` ne sont lues que dans `lib/server/*` qui commence par `import 'server-only'` (le build plante si un composant client l'importe). Un fichier `.env.example` sans valeurs documente la liste.
2. **`.env` dans `.gitignore`** — *Faille :* même chose, par oubli. *Parade :* `.gitignore` contient `.env`, `.env*.local`, `.env.production` ; seul `.env.example` est versionné.
20. **Base de test séparée** — *Faille :* un test qui efface tout efface les vrais clients. *Parade :* deux projets Supabase ; `.env.local` pointe sur `dev`, les variables Netlify de production pointent sur `prod`. Les Deploy Previews utilisent `dev`.

### Base de données et accès
3. **Base non ouverte** — *Faille :* sur Supabase, la clé « anon » est publique ; sans RLS, n'importe qui lit toute la base avec. *Parade :* RLS active sur les 17 tables, droits retirés puis redonnés colonne par colonne (testé : T6, T13).
4. **Chacun ne voit que ses données, vérifié côté serveur** — *Faille :* changer un id dans l'URL pour lire le message d'un autre (« IDOR »). *Parade :* la règle est dans la base elle-même, donc même un appel direct à l'API Supabase est filtré ; les routes serveur utilisent le client de l'utilisateur (pas la clé service) pour hériter de ces règles (testé : T1, T4, T10, T11).
10. **Requêtes paramétrées** — *Faille :* l'injection SQL, taper `' OR 1=1 --` dans la recherche pour sortir la base. *Parade :* uniquement le SDK Supabase et des fonctions SQL avec paramètres ; recherche via `textSearch` / `websearch_to_tsquery`. Règle de revue : aucune chaîne SQL construite avec `+` ou `${}`.
26. **Sauvegarde automatique** — *Faille :* une erreur, un pirate ou un bug efface tout, sans retour possible. *Parade :* GitHub Action nocturne `pg_dump` → fichier chiffré (`age`) stocké en artefact privé 30 jours ; secret `PROD_DB_URL` dans GitHub. Test de restauration une fois par mois sur `dev`. (Si tu passes Supabase Pro, ses sauvegardes quotidiennes s'ajoutent.)

### Connexion et sessions
6. **Service de connexion reconnu** — *Faille :* un système maison stocke mal les mots de passe. *Parade :* Supabase Auth, lien magique + Google ; on ne stocke aucun mot de passe nous-mêmes.
7. **Limiter les tentatives** — *Faille :* essayer des milliers de combinaisons (force brute) ou spammer les emails. *Parade :* limites intégrées de Supabase Auth + notre `hit_rate_limit()` en base (clé = empreinte SHA-256 de l'IP ou de l'email, jamais en clair) sur connexion, publication, messages, contact WhatsApp, IA (testé : T17). Réponse 429 générique.
8. **Sessions qui expirent** — *Faille :* un téléphone volé reste connecté pour toujours. *Parade :* jeton d'accès 1 h avec rotation des jetons de rafraîchissement (réglage Supabase), cookies `HttpOnly; Secure; SameSite=Lax`, et déconnexion après 30 min d'inactivité (cookie `last_seen` vérifié par le middleware), 7 jours maximum ; admin : 15 min d'inactivité.
5. **Pages admin protégées** — *Faille :* deviner l'adresse `/admin` et entrer. *Parade :* triple barrière : le middleware redirige si pas admin ; chaque page et route admin revérifie `is_admin()` côté serveur ; les fonctions SQL admin refusent sinon (testé : T9). Plus MFA (code TOTP) exigé pour l'admin et journal `audit_log` de chaque action.

### Saisies, fichiers, navigateur
9. **Chaque saisie vérifiée côté serveur** — *Faille :* contourner le formulaire et envoyer n'importe quoi directement à l'API. *Parade :* schéma Zod sur chaque route (longueurs, formats, listes fermées, téléphone `+221…` selon le pays), et en plus des contraintes `check` dans la base. Le formulaire côté navigateur n'est qu'un confort.
11. **Type et taille des fichiers** — *Faille :* envoyer un « .jpg » qui est en réalité un script, ou un fichier de 2 Go pour faire tomber le serveur. *Parade :* 2 Mo max, lecture des octets réels (`file-type`) → seulement JPEG/PNG/WebP, puis ré-encodage par `sharp` en WebP 1200 px, ce qui détruit tout contenu caché et retire les données GPS (EXIF). Nom de fichier généré par nous (`uuid.webp`). Buckets limités à 2 Mo et `image/webp` ; aucune écriture directe depuis le navigateur.
12. **En-têtes de sécurité** — *Faille :* afficher ton site dans un cadre piégé (clickjacking), injecter du script. *Parade :* dans `netlify.toml` : `Content-Security-Policy` stricte, `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (caméra, micro, géoloc coupés).
13. **Limiter les appels à ton domaine (CORS)** — *Faille :* un autre site utilise le navigateur de ta victime pour appeler ton API. *Parade :* les routes `/api/*` refusent toute requête dont l'`Origin` n'est pas `APP_URL` (sauf le webhook Wave, protégé par signature) ; pas de `Access-Control-Allow-Origin: *`.
25. **HTTPS forcé** — *Faille :* sur un Wi-Fi public, quelqu'un lit les échanges en clair. *Parade :* certificat Netlify automatique, redirection HTTP→HTTPS forcée, HSTS 2 ans avec `includeSubDomains`.

### Argent
14. **Prix calculés côté serveur** — *Faille :* modifier le prix dans le navigateur pour payer 1 FCFA. *Parade :* le navigateur n'envoie que le code de la formule ; le montant vient de `boost_plans` dans `create_boost_payment()`, et le webhook rejette un montant différent (testé : T12, T14).
15. **Signature des webhooks** — *Faille :* envoyer un faux « paiement réussi » à ton adresse de webhook. *Parade :* lecture du corps brut, en-tête `Wave-Signature: t=…,v1=…`, HMAC-SHA256 de `timestamp + corps` avec `WAVE_WEBHOOK_SECRET`, comparaison à temps constant, refus si plus de 5 min d'écart ; idempotence par `webhook_events` (testé : T15). Wave fournit le secret à l'enregistrement de l'URL ; test sur un vrai paiement avant lancement.
16. **Plafond de dépenses IA** — *Faille :* un robot appelle ton Studio en boucle et ta facture explose. *Parade :* `ai_reserve()` refuse au-delà de 10 générations/jour/utilisateur et de 20 USD/mois au total (verrou anti-course), `max_tokens` 600, brief ≤ 800 caractères ; plus un plafond de facturation fixé chez le fournisseur IA (testé : T16).

### Erreurs et journaux
17. **Erreurs détaillées cachées** — *Faille :* un message d'erreur qui révèle le nom des tables aide le pirate. *Parade :* l'utilisateur voit « Une erreur est survenue (réf. 8F3A2C) » ; le détail reste dans le journal serveur sous cette référence. Pages `error.tsx` et `not-found.tsx` neutres, `productionBrowserSourceMaps: false`.
18. **Aucune donnée personnelle dans les logs** — *Faille :* les journaux fuitent et contiennent emails et numéros. *Parade :* un seul logger (`lib/server/log.ts`) qui masque automatiquement emails, téléphones, jetons et en-têtes `authorization`/`cookie` ; on journalise des identifiants uuid, jamais des contenus de messages.

### Dépendances et mise en ligne
19. **Chaque paquet existe vraiment** — *Faille :* une IA invente un nom de paquet, un pirate publie un paquet piégé sous ce nom (« slopsquatting »). *Parade :* script `scripts/check-packages.mjs` qui interroge le registre npm pour chaque dépendance (existe, âge > 30 jours, téléchargements), `package-lock.json` versionné, `npm ci` en CI.
21. **Chercher les secrets oubliés** — *Parade :* `gitleaks` en pré-commit et dans la CI, plus scan de l'historique complet avant la mise en ligne.
22. **Dépendances à risque** — *Parade :* `npm audit --audit-level=high` bloque la CI, Dependabot hebdomadaire.
23. **OWASP Top 10 (2025)** — vérifié point par point en fin de build :
    A01 contrôle d'accès → RLS + vérifs serveur · A02 mauvaise configuration → en-têtes, RLS partout, pas de debug en prod · A03 chaîne d'approvisionnement → points 19, 21, 22 · A04 cryptographie → HTTPS/HSTS, rien de chiffré « maison » · A05 injection → Zod + requêtes paramétrées + CSP · A06 conception → prix serveur, idempotence, quotas · A07 authentification → Supabase Auth, limites, MFA admin, expiration · A08 intégrité → signature webhook, lockfile · A09 journalisation et alertes → `audit_log`, logs sans données perso, alerte email si pic d'erreurs 5xx · A10 gestion des cas d'erreur → erreurs génériques, transactions SQL, paiements expirés nettoyés.
24. **Expliquer chaque faille** — c'est cette section.

## 5. Les parties qui piquent

- **Fuseaux** : tout en UTC en base ; affichage `Africa/Dakar` (UTC+0, comme Abidjan, Bamako, Lomé… ; Niger et Bénin sont en UTC+1).
- **Webhooks en double** : `webhook_events` + statut `paid` vérifié.
- **Course webhook / création** : le paiement est créé `pending` avant d'appeler Wave.
- **Arnaques** : bandeau, signalement, suspension qui masque toutes les annonces, WhatsApp jamais exposé publiquement.
- **Recherche** : plein texte français Postgres ; suffisant jusqu'à ~100 000 annonces.
- **Temps réel** : Supabase Realtime sur `messages` (respecte la RLS).
- **Données personnelles** : export et suppression de compte (loi sénégalaise 2008-12 / CDP), annonces expirées à 60 j.
- **Orange Money** : pas d'API marchand directe simple ; passer par un agrégateur (phase 2), même schéma de signature.

## 6. Ordre de construction

1. **Tranche verticale** — S12 connexion → S07 profil → S08 publier → S01/S03 voir l'annonce. Tables : profiles, profile_private, listings. Routes : auth, POST/GET listings. Avec dès le départ : `.env`, `.gitignore`, en-têtes, Zod, logger, gestion d'erreurs, gitleaks.
2. **Indispensables** — S02 recherche, photos (S08), S05/S06 messagerie, signalements, S09 mes annonces, S10 boost Wave + webhook, S13 admin + MFA, export / suppression de compte.
3. **Souhaitables** — S11 Studio IA plafonné, emails de notification, blocage, expiration auto.
4. **Mise en ligne** — passe sécurité (points 19, 21, 22, 23), HTTPS/HSTS, sauvegarde nocturne + test de restauration, `npm audit` vert.
