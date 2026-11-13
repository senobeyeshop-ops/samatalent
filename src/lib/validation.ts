import { z } from 'zod';

// Règle 9 — chaque saisie est vérifiée CÔTÉ SERVEUR avec ces schémas.
// Les mêmes limites existent dans la base (contraintes check) : double filet.

export const COUNTRIES = {
  SN: { name: 'Sénégal', dial: '221', len: 9 },
  CI: { name: "Côte d'Ivoire", dial: '225', len: 10 },
  ML: { name: 'Mali', dial: '223', len: 8 },
  BF: { name: 'Burkina Faso', dial: '226', len: 8 },
  NE: { name: 'Niger', dial: '227', len: 8 },
  TG: { name: 'Togo', dial: '228', len: 8 },
  BJ: { name: 'Bénin', dial: '229', len: 10 },
  GW: { name: 'Guinée-Bissau', dial: '245', len: 9 },
} as const;
export type CountryCode = keyof typeof COUNTRIES;
const countryCodes = Object.keys(COUNTRIES) as [CountryCode, ...CountryCode[]];

export const CATEGORIES = {
  emploi: 'Emplois',
  stage: 'Stages',
  services: 'Services',
  produits: 'Produits',
  chantiers: 'Chantiers & BTP',
  professionnels: 'Professionnels',
  evenementiel: 'Événementiel',
  numerique: 'Numérique & digital',
} as const;
const categorySlugs = Object.keys(CATEGORIES) as [keyof typeof CATEGORIES, ...(keyof typeof CATEGORIES)[]];

export const LISTING_TYPES = {
  emploi: "Offre d'emploi",
  stage: 'Stage',
  service: 'Service',
  produit: 'Produit',
  chantier: 'Chantier',
  profil: 'Je propose mon profil',
} as const;
const listingTypes = Object.keys(LISTING_TYPES) as [keyof typeof LISTING_TYPES, ...(keyof typeof LISTING_TYPES)[]];

// Texte « propre » : espaces nettoyés, caractères de contrôle interdits.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/;
const text = (min: number, max: number, label: string) =>
  z
    .string({ error: `${label} est obligatoire.` })
    .transform((s) => s.replace(/\r\n/g, '\n').trim())
    .pipe(
      z
        .string()
        .min(min, `${label} : ${min} caractères minimum.`)
        .max(max, `${label} : ${max} caractères maximum.`)
        .refine((s) => !CONTROL.test(s), `${label} contient des caractères interdits.`),
    );
const optionalText = (max: number, label: string) =>
  z
    .string()
    .optional()
    .transform((s) => (s ?? '').trim())
    .pipe(z.string().max(max, `${label} : ${max} caractères maximum.`).refine((s) => !CONTROL.test(s), `${label} contient des caractères interdits.`))
    .transform((s) => (s === '' ? null : s));

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email('Adresse email invalide.'));

/** Normalise un numéro local ou international en +<indicatif><numéro> pour le pays choisi. */
export function normalizePhone(raw: string, country: CountryCode): string | null {
  const c = COUNTRIES[country];
  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  else digits = c.dial + digits;
  if (!digits.startsWith(c.dial)) return null;
  const local = digits.slice(c.dial.length);
  if (!/^\d+$/.test(local) || local.length !== c.len) return null;
  return `+${digits}`;
}

