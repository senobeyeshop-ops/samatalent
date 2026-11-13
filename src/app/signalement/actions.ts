'use server';

import { currentUser } from '@/lib/supabase/server';
import { publicError, type ActionResult } from '@/lib/server/errors';
import { allow, fingerprint, LIMITS } from '@/lib/server/rate-limit';
import { fieldErrors, formToObject, reportSchema } from '@/lib/validation';
import { log } from '@/lib/server/log';

export async function createReport(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase, user } = await currentUser();
  if (!user) return { ok: false, error: 'Connectez-vous pour signaler.' };

  // Règle 7 : 10 signalements par jour — empêche d'abuser du masquage automatique
  if (!(await allow(fingerprint('report', user.id), LIMITS.report))) {
    return { ok: false, error: 'Vous avez atteint la limite de signalements pour aujourd’hui.' };
  }

  const parsed = reportSchema.safeParse(formToObject(form, ['target_type', 'target_id', 'reason', 'details']));
  if (!parsed.success) return { ok: false, error: 'Corrigez le formulaire.', fields: fieldErrors(parsed.error) };

  // reporter_id = l'utilisateur vérifié, jamais une valeur du formulaire.
  // La base vérifie que la cible existe et qu'on ne se signale pas soi-même.
  const { error } = await supabase.from('reports').insert({ ...parsed.data, reporter_id: user.id, status: 'open' });
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Vous avez déjà signalé cet élément. Merci, il est en cours d’examen.' };
    if (error.code === '22023') return { ok: false, error: 'Ce signalement n’est pas possible.' };
    return publicError(error, 'report.create');
  }
  log.info('report.created', { targetType: parsed.data.target_type, targetId: parsed.data.target_id, reason: parsed.data.reason });
  return { ok: true };
}
