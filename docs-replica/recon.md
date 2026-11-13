# Carte de reconnaissance — KizzyTalent → « Sama Talent » (Sénégal + UEMOA)

Original : https://kizzytalent.netlify.app/ (web, PWA mobile, Bénin)
Méthode : lecture de la page d'accueil publique uniquement. Aucune connexion,
aucun code source ni appel réseau privé copié. Les écrans derrière la connexion
sont **déduits** de la navigation visible (marqués « déduit »).

## 1. Périmètre

- **App** : place de marché de talents et d'annonces (emplois, stages, services,
  produits, chantiers, professionnels), mobile d'abord.
- **Boucle cœur** : je crée mon profil → je publie ou je cherche → je contacte
  (messagerie interne ou WhatsApp) → l'affaire se conclut hors plateforme.
- **Revenu** : mise en avant payante d'une annonce (« Boost » : en tête des
  résultats, bordure dorée). Ouvert à tous.
- **Clone** : « Sama Talent », 8 pays UEMOA (SN, CI, ML, BF, NE, TG, BJ, GW),
  FCFA (XOF), paiement Wave / Orange Money.

## 2. Sources

| source | URL | apport |
| --- | --- | --- |
| Page d'accueil | https://kizzytalent.netlify.app/ | positionnement, sections, nav, boost, Studio, étapes |
| Chaîne WhatsApp | lien depuis l'accueil | canal d'annonces (communauté) |

Pas de page tarifs, d'aide ni de store public trouvés : niveau de confiance
moyen sur tout ce qui est derrière la connexion.

## 3. Inventaire des écrans

| ID | écran | accès | rôle | composants clés | états |
| --- | --- | --- | --- | --- | --- |
| S01 | Accueil | `/` | accroche, recherche, catégories, dernières annonces, compteurs | barre de recherche, cartes catégorie, cartes annonce, bannière boost, bannière Studio | vide (0 talents), rempli |
| S02 | Recherche / « Chercheur » | onglet 2 | filtrer les annonces | recherche, filtres catégorie/ville/type, liste | vide, résultats, chargement |
| S03 | Détail annonce | clic sur carte | voir l'annonce, contacter | galerie, auteur, bouton Message, bouton WhatsApp, signaler | boostée, expirée |
| S04 | Profil public talent | clic auteur | vitrine du talent | photo, compétences, annonces, contact | — |
| S05 | Messages (liste) | onglet 3 | conversations | liste fils, badge non lu | vide, rempli |
| S06 | Conversation | clic fil | échanger | bulles, champ, envoi | — |
| S07 | Mon profil | onglet 4 | éditer photo, compétences, WhatsApp | formulaire, upload photo | incomplet, complet |
| S08 | Publier une annonce | CTA « Publier » | créer annonce | formulaire type/catégorie/titre/description/prix/lieu/photos | erreurs validation |
| S09 | Mes annonces | depuis profil (déduit) | gérer / supprimer / booster | liste, actions | — |
| S10 | Mettre en avant (Boost) | CTA « Mettre mon annonce en avant » | choisir durée, payer | formules, récap prix, bouton payer | attente paiement, payé, échec |
| S11 | Studio | carte « Studio Kizzy » | outils de création (déduit : bio, CV, visuel d'annonce) | outils, aperçu | quota atteint |
| S12 | Connexion / inscription | depuis Publier / Messages | authentification | email + lien magique / mot de passe, Google | erreur, bloqué |
| S13 | Admin | (déduit) | modérer annonces, signalements, comptes, paiements | tableaux | — |

## 4. Parcours

```
F01 Visiteur cherche un talent
    S01 → S02 (filtre) → S03 → contact WhatsApp ou S12 → S06
    cible : 3 clics jusqu'au contact
    edge : aucun résultat, annonce expirée, numéro absent

F02 Talent publie une annonce
    S01 CTA → S12 (si non connecté) → S07 (profil min.) → S08 → S03
    edge : photo trop lourde, mauvais format, champ manquant

F03 Talent booste son annonce
    S09 → S10 (choix durée) → Wave/OM checkout → webhook → S03 doré
    edge : paiement abandonné, webhook en double, prix trafiqué côté client

F04 Échange par messagerie
    S03 → S06 → S05
    edge : spam, harcèlement → signalement / blocage

F05 Studio
    S11 → génération IA (bio / CV / texte d'annonce) → copier dans S07/S08
    edge : quota IA dépassé

F06 Modération
    signalement S03 → S13 → masquer annonce / suspendre compte
```

## 5. Composants

Barre de navigation basse (4 onglets), barre de recherche, carte catégorie,
carte annonce (variante boostée dorée), badge compteur, bouton primaire / WhatsApp,
champ texte, select, upload d'image, toast, modal, bannière d'alerte arnaque,
bulle de message, avatar, état vide.

## 6. Modèle de données déduit

```
Profile      id, nom, photo, bio, compétences[], whatsapp, ville, pays, rôle
             preuve : étape « Créez votre profil » — confiance : haute
Category     slug, libellé, icône — preuve : « Parcourir par catégorie » — haute
Listing      id, auteur, type (emploi|stage|service|produit|chantier|pro),
             catégorie, titre, description, prix?, ville, pays, photos[], statut,
             boost_jusqua — preuve : « Dernières annonces », boost — haute
Conversation / Message — preuve : onglet Messages — haute
Boost / Payment — preuve : « Mettre mon annonce en avant » — haute (tarifs inconnus)
Report       signalement — preuve : bandeau arnaques — devinette
AI usage     usage Studio — devinette
```

## 7. Hors clonage

| élément | raison |
| --- | --- |
| Marque, logo, nom « Kizzy », textes | propriété de l'original — nom et textes réécrits |
| Talents et annonces existants | données de l'original |
| Chaîne WhatsApp et communauté | réseau de l'original — créer la vôtre |

## 8. Taille

13 écrans, 6 parcours, 9 entités. Parties dures : paiement mobile + webhooks,
messagerie temps réel, upload d'images sûr, plafond IA, sécurité (26 exigences).
**Taille : M** (quelques semaines).
