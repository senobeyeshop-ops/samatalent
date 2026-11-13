# Backend — état au 10/11/2026

Code : `samatalent/`. Guide : `samatalent/README.md`.

## Fait et vérifié
- Auth Supabase : lien magique + Google, callback sécurisé, déconnexion locale / tous appareils, MFA TOTP admin
- Profil (public + WhatsApp privé + photo), publier, voir, rechercher, page talent, contact WhatsApp via serveur
- Photos : 5 par annonce + photo de profil, contrôlées et ré-encodées côté serveur
- Mes annonces : modifier, gérer les photos, renouveler, supprimer
- Signalements : annonce ou profil, masquage automatique à 3, file de modération admin, journal d'audit

## Checklist sécurité
- [x] secrets en variables d'env, `.env*` ignorés, `server-only` + scan du code navigateur (0 secret)
- [x] validation serveur Zod sur chaque action et même sur les paramètres d'URL (5 tests)
- [x] autorisation via RLS, testée avec 4 utilisateurs : 34 attaques bloquées + parcours admin autorisé
- [x] limites : connexion, profil, annonces, photos, avatar, signalements, contact WhatsApp — HMAC, fail-closed
- [x] sessions : jeton 1 h, cookies HttpOnly/Secure/SameSite, 30 min d'inactivité (15 admin), 7 j max
- [x] en-têtes : CSP à nonce (scripts), HSTS, X-Frame-Options, nosniff, Referrer, Permissions
- [x] contrôle d'origine sur toute écriture (403 testé), pas de redirection ouverte (testé)
- [x] erreurs génériques + référence ; logs masqués (testé) ; réponses API `no-store`
- [x] fichiers : 2 Mo, octets réels JPEG/PNG/WebP, anti-bombe 40 Mpx, ré-encodage WebP, GPS/EXIF retiré,
      nom généré par le serveur, buckets limités à WebP 2 Mo, écriture navigateur impossible (10 tests)
- [x] dépendances : 0 faille haute/critique, Dependabot ; `sharp` vérifié avant installation
- [x] CI : paquets réels, lint, tests, audit, gitleaks, build, attaques base, parcours admin
- [x] sauvegarde nocturne chiffrée (à activer avec 2 secrets GitHub)
- [ ] webhooks Wave signés — étape paiement (base prête : `create_boost_payment`, `confirm_payment`)
- [ ] plafond IA côté app — étape Studio (base prête : `ai_reserve`)
- [ ] politique de confidentialité listant Supabase, Netlify, Google, Resend, Wave

## Choix assumés
- CSP : `style-src-attr 'unsafe-inline'` pour les dimensions d'images de Next ; du CSS en attribut ne peut
  exécuter aucun code ; les scripts restent bloqués sans nonce.
- Masquage automatique à 3 signalements : un concurrent malveillant pourrait masquer une annonce avec
  3 comptes ; parade = limite de 10 signalements/jour/compte, bouton « Rétablir » et journal pour repérer l'abus.

## Reste ouvert, connu
- 6 alertes « modérées » dans les outils de lint (non livrés aux visiteurs).
- Google OAuth : écran de consentement à faire valider par Google avant ouverture large.
- Pas encore testé contre un vrai projet Supabase (stockage réel) : à faire en premier sur samatalent-dev.
