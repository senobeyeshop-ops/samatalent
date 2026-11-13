'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/server/guards';
import { publicError, type ActionResult } from '@/lib/server/errors';
import { allow, fingerprint, LIMITS } from '@/lib/server/rate-limit';
import { fieldErrors, formToObject, profileSchema } from '@/lib/validation';

const KEYS = ['display_name', 'headline', 'bio', 'skills', 'city', 'country_code', 'whatsapp', 'wave_number'] as const;

export async function updateProfile(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser('/profil');

  if (!(await allow(fingerprint('profile', user.id), LIMITS.updateProfile))) {
    return { ok: false, error: 'Trop de modifications. Réessayez dans une heure.' };
  }

  // Règle 9 : seuls les champs attendus sont lus, puis validés
  const parsed = profileSchema.safeParse(formToObject(form, KEYS));
  if (!parsed.success) {
    return { ok: false, error: 'Corrigez les champs indiqués.', fields: fieldErrors(parsed.error) };
  }
  const { whatsapp, wave_number, ...pub } = parsed.data;

  // Règle 4 : client utilisateur → la RLS n'autorise que SA ligne.
  // Règle 10 : le SDK envoie des requêtes paramétrées, aucune concaténation SQL.
  const p1 = await supabase.from('profiles').update(pub).eq('id', user.id);
  if (p1.error) return publicError(p1.error, 'profile.update');

  const p2 = await supabase.from('profile_private').update({ whatsapp, wave_number }).eq('user_id', user.id);
  if (p2.error) return publicError(p2.error, 'profile.private.update');

  revalidatePath('/profil');
  return { ok: true };
}
