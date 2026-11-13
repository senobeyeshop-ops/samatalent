import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/server/guards';
import { uuidSchema } from '@/lib/validation';
import { supabaseService } from '@/lib/supabase/server';
import { getCheckoutSession, waveEnv } from '@/lib/server/wave';
import { log } from '@/lib/server/log';
import { claimFreeBoost, startWaveCheckout } from './actions';

export const metadata: Metadata = { title: 'Booster l’annonce', robots: { index: false } };
export const dynamic = 'force-dynamic';

const MESSAGES: Record<string, { tone: 'ok' | 'danger'; text: string }> = {
  offert: { tone: 'ok', text: 'C’est parti : votre annonce est en tête des résultats pendant 7 jours, offerts.' },
  deja: { tone: 'danger', text: 'Votre Boost offert a déjà été utilisé sur ce compte.' },
  trop: { tone: 'danger', text: 'Trop de tentatives. Réessayez dans une heure.' },
  bientot: { tone: 'danger', text: 'Le paiement Wave arrive très bientôt.' },
  erreur: { tone: 'danger', text: 'Le paiement n’a pas pu démarrer. Aucun montant n’a été prélevé. Réessayez.' },
};

/**
 * Au retour de Wave, on revérifie le paiement directement auprès de Wave (serveur à serveur).
 * Le webhook reste la source principale ; ceci couvre le cas où il arrive en retard.
 */
async function reconcile(paymentId: string, userId: string) {
  const service = supabaseService();
  const { data } = await service
    .from('payments')
    .select('id, status, provider_ref, user_id')
    .eq('id', paymentId)
    .eq('user_id', userId)
    .maybeSingle();
  const pay = data as { id: string; status: string; provider_ref: string | null } | null;
  if (!pay || pay.status !== 'pending' || !pay.provider_ref || !waveEnv()) return pay?.status ?? null;
  try {
    const s = await getCheckoutSession(pay.provider_ref);
    if (s.payment_status === 'succeeded') {
      const { data: result } = await service.rpc('confirm_payment' as never, {
        p_provider: 'wave',
        p_event_id: `reconcile:${s.id}`,
        p_provider_ref: s.id,
        p_amount_xof: Number(s.amount),
        p_currency: s.currency,
      } as never);
      return result === 'ok' || result === 'already_paid' ? 'paid' : String(result);
    }
  } catch (e) {
    log.warn('boost.reconcile_failed', { paymentId, reason: e instanceof Error ? e.message : 'unknown' });
  }
  return 'pending';
}

export default async function BoostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; retour?: string; p?: string }>;
}) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const { supabase, user } = await requireUser(`/mes-annonces/${id}/booster`);
  const sp = await searchParams;

  let status: string | null = null;
  if (sp.retour && sp.p && uuidSchema.safeParse(sp.p).success) status = await reconcile(sp.p, user.id);

  const [{ data: l }, { data: plans }, { data: free }] = await Promise.all([
    supabase.from('listings').select('id, title, status, boosted_until').eq('id', id).eq('owner_id', user.id).maybeSingle(),
    supabase.from('boost_plans').select('code, label, days, price_xof').eq('active', true).order('price_xof'),
    supabase.from('free_boosts' as never).select('user_id').maybeSingle(),
  ]);
  if (!l || l.status === 'deleted') notFound();

  const boosted = l.boosted_until && new Date(l.boosted_until) > new Date();
  const msg = sp.msg ? MESSAGES[sp.msg] : null;
  const waveReady = waveEnv() !== null;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link href={`/mes-annonces/${id}`} className="text-sm text-ink-soft hover:underline">← Retour à l’annonce</Link>
        <h1 className="mt-2 text-2xl font-bold">Booster « {l.title} »</h1>
        <p className="mt-1 text-ink-soft">Votre annonce passe en tête des résultats de sa catégorie et de sa ville.</p>
      </div>

      {msg && (
        <p role="status" className={`rounded-xl px-4 py-3 text-sm ${msg.tone === 'ok' ? 'bg-ok/10 text-ok' : 'bg-danger/10 text-danger'}`}>{msg.text}</p>
      )}
      {status === 'paid' && <p role="status" className="rounded-xl bg-ok/10 px-4 py-3 text-sm text-ok">Paiement reçu, merci ! Votre Boost est actif.</p>}
      {status === 'pending' && <p role="status" className="rounded-xl bg-ink/5 px-4 py-3 text-sm">Paiement en cours de confirmation par Wave. Rechargez la page dans une minute.</p>}
      {sp.retour === 'echec' && status !== 'paid' && <p role="status" className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">Paiement annulé ou refusé. Aucun montant n’a été prélevé.</p>}

      {boosted && (
        <p className="card p-4 text-sm">🚀 Boost actif jusqu’au <strong>{new Date(l.boosted_until!).toLocaleDateString('fr-SN', { day: 'numeric', month: 'long' })}</strong>. Un nouveau Boost s’ajoute à la suite.</p>
      )}

      {l.status !== 'published' ? (
        <p className="card p-4 text-sm">Seule une annonce en ligne peut être boostée.</p>
      ) : (
        <>
          {!free && (
            <form action={claimFreeBoost} className="card border-2 border-ok p-5">
              <input type="hidden" name="id" value={l.id} />
              <p className="font-semibold">Premier Boost offert</p>
              <p className="mt-1 text-sm text-ink-soft">7 jours en tête, gratuit. Une fois par compte.</p>
              <button className="btn btn-primary mt-4 w-full">Activer mon Boost gratuit</button>
            </form>
          )}

          <div className="space-y-3">
            {(plans ?? []).map((p) => (
              <form key={p.code} action={startWaveCheckout} className="card flex items-center justify-between gap-4 p-5">
                <input type="hidden" name="id" value={l.id} />
                <input type="hidden" name="plan" value={p.code} />
                <div>
                  <p className="font-semibold">{p.label}</p>
                  <p className="text-sm text-ink-soft">{Number(p.price_xof).toLocaleString('fr-SN')} FCFA</p>
                </div>
                <button className="btn btn-primary" disabled={!waveReady}>{waveReady ? 'Payer avec Wave' : 'Bientôt disponible'}</button>
              </form>
            ))}
          </div>
          <p className="text-xs text-ink-soft">Paiement sécurisé sur l’application Wave. Sama Talent ne voit jamais votre code Wave.</p>
        </>
      )}
    </div>
  );
}
