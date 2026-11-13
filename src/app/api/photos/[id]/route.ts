import { currentUser, supabaseService } from '@/lib/supabase/server';
import { allow, fingerprint, LIMITS } from '@/lib/server/rate-limit';
import { fail, json, serverFail } from '@/lib/server/api';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';

// DELETE /api/photos/:id — supprime UNE de MES photos (ligne + fichier).
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return fail(404, 'Photo introuvable.');

  const { supabase, user } = await currentUser();
  if (!user) return fail(401, 'Veuillez vous connecter.');
  if (!(await allow(fingerprint('listing-write', user.id), LIMITS.listingWrite))) return fail(429, 'Trop d’actions. Patientez.');

  // Suppression avec le client UTILISATEUR : la RLS (photos_delete_own) refuse
  // toute photo qui n'est pas la sienne. On récupère le chemin supprimé.
  const { data, error } = await supabase
    .from('listing_photos')
    .delete()
    .eq('id', id)
    .eq('owner_id', user.id)
    .select('path')
    .maybeSingle();
  if (error) return serverFail(error, 'photo.delete');
  if (!data) return fail(404, 'Photo introuvable.');

  const rm = await supabaseService().storage.from('listings').remove([data.path]);
  if (rm.error) return serverFail(rm.error, 'photo.storage_remove');
  return json(200, { ok: true });
}