export const profileSchema = z
  .object({
    display_name: text(2, 60, 'Le nom'),
    headline: optionalText(120, 'Le titre'),
    bio: optionalText(1500, 'La présentation'),
    skills: z
      .string()
      .optional()
      .transform((s) =>
        Array.from(
          new Set(
            (s ?? '')
              .split(',')
              .map((x) => x.trim())
              .filter(Boolean),
          ),
        ),
      )
      .pipe(
        z
          .array(z.string().max(40, 'Une compétence : 40 caractères maximum.').refine((s) => !CONTROL.test(s)))
          .max(15, '15 compétences maximum.'),
      ),
    city: optionalText(60, 'La ville'),
    country_code: z.enum(countryCodes, { error: 'Pays non pris en charge.' }),
    whatsapp: z.string().optional(),
    wave_number: z.string().optional(),
  })
  .transform((v, ctx) => {
    let wave_number: string | null = null;
    if (v.wave_number && v.wave_number.trim()) {
      wave_number = normalizePhone(v.wave_number, v.country_code);
      if (!wave_number) {
        ctx.addIssue({
          code: 'custom',
          path: ['wave_number'],
          message: `Numéro Wave invalide pour ${COUNTRIES[v.country_code].name} (+${COUNTRIES[v.country_code].dial}, ${COUNTRIES[v.country_code].len} chiffres).`,
        });
        return z.NEVER;
      }
    }
    let whatsapp: string | null = null;
    if (v.whatsapp && v.whatsapp.trim()) {
      whatsapp = normalizePhone(v.whatsapp, v.country_code);
      if (!whatsapp) {
        ctx.addIssue({
          code: 'custom',
          path: ['whatsapp'],
          message: `Numéro invalide pour ${COUNTRIES[v.country_code].name} (+${COUNTRIES[v.country_code].dial}, ${COUNTRIES[v.country_code].len} chiffres).`,
        });
        return z.NEVER;
      }
    }
    return { ...v, whatsapp, wave_number };
  });

export const listingSchema = z.object({
  type: z.enum(listingTypes, { error: "Type d'annonce invalide." }),
  category_slug: z.enum(categorySlugs, { error: 'Catégorie invalide.' }),
  title: text(5, 120, 'Le titre'),
  description: text(20, 5000, 'La description'),
  price_xof: z
    .string()
    .optional()
    .transform((s) => (s ?? '').replace(/[\s.]/g, ''))
    .pipe(
      z
        .string()
        .regex(/^\d{0,10}$/, 'Prix : chiffres uniquement, en FCFA.')
        .transform((s) => (s === '' ? null : Number(s)))
        .pipe(z.number().int().min(0).max(1_000_000_000, 'Prix trop élevé.').nullable()),
    ),
  price_negotiable: z
    .string()
    .optional()
    .transform((s) => s === 'on'),
  city: text(2, 60, 'La ville'),
  country_code: z.enum(countryCodes, { error: 'Pays non pris en charge.' }),
});

export const uuidSchema = z.uuid();

export const REPORT_REASONS = {
  arnaque: 'Arnaque (demande d’argent, faux recrutement…)',
  faux_profil: 'Faux profil / usurpation',
  contenu_inapproprie: 'Contenu choquant ou illégal',
  harcelement: 'Harcèlement',
  spam: 'Spam / publicité répétée',
  autre: 'Autre',
} as const;

export const reportSchema = z.object({
  target_type: z.enum(['listing', 'profile']),
  target_id: z.uuid('Cible invalide.'),
  reason: z.enum(Object.keys(REPORT_REASONS) as [keyof typeof REPORT_REASONS, ...(keyof typeof REPORT_REASONS)[]], {
    error: 'Choisissez un motif.',
  }),
  details: optionalText(1000, 'Les précisions'),
});

/** Convertit un FormData en objet simple (seulement les champs attendus). */
export function formToObject(form: FormData, keys: readonly string[]) {
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = form.get(k);
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

export function fieldErrors(error: z.ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_');
    fields[key] ??= issue.message;
  }
  return fields;
}

/** Évite les redirections ouvertes : seul un chemin interne est accepté. */
export function safeNextPath(next: string | null | undefined, fallback = '/') {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return fallback;
  return next;
}

export const orderSchema = z.object({
  quantity: z.coerce.number({ error: 'Quantité invalide.' }).int('Quantité invalide.').min(1, 'Au moins 1.').max(99, '99 au maximum.'),
  note: z
    .string()
    .max(500, '500 caractères maximum.')
    .refine((s) => !CONTROL.test(s), 'Caractères non autorisés.')
    .optional()
    .transform((s) => (s && s.trim() ? s.trim() : null)),
});

export const ORDER_ACTIONS = ['accept', 'refuse', 'confirm_paid', 'not_received', 'declare_paid', 'cancel'] as const;
export const paymentRefSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/\s+/g, ''))
  .pipe(z.union([z.literal(''), z.string().regex(/^[A-Za-z0-9-]{4,40}$/, 'Référence Wave : lettres, chiffres et tirets.')]));
