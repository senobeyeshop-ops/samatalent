'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/server/guards';
import { allow, fingerprint, LIMITS } from '@/lib/server/rate-limit';
import { uuidSchema } from '@/lib/validation';
import { supabaseService } from '@/lib/supabase/server';
import { appUrl } from '@/lib/server/app-url';
import { createCheckoutSession, waveEnv } from '@/lib/server/wave';
import { log } from '@/lib/server/log';

const PLANS = new Set(['boost_7j', 'boost_30j']);
const back = (id: string, msg: string): never => redirect(`/mes-annonces/${id}/booster?msg=${msg}`);

async function guard(form: FormData) {
  const id = String(form.get('id') ?? '');
  if (!uuidSchema.safeParse(id).success) redirect('/mes-annonces');
  const { supabase, user } = await requireUser(`/mes-annonces/${id}/booster`);
  if (!(await allow(fingerprint('boost', user.id), LIMITS.boostCheckout))) back(id, 'trop');
  return { id, supabase, user };
}

/** Premier Boost offert (7 jours). La base garantit « une fois par compte ». */
export async function claimFreeBoost(form: FormData) {
  const { id, supabase } = await guard(form);
  const { error } = await supabase.rpc('claim_free_boost' as never, { p_listing: id } as never);
  if (error) {
    log.warn('boost.free_refused', { listingId: id, code: error.code });
    back(id, error.code === '23505' ? 'deja' : 'erreur');
  }
  revalidatePath('/mes-annonces');
  back(id, 'offert');
}

/**
 * Boost payant via Wave.
 * Règle 14 : le navigateur n'envoie que le CODE du forfait ; le prix est lu en base
 * par create_boost_payment, puis transmis tel quel à Wave.
 */
export async function startWaveCheckout(form: FormData) {
  const { id, supabase } = await guard(form);
  const plan = String(form.get('plan') ?? '');
  if (!PLANS.has(plan)) back(id, 'erreur');
  if (!waveEnv()) back(id, 'bientot');

  const { data, error } = await supabase.rpc('create_boost_payment', { p_listing: id, p_plan: plan, p_provider: 'wave' });
  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row) {
    log.warn('boost.create_refused', { listingId: id, code: error?.code });
    back(id, error?.code === '54000' ? 'trop' : 'erreur');
  }
  const { payment_id: paymentId, amount_xof: amount } = row as { payment_id: string; amount_xof: number };

  const service = supabaseService();
  let launchUrl: string;
  try {
    const session = await createCheckoutSession({
      amountXof: Number(amount),
      paymentId,
      successUrl: appUrl(`/mes-annonces/${id}/booster?retour=ok&p=${paymentId}`).toString(),
      errorUrl: appUrl(`/mes-annonces/${id}/booster?retour=echec&p=${paymentId}`).toString(),
    });
    const { error: attachError } = await service.rpc('attach_payment_ref' as never, {
      p_payment: paymentId,
      p_provider_ref: session.id,
    } as never);
    if (attachError) throw new Error(`attach_${attachError.code}`);
    launchUrl = session.wave_launch_url;
  } catch (e) {
    log.error('boost.wave_checkout_failed', { paymentId, reason: e instanceof Error ? e.message : 'unknown' });
    await service.rpc('fail_payment' as never, {
      p_provider: 'wave', p_event_id: null, p_payment: paymentId, p_provider_ref: null,
    } as never);
    back(id, 'erreur');
  }
  redirect(launchUrl!); // vers l'application ou la page Wave (https, validé par Zod)
}
