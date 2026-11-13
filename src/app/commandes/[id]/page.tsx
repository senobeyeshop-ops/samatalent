import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/server/guards';
import { uuidSchema } from '@/lib/validation';
import { formatDate } from '@/lib/format';
import { ORDER_STATUS, fcfa } from '@/lib/orders';
import { orderAction } from '../actions';

export const metadata: Metadata = { title: 'Commande', robots: { index: false } };
export const dynamic = 'force-dynamic';

type Order = {
  id: string; listing_id: string | null; listing_title: string; buyer_id: string; seller_id: string;
  quantity: number; unit_price_xof: number; total_xof: number; note: string | null; status: string;
  payment_ref: string | null; created_at: string;
};

const MESSAGES: Record<string, string> = {
  envoyee: 'Commande envoyée ! Le vendeur doit l’accepter. Vous pouvez en discuter sur WhatsApp.',
  accept: 'Commande acceptée. L’acheteur voit maintenant votre numéro Wave pour payer.',
  refuse: 'Commande refusée.',
  declare_paid: 'Merci ! Le vendeur va vérifier la réception du paiement sur son Wave.',
  confirm_paid: 'Paiement confirmé. Pensez à livrer ou à rendre le service.',
  not_received: 'Signalé : l’acheteur est invité à vérifier son paiement.',
  cancel: 'Commande annulée.',
  reference: 'Référence Wave invalide : lettres, chiffres et tirets uniquement.',
  trop: 'Trop d’actions en peu de temps. Réessayez plus tard.',
  erreur: 'Action impossible à cette étape.',
};

