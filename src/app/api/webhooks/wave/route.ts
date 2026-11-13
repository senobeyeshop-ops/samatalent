import { z } from 'zod';
import { supabaseService } from '@/lib/supabase/server';
import { waveEnv } from '@/lib/server/wave';
import { verifyWaveSignature } from '@/lib/server/wave-signature';
import { json } from '@/lib/server/api';
import { log } from '@/lib/server/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Règle 15 — webhook Wave : SEULE source de vérité pour « paiement réussi ».
 * 1) corps brut lu tel quel (la signature porte sur les octets exacts)
 * 2) signature HMAC + fenêtre de 5 min (anti-faux, anti-rejeu)
 * 3) idempotence : chaque événement Wave n'est traité qu'une fois (webhook_events)
 * 4) montant et devise recomparés au prix enregistré en base (règle 14)
 * Pas de contrôle d'origine ici (le proxy l'exempte) : c'est la signature qui protège.
 */

const MAX_BODY = 64 * 1024;

const eventSchema = z.object({
  id: z.string().min(3).max(100),
  type: z.string().max(100),
  data: z.object({
    id: z.string().regex(/^cos-[A-Za-z0-9]+$/),
    amount: z.string().regex(/^\d{1,12}$/),
    currency: z.string().length(3),
    client_reference: z.string().max(255).nullable().optional(),
    payment_status: z.string().optional(),
  }),
});

export async function POST(request: Request) {
  const env = waveEnv();
  if (!env) return json(503, { ok: false }); // Wave pas encore configuré

  const len = Number(request.headers.get('content-length') ?? '0');
  if (len > MAX_BODY) return json(413, { ok: false });
  const raw = await request.text();
  if (raw.length > MAX_BODY) return json(413, { ok: false });

  const check = verifyWaveSignature(raw, request.headers.get('wave-signature'), env.WAVE_WEBHOOK_SECRET);
  if (!check.ok) {
    log.warn('wave.webhook.bad_signature', { reason: check.reason });
    return json(401, { ok: false });
  }

  let event: z.infer<typeof eventSchema>;
  try {
    event = eventSchema.parse(JSON.parse(raw));
  } catch {
    log.warn('wave.webhook.bad_payload');
    return json(200, { ok: true, ignored: 'payload' }); // signé mais inattendu : on n'insiste pas
  }

  const service = supabaseService();

  if (event.type === 'checkout.session.completed') {
    const { data, error } = await service.rpc('confirm_payment' as never, {
      p_provider: 'wave',
      p_event_id: event.id,
      p_provider_ref: event.data.id,
      p_amount_xof: Number(event.data.amount),
      p_currency: event.data.currency,
    } as never);
    if (error) {
      log.error('wave.webhook.confirm_failed', { code: error.code, eventId: event.id });
      return json(500, { ok: false }); // Wave réessaiera (jusqu'à 3 jours)
    }
    log.info('wave.webhook.completed', { eventId: event.id, session: event.data.id, result: data });
    return json(200, { ok: true });
  }

  if (event.type === 'checkout.session.payment_failed') {
    const paymentId = z.uuid().safeParse(event.data.client_reference).success ? event.data.client_reference : null;
    const { data, error } = await service.rpc('fail_payment' as never, {
      p_provider: 'wave',
      p_event_id: event.id,
      p_payment: paymentId,
      p_provider_ref: event.data.id,
    } as never);
    if (error) {
      log.error('wave.webhook.fail_failed', { code: error.code, eventId: event.id });
      return json(500, { ok: false });
    }
    log.info('wave.webhook.payment_failed', { eventId: event.id, result: data });
    return json(200, { ok: true });
  }

  return json(200, { ok: true, ignored: event.type });
}
