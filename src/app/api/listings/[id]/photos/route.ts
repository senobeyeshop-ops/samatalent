import { randomUUID } from 'node:crypto';
import { currentUser, supabaseService } from '@/lib/supabase/server';
import { allow, fingerprint, LIMITS } from '@/lib/server/rate-limit';
import { ImageRejected, MAX_UPLOAD_BYTES, processImage, readLimited } from '@/lib/server/image';
import { fail, json, serverFail, tooLarge } from '@/lib/server/api';
import { uuidSchema } from '@/lib/validation';
import { log } from '@/lib/server/log';

export const runtime = 'nodejs';
const MAX_PHOTOS = 5;

// POST /api/listings/:id/photos — ajoute une photo à MON annonce.
// L'origine est vérifiée par le proxy (règle 13).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: listingId } = await params;
  if (!uuidSchema.safeParse(listingId).success) return fail(404, 'Annonce introuvable.');

  const { supabase, user } = await currentUser();
  if (!user) return fail(401, 'Veuillez vous connecter.');

  // Règle 11 : refus avant lecture si l'envoi annonce plus de 2 Mo
  if (tooLarge(request, MAX_UPLOAD_BYTES)) return fail(413, 'Image trop lourde (2 Mo maximum).');
  if (!(await allow(fingerprint('photo', user.id), LIMITS.photoUpload))) {
    return fail(429, 'Trop de photos envoyées. Réessayez dans une heure.');
  }

  // Règle 4 : vérifié avec le client UTILISATEUR → la RLS ne renvoie l'annonce
  // que s'il en est le propriétaire (ou si elle est publique : on revérifie owner_id).
  const { data: listing } = await supabase
    .from('listings')
    .select('id, owner_id, status, listing_photos(position)')
    .eq('id', listingId)
    .maybeSingle();
  if (!listing || listing.owner_id !== user.id) return fail(404, 'Annonce introuvable.');
  if (!['published', 'draft', 'expired'].includes(listing.status)) return fail(403, 'Cette annonce ne peut plus être modifiée.');

  const used = new Set((listing.listing_photos ?? []).map((p: { position: number }) => p.position));
  if (used.size >= MAX_PHOTOS) return fail(409, `${MAX_PHOTOS} photos maximum par annonce.`);
  const position = [0, 1, 2, 3, 4].find((p) => !used.has(p))!;

  let image: Awaited<ReturnType<typeof processImage>>;
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return fail(400, 'Aucun fichier reçu.');
    image = await processImage(await readLimited(file), 'listing');
  } catch (e) {
    if (e instanceof ImageRejected) return fail(415, e.reason);
    return fail(400, 'Envoi invalide.');
  }

  // Le nom du fichier est fabriqué par nous : jamais celui envoyé par l'utilisateur.
  const path = `${user.id}/${listingId}/${randomUUID()}.webp`;
  const service = supabaseService();
  const up = await service.storage.from('listings').upload(path, image.data, {
    contentType: 'image/webp',
    cacheControl: '31536000',
    upsert: false,
  });
  if (up.error) return serverFail(up.error, 'photo.upload');

  // La base revérifie : chemin cohérent, propriétaire de l'annonce, 5 positions max.
  const ins = await service
    .from('listing_photos')
    .insert({ listing_id: listingId, owner_id: user.id, path, position } as never)
    .select('id, path, position')
    .single();
  if (ins.error) {
    await service.storage.from('listings').remove([path]); // pas de fichier orphelin
    if ((ins.error as { code?: string }).code === '23505') return fail(409, 'Réessayez : une autre photo arrivait en même temps.');
    return serverFail(ins.error, 'photo.insert');
  }

  log.info('photo.added', { listingId, photoId: (ins.data as { id: string }).id, bytes: image.bytes });
  return json(201, { ok: true, photo: ins.data });
}