function Action({ id, action, label, tone = 'primary' }: { id: string; action: string; label: string; tone?: 'primary' | 'ghost' | 'danger' }) {
  const cls = tone === 'danger' ? 'btn w-full bg-danger text-white' : tone === 'ghost' ? 'btn btn-ghost w-full' : 'btn btn-primary w-full';
  return (
    <form action={orderAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value={action} />
      <button className={cls}>{label}</button>
    </form>
  );
}

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const { supabase, user } = await requireUser(`/commandes/${id}`);
  const msg = (await searchParams).msg;

  const { data } = await supabase.from('orders' as never).select('*').eq('id', id).maybeSingle();
  const o = data as Order | null;
  if (!o) notFound(); // RLS : la commande d'un autre n'existe pas pour moi
  const isSeller = o.seller_id === user.id;
  const isBuyer = o.buyer_id === user.id;

  // Numéro Wave du vendeur : la base ne le donne qu'à l'acheteur, après acceptation
  let waveNumber: string | null = null;
  if (isBuyer && (o.status === 'accepted' || o.status === 'paid_declared')) {
    const { data: n } = await supabase.rpc('order_payment_info' as never, { p_order: id } as never);
    waveNumber = typeof n === 'string' ? n : null;
  }
  const other = isSeller ? o.buyer_id : o.seller_id;
  const st = ORDER_STATUS[o.status] ?? { label: o.status, cls: '' };

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <Link href={`/commandes?vue=${isSeller ? 'ventes' : 'achats'}`} className="text-sm text-ink-soft hover:underline">← Mes commandes</Link>

      {msg && MESSAGES[msg] && <p role="status" className="rounded-xl bg-saffron-soft px-4 py-3 text-sm">{MESSAGES[msg]}</p>}

      <div className="card p-5">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-bold">{o.listing_title}</h1>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-ink-soft">Quantité</dt><dd className="text-right">{o.quantity}</dd>
          <dt className="text-ink-soft">Prix unitaire</dt><dd className="text-right">{fcfa(o.unit_price_xof)}</dd>
          <dt className="font-semibold">Total à payer</dt><dd className="text-right text-lg font-bold">{fcfa(o.total_xof)}</dd>
          <dt className="text-ink-soft">Passée le</dt><dd className="text-right">{formatDate(o.created_at)}</dd>
          {o.payment_ref && (<><dt className="text-ink-soft">Réf. Wave</dt><dd className="text-right font-mono">{o.payment_ref}</dd></>)}
        </dl>
        {o.note && <p className="mt-4 whitespace-pre-line rounded-xl bg-line/40 p-3 text-sm">« {o.note} »</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={`/api/contact/${other}${o.listing_id ? `?annonce=${o.listing_id}` : ''}`} rel="nofollow noopener" className="btn btn-gold flex-1 text-sm">
            Discuter sur WhatsApp
          </a>
          {o.listing_id && <Link href={`/annonces/${o.listing_id}`} className="btn btn-ghost text-sm">Voir l’annonce</Link>}
        </div>
      </div>

      {/* ---------- Côté VENDEUR ---------- */}
      {isSeller && o.status === 'requested' && (
        <div className="space-y-2">
          <p className="text-sm text-ink-soft">Mettez-vous d’accord sur WhatsApp (livraison, disponibilité), puis :</p>
          <Action id={o.id} action="accept" label="Accepter la commande" />
          <Action id={o.id} action="refuse" label="Refuser" tone="ghost" />
        </div>
      )}
      {isSeller && o.status === 'accepted' && (
        <div className="space-y-2">
          <p className="text-sm text-ink-soft">L’acheteur doit vous envoyer {fcfa(o.total_xof)} sur votre Wave. Vous avez déjà reçu l’argent ?</p>
          <Action id={o.id} action="confirm_paid" label="J’ai reçu le paiement" />
        </div>
      )}
      {isSeller && o.status === 'paid_declared' && (
        <div className="space-y-2">
          <p className="text-sm">L’acheteur dit avoir payé. <strong>Vérifiez dans votre application Wave</strong> avant de livrer.</p>
          <Action id={o.id} action="confirm_paid" label="Oui, j’ai bien reçu le paiement" />
          <Action id={o.id} action="not_received" label="Je n’ai rien reçu" tone="danger" />
        </div>
      )}

      {/* ---------- Côté ACHETEUR ---------- */}
      {isBuyer && o.status === 'requested' && (
        <div className="space-y-2">
          <p className="text-sm text-ink-soft">Le vendeur doit accepter votre commande. Ne payez rien avant son accord.</p>
          <Action id={o.id} action="cancel" label="Annuler ma commande" tone="ghost" />
        </div>
      )}
      {isBuyer && o.status === 'accepted' && (
        <div className="card space-y-4 border-2 border-ok p-5">
          <p className="font-semibold">Payer le vendeur avec Wave</p>
          {waveNumber ? (
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              <li>Ouvrez votre application <strong>Wave</strong> → « Envoyer ».</li>
              <li>Numéro : <strong className="font-mono text-base">{waveNumber}</strong></li>
              <li>Montant : <strong>{fcfa(o.total_xof)}</strong></li>
              <li>Revenez ici et cliquez « J’ai payé ».</li>
            </ol>
          ) : (
            <p className="text-sm">Le vendeur n’a pas indiqué de numéro Wave : demandez-le-lui sur WhatsApp.</p>
          )}
          <form action={orderAction} className="space-y-3">
            <input type="hidden" name="id" value={o.id} />
            <input type="hidden" name="action" value="declare_paid" />
            <label className="block text-sm">
              Référence de la transaction Wave <span className="text-ink-soft">(facultatif, visible dans votre historique Wave)</span>
              <input name="ref" maxLength={40} autoComplete="off" className="field mt-1 font-mono" />
            </label>
            <button className="btn btn-primary w-full">J’ai payé</button>
          </form>
          <Action id={o.id} action="cancel" label="Annuler la commande" tone="ghost" />
        </div>
      )}
      {isBuyer && o.status === 'paid_declared' && (
        <p className="card p-4 text-sm">Le vendeur va confirmer la réception de votre paiement. Gardez votre reçu Wave.</p>
      )}
      {o.status === 'paid_confirmed' && <p className="card p-4 text-sm">✅ Paiement confirmé par le vendeur. Bonne transaction !</p>}

      <p className="rounded-xl bg-saffron-soft px-4 py-3 text-xs">
        🔒 Sama Talent ne reçoit pas votre argent : vous payez directement le vendeur sur Wave. Payez uniquement une commande <strong>acceptée</strong>, et
        n’envoyez jamais d’argent à quelqu’un qui vous contacte en dehors de l’application.
      </p>
    </div>
  );
}
