import 'server-only'; // Règle 1 : le build échoue si un composant navigateur importe ce fichier
import { z } from 'zod';

// Les variables secrètes sont lues et vérifiées ici, et nulle part ailleurs.
const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  RATE_LIMIT_SALT: z.string().min(32),
});

let cached: z.infer<typeof schema> | null = null;

export function serverEnv() {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // On nomme les variables manquantes, jamais leurs valeurs.
    const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Configuration incomplète : ${missing}. Voir .env.example.`);
  }
  cached = parsed.data;
  return cached;
}
