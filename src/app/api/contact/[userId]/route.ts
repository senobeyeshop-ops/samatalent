import { NextResponse, type NextRequest } from 'next/server';
import { currentUser, supabaseService } from '@/lib/supabase/server';
import { allow, fingerprint, LIMITS } from '@/lib/server/rate-limit';
import { uuidSchema } from '@/lib/validation';
import { log } from '@/lib/server/log';

/**
 * Le numéro WhatsApp n'est JAMAIS envoyé dans une page : on ne peut pas
 * le « récolter » en masse. On passe ici, connecté, avec une limite,
 * et on est redirigé directement vers wa.me.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const listingId = request.nextUrl.searchParams.get('annonce');
  const back = (reason: string) =>
    NextResponse.redirect(
      new URL(listingId && uuidSchema.safeParse(listingId).success ? `/annonces/${listingId}?contact=${reason}` : '/', request.url),
      { status: 303 },
    );

  const { supabase, user } = await currentUser();
  if (!user) return NextResponse.redirect(new URL('/connexion', request.url), { status: 303 });
  if (!uuidSchema.safeParse(userId).success || userId === user.id) return back('invalide');

  if (!(await allow(fingerprint('contact', user.id), LIMITS.contactWhatsapp))) return back('trop');

  // Vérifications avec le client UTILISATEUR (RLS) : cible active, pas de blocage
  const [{ data: target }, { data: blocked }] = await Promise.all([
    supabase.from('profiles').select('id').eq('id', userId).eq('status', 'active').maybeSingle(),
    supabase.rpc('is_blocked_between', { a: user.id, b: userId }),
  ]);
  if (!target || blocked === true) return back('indisponible');

  // Lecture du numéro : seul endroit où la clé service lit une donnée privée,
  // après toutes les vérifications ci-dessus.
  const { data: priv } = await supabaseService()
    .from('profile_private')
    .select('whatsapp')
    .eq('user_id', userId)
    .maybeSingle<{ whatsapp: string | null }>();
  if (!priv?.whatsapp) return back('sans-numero');

  log.info('contact.whatsapp', { from: user.id, to: userId, listingId }); // uuid seulement
  const text = encodeURIComponent(`Bonjour, je vous contacte via Sama Talent${listingId ? ` au sujet de votre annonce` : ''}.`);
  return NextResponse.redirect(`https://wa.me/${priv.whatsapp.replace('+', '')}?text=${text}`, { status: 303 });
}
