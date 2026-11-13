'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/server/guards';
import { allow, fingerprint, LIMITS } from '@/lib/server/rate-limit';
import { ORDER_ACTIONS, orderSchema, paymentRefSchema, uuidSchema } from '@/lib/validation';
import { log } from '@/lib/server/log';

/**
 * Passer commande. Le navigateur n'envoie que l'annonce, la quantité et un message :
 * le prix est recopié par la base depuis l'annonce (règle 14).
 */
export async function createOrder(form: FormData) {
  const listingId = String(form.get('listing') ?? '');
  if (!uuidSchema.safeParse(listingId).success) redirect('/');
  const { supabase, user } = await requireUser(`/annonces/${listingId}`);
  const back = (msg: string): never => redirect(`/annonces/${listingId}?commande=${msg}`);

  if (!(await allow(fingerprint('order', user.id), LIMITS.orderCreate))) back('trop');
  const parsed = orderSchema.safeParse({ quantity: form.get('quantity'), note: form.get('note') ?? undefined });
  if (!parsed.success) back('invalide');

  const { data, error } = await supabase.rpc('create_order' as never, {
    p_listing: listingId,
    p_quantity: parsed.data!.quantity,
    p_note: parsed.data!.note,
  } as never);
  if (error || typeof data !== 'string') {
    log.warn('order.create_refused', { listingId, code: error?.code });
    back(error?.code === '54000' ? 'trop' : 'impossible');
  }
  log.info('order.created', { orderId: data, listingId });
  redirect(`/commandes/${data}?msg=envoyee`);
}

/** Faire avancer une commande. La base vérifie le rôle et le statut (order_action). */
export async function orderAction(form: FormData) {
  const id = String(form.get('id') ?? '');
  const action = String(form.get('action') ?? '');
  if (!uuidSchema.safeParse(id).success) redirect('/commandes');
  const { supabase, user } = await requireUser(`/commandes/${id}`);
  const back = (msg: string): never => redirect(`/commandes/${id}?msg=${msg}`);

  if (!(ORDER_ACTIONS as readonly string[]).includes(action)) back('erreur');
  if (!(await allow(fingerprint('order-action', user.id), LIMITS.orderAction))) back('trop');

  let ref: string | null = null;
  if (action === 'declare_paid') {
    const r = paymentRefSchema.safeParse(String(form.get('ref') ?? ''));
    if (!r.success) back('reference');
    ref = r.data || null;
  }

  const { error } = await supabase.rpc('order_action' as never, { p_order: id, p_action: action, p_ref: ref } as never);
  if (error) {
    log.warn('order.action_refused', { orderId: id, action, code: error.code });
    back('erreur');
  }
  revalidatePath('/commandes');
  back(action);
}
