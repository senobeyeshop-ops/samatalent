'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/server/guards';
import { publicError, type ActionResult } from '@/lib/server/errors';
import { allow, fingerprint, LIMITS } from '@/lib/server/rate-limit';
import { fieldErrors, formToObject, listingSchema } from '@/lib/validation';
import { log } from '@/lib/server/log';

const KEYS = ['type', 'category_slug', 'title', 'description', 'price_xof', 'price_negotiable', 'city', 'country_code'] as const;

export async function createListing(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser('/publier');

  // Règle 7 : 10 annonces par jour et par compte
  if (!(await allow(fingerprint('listing', user.id), LIMITS.createListing))) {
    return { ok: false, error: 'Limite de 10 annonces par jour atteinte.' };
  }

  // Règle 9 : liste blanche de champs + validation serveur.
  // Les champs sensibles (boosted_until, status admin, owner_id) ne sont jamais lus
  // depuis le formulaire, et la base refuse de toute façon de les écrire.
  const parsed = listingSchema.safeParse(formToObject(form, KEYS));
  if (!parsed.success) {
    return { ok: false, error: 'Corrigez les champs indiqués.', fields: fieldErrors(parsed.error) };
  }

  const { data, error } = await supabase
    .from('listings')
    .insert({ ...parsed.data, owner_id: user.id, status: 'published' })
    .select('id')
    .single();

  if (error || !data) return publicError(error, 'listing.create');

  log.info('listing.created', { listingId: data.id }); // un identifiant, jamais le contenu
  revalidatePath('/');
  redirect(`/mes-annonces/${data.id}?publiee=1`);
}
