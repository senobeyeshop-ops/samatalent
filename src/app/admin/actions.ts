'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/guards';
import { log } from '@/lib/server/log';

// Règle 5 — chaque action admin passe 3 barrières :
//   1) requireAdmin() ici (rôle + MFA vérifiés côté serveur)
//   2) les fonctions SQL admin_* refusent tout non-admin
//   3) chaque décision est écrite dans audit_log (qui, quoi, quand, pourquoi)

const decision = z.object({
  report_id: z.uuid(),
  decision: z.enum(['masquer', 'suspendre', 'rejeter', 'retablir']),
  target_type: z.enum(['listing', 'profile', 'message']),
  target_id: z.uuid(),
  note: z.string().trim().max(300).optional().default(''),
});

export async function moderate(form: FormData) {
  const { supabase } = await requireAdmin();
  const parsed = decision.safeParse(Object.fromEntries(['report_id', 'decision', 'target_type', 'target_id', 'note'].map((k) => [k, form.get(k) ?? undefined])));
  if (!parsed.success) redirect('/admin/signalements?msg=invalide');
  const d = parsed.data;
  const reason = d.note || d.decision;

  let ownerId: string | null = null;
  if (d.target_type === 'listing') {
    const { data } = await supabase.from('listings').select('owner_id').eq('id', d.target_id).maybeSingle();
    ownerId = data?.owner_id ?? null;
  } else if (d.target_type === 'profile') {
    ownerId = d.target_id;
  }

  const calls: PromiseLike<{ error: { code?: string } | null }>[] = [];
  if (d.decision === 'masquer' && d.target_type === 'listing') {
    calls.push(supabase.rpc('admin_set_listing_status', { p_listing: d.target_id, p_status: 'hidden', p_reason: reason }));
  }
  if (d.decision === 'retablir' && d.target_type === 'listing') {
    calls.push(supabase.rpc('admin_set_listing_status', { p_listing: d.target_id, p_status: 'published', p_reason: reason }));
  }
  if (d.decision === 'suspendre' && ownerId) {
    // suspend le compte ET masque toutes ses annonces (fait par la fonction SQL)
    calls.push(supabase.rpc('admin_set_user_status', { p_user: ownerId, p_status: 'suspended', p_reason: reason }));
  }
  const status = d.decision === 'rejeter' || d.decision === 'retablir' ? 'dismissed' : 'actioned';
  calls.push(supabase.rpc('admin_resolve_report', { p_report: d.report_id, p_status: status }));

  // Les autres signalements ouverts sur la même cible sont clos avec la même décision
  const results = await Promise.all(calls);
  const failed = results.find((r) => r.error);
  if (failed) {
    log.error('admin.moderate.failed', { code: failed.error?.code, reportId: d.report_id });
    redirect('/admin/signalements?msg=erreur');
  }
  const { data: siblings } = await supabase
    .from('reports')
    .select('id')
    .eq('target_type', d.target_type)
    .eq('target_id', d.target_id)
    .eq('status', 'open');
  await Promise.all((siblings ?? []).map((s) => supabase.rpc('admin_resolve_report', { p_report: s.id, p_status: status })));

  revalidatePath('/admin/signalements');
  redirect(`/admin/signalements?msg=${d.decision}`);
}
