'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/server/guards';
import { publicError, type ActionResult } from '@/lib/server/errors';
import { allow, fingerprint, LIMITS } from '@/lib/server/rate-limit';
import { fieldErrors, formToObject, listingSchema, uuidSchema } from '@/lib/validation';
import { supabaseService } from '@/lib/supabase/server';
import { log } from '@/lib/server/log';

const KEYS = ['type', 'category_slug', 'title', 'description', 'price_xof', 'price_negotiable', 'city', 'country_code'] as const;

async function guard(listingId: string) {
  if (!uuidSchema.safeParse(listingId).success) return { error: 'Annonce introuvable.' } as const;
  const { supabase, user } = await requireUser('/mes-annonces');
  if (!(await allow(fingerprint('listing-write', user.id), LIMITS.listingWrite))) {
    return { error: 'Trop de modifications. Patientez quelques minutes.' } as const;
  }
  return { supabase, user } as const;
}

/** Modifier MON annonce. Lié côté serveur à l'identifiant : `updateListing.bind(null, id)`. */
export async function updateListing(listingId: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const g = await guard(listingId);
  if ('error' in g) return { ok: false, error: g.error! };

  const parsed = listingSchema.safeParse(formToObject(form, KEYS));
  if (!parsed.success) return { ok: false, error: 'Corrigez les champs indiqués.', fields: fieldErrors(parsed.error) };

  // Règle 4 : .eq('owner_id', user.id) + RLS (listings_update_own) — double verrou.
  const { data, error } = await g.supabase
    .from('listings')
    .update(parsed.data)
    .eq('id', listingId)
    .eq('owner_id', g.user.id)
    .neq('status', 'deleted')
    .select('id')
    .maybeSingle();
  if (error) return publicError(error, 'listing.update');
  if (!data) return { ok: false, error: 'Annonce introuvable ou masquée par la modération.' };

  revalidatePath(`/annonces/${listingId}`);
  revalidatePath('/mes-annonces');
  return { ok: true };
}

export async function renewListing(form: FormData) {
  const id = String(form.get('id') ?? '');
  const g = await guard(id);
  if ('error' in g) redirect('/mes-annonces?msg=erreur');
  // La fonction SQL vérifie le propriétaire et la fenêtre des 7 derniers jours.
  const { error } = await g.supabase.rpc('renew_listing', { p_listing: id });
  if (error) {
    log.warn('listing.renew_refused', { listingId: id, code: error.code });
    redirect('/mes-annonces?msg=renouvellement');
  }
  revalidatePath('/mes-annonces');
  redirect('/mes-annonces?msg=renouvelee');
}

export async function deleteListing(form: FormData) {
  const id = String(form.get('id') ?? '');
  if (form.get('confirm') !== 'oui') redirect(`/mes-annonces/${id}?msg=confirmer`);
  const g = await guard(id);
  if ('error' in g) redirect('/mes-annonces?msg=erreur');

  const { data, error } = await g.supabase
    .from('listings')
    .update({ status: 'deleted' })
    .eq('id', id)
    .eq('owner_id', g.user.id)
    .select('id')
    .maybeSingle();
  if (error || !data) redirect('/mes-annonces?msg=erreur');

  // Les photos d'une annonce supprimée ne restent pas en ligne
  const { data: photos } = await g.supabase.from('listing_photos').delete().eq('listing_id', id).eq('owner_id', g.user.id).select('path');
  if (photos?.length) await supabaseService().storage.from('listings').remove(photos.map((p) => p.path));

  log.info('listing.deleted', { listingId: id });
  revalidatePath('/mes-annonces');
  revalidatePath('/');
  redirect('/mes-annonces?msg=supprimee');
}
