import { randomUUID } from 'node:crypto';
import { currentUser, supabaseService } from '@/lib/supabase/server';
import { allow, fingerprint, LIMITS } from '@/lib/server/rate-limit';
import { ImageRejected, MAX_UPLOAD_BYTES, processImage, readLimited } from '@/lib/server/image';
import { fail, json, serverFail, tooLarge } from '@/lib/server/api';

export const runtime = 'nodejs';

async function currentAvatar(userId: string) {
  const { data } = await supabaseService()
    .from('profiles')
    .select('avatar_path')
    .eq('id', userId)
    .maybeSingle<{ avatar_path: string | null }>();
  return data?.avatar_path ?? null;
}

// POST /api/profile/avatar — remplace MA photo de profil.
export async function POST(request: Request) {
  const { user } = await currentUser();
  if (!user) return fail(401, 'Veuillez vous connecter.');
  if (tooLarge(request, MAX_UPLOAD_BYTES)) return fail(413, 'Image trop lourde (2 Mo maximum).');
  if (!(await allow(fingerprint('avatar', user.id), LIMITS.avatarUpload))) return fail(429, 'Trop d’envois. Réessayez dans une heure.');

  let image: Awaited<ReturnType<typeof processImage>>;
  try {
    const file = (await request.formData()).get('file');
    if (!(file instanceof File)) return fail(400, 'Aucun fichier reçu.');
    image = await processImage(await readLimited(file), 'avatar');
  } catch (e) {
    if (e instanceof ImageRejected) return fail(415, e.reason);
    return fail(400, 'Envoi invalide.');
  }

  const service = supabaseService();
  const path = `${user.id}/${randomUUID()}.webp`;
  const old = await currentAvatar(user.id);

  const up = await service.storage.from('avatars').upload(path, image.data, {
    contentType: 'image/webp',
    cacheControl: '31536000',
    upsert: false,
  });
  if (up.error) return serverFail(up.error, 'avatar.upload');

  // avatar_path n'est PAS modifiable par l'utilisateur (migration 0002) : seul
  // le serveur l'écrit, après contrôle du fichier, et toujours sur SA ligne.
  const upd = await service.from('profiles').update({ avatar_path: path } as never).eq('id', user.id);
  if (upd.error) {
    await service.storage.from('avatars').remove([path]);
    return serverFail(upd.error, 'avatar.save');
  }
  if (old) await service.storage.from('avatars').remove([old]);
  return json(200, { ok: true, path });
}

// DELETE /api/profile/avatar — retire MA photo de profil.
export async function DELETE() {
  const { user } = await currentUser();
  if (!user) return fail(401, 'Veuillez vous connecter.');
  const service = supabaseService();
  const old = await currentAvatar(user.id);
  if (!old) return json(200, { ok: true });
  const upd = await service.from('profiles').update({ avatar_path: null } as never).eq('id', user.id);
  if (upd.error) return serverFail(upd.error, 'avatar.remove');
  await service.storage.from('avatars').remove([old]);
  return json(200, { ok: true });
}
