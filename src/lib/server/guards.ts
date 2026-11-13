import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase/server';

/** Exige un utilisateur connecté et actif. À appeler en tête de chaque page/action protégée. */
export async function requireUser(nextPath = '/') {
  const { supabase, user } = await currentUser();
  if (!user) redirect(`/connexion?next=${encodeURIComponent(nextPath)}`);
  return { supabase, user };
}

/**
 * Règle 5 — 2e barrière admin (la 1re est le proxy, la 3e est la base :
 * les fonctions SQL admin_* refusent tout non-admin).
 */
export async function requireAdmin() {
  const { supabase, user } = await currentUser();
  if (!user) notFound();
  const [{ data: isAdmin }, { data: aal }] = await Promise.all([
    supabase.rpc('is_admin'),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  if (isAdmin !== true) notFound(); // ne révèle pas l'existence de l'admin
  if (aal?.currentLevel !== 'aal2') redirect('/connexion/mfa?next=/admin');
  return { supabase, user };
}
