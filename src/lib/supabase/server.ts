import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { secretEnv, serverEnv } from '@/lib/server/env';

/**
 * Client « au nom de l'utilisateur » : il porte le jeton de la personne
 * connectée, donc chaque requête est filtrée par la RLS (règle 4).
 * C'est le client à utiliser partout par défaut.
 */
export async function supabaseUser() {
  const env = serverEnv();
  const store = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Appel depuis un composant serveur : le proxy rafraîchit déjà les cookies.
        }
      },
    },
  });
}

/**
 * Client « service » : CONTOURNE la RLS. Réservé aux tâches internes
 * (limitation de débit, webhooks, maintenance). Jamais pour lire ou écrire
 * des données d'utilisateur à sa place.
 */
let service: ReturnType<typeof createClient> | null = null;
export function supabaseService() {
  if (service) return service;
  const env = serverEnv();
  service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, secretEnv().SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return service;
}

/** Utilisateur vérifié auprès du serveur d'authentification (pas juste le cookie). */
export async function currentUser() {
  const supabase = await supabaseUser();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { supabase, user: null };
  return { supabase, user: data.user };
}
