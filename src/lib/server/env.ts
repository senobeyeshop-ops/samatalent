import 'server-only'; // Règle 1 : le build échoue si un composant navigateur importe ce fichier
import { z } from 'zod';

// Les variables sont lues et vérifiées ici, et nulle part ailleurs.
// Deux groupes : sans les secrets serveur, les pages publiques restent en ligne
// et seules les fonctions qui en ont besoin échouent (avec une erreur générique).

const publicSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
});

const secretSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  RATE_LIMIT_SALT: z.string().min(32),
});

function read<T extends z.ZodTypeAny>(schema: T): z.infer<T> {
  // NEXT_PUBLIC_APP_URL est lu explicitement : Next le remplace par l'adresse figée
  // au build (celle de l'aperçu Netlify en test, celle du site en production).
  const parsed = schema.safeParse({ ...process.env, NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL });
  if (!parsed.success) {
    // On nomme les variables manquantes, jamais leurs valeurs.
    const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Configuration incomplète : ${missing}. Voir .env.example.`);
  }
  return parsed.data;
}

let pub: z.infer<typeof publicSchema> | null = null;
let sec: z.infer<typeof secretSchema> | null = null;

/** Variables publiques : adresse de l'app et accès Supabase protégé par la RLS. */
export function serverEnv() {
  return (pub ??= read(publicSchema));
}

/** Secrets serveur : clé service Supabase et sel de limitation de débit. */
export function secretEnv() {
  return (sec ??= read(secretSchema));
}
