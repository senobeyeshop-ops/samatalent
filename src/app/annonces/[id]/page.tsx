import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentUser, supabaseUser } from '@/lib/supabase/server';
import { categoryName, countryName, formatDate, formatPrice, publicImage, typeName } from '@/lib/format';
import { uuidSchema } from '@/lib/validation';
import { Avatar } from '@/components/Avatar';
import { ReportForm } from '@/components/ReportForm';
import { createOrder } from '@/app/commandes/actions';

type Params = { params: Promise<{ id: string }>; searchParams: Promise<{ contact?: string; commande?: string }> };

const CONTACT_MESSAGES: Record<string, string> = {
  trop: 'Vous avez contacté beaucoup de personnes en peu de temps. Réessayez dans une heure.',
  'sans-numero': 'Cette personne n’a pas encore renseigné de numéro WhatsApp.',
  indisponible: 'Ce compte n’est pas joignable.',
  invalide: 'Contact impossible.',
};

const ORDER_MESSAGES: Record<string, string> = {
  trop: 'Trop de commandes en peu de temps. Réessayez dans une heure.',
  invalide: 'Quantité ou message invalide.',
  impossible: 'Cette annonce ne peut pas être commandée pour le moment.',
};

async function load(id: string) {
  // Règle 9 : un identifiant mal formé ne va même pas jusqu'à la base
  if (!uuidSchema.safeParse(id).success) return null;
  const supabase = await supabaseUser();
  // RLS : seules les annonces publiées et non expirées (ou les miennes, ou admin) sortent
  const { data } = await supabase
    .from('listings')
    .select(
      'id, owner_id, type, category_slug, title, description, price_xof, price_negotiable, city, country_code, status, boosted_until, created_at, expires_at, listing_photos(path, position), owner:profiles!listings_owner_id_fkey(id, display_name, headline, avatar_path)',
    )
    .eq('id', id)
    .neq('status', 'deleted')
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const l = await load((await params).id);
  if (!l) return { title: 'Annonce introuvable' };
  const cover = [...(l.listing_photos ?? [])].sort((a, b) => a.position - b.position)[0];
  return {
    title: l.title,
    description: l.description.slice(0, 150),
    openGraph: cover ? { images: [publicImage('listings', cover.path)!] } : undefined,
  };
}

export default async function ListingPage({ params, searchParams }: Params) {
  const { id } = await params;
  const l = await load(id);
  if (!l) notFound();
  const { user } = await currentUser();
  const isOwner = user?.id === l.owner_id;
  const owner = Array.isArray(l.owner) ? l.owner[0] : l.owner;
  const price = formatPrice(l.price_xof, l.price_negotiable);
  const sp = await searchParams;
  const contactMsg = sp.contact ? CONTACT_MESSAGES[sp.contact] : undefined;
  const orderMsg = sp.commande ? ORDER_MESSAGES[sp.commande] : undefined;
  const orderable = (l.type === 'produit' || l.type === 'service') && (l.price_xof ?? 0) > 0 && l.status === 'published';
  const photos = [...(l.listing_photos ?? [])].sort((a, b) => a.position - b.position);

  return (
    <article>
      {l.status === 'hidden' && (
        <p className="mb-4 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
          Annonce masquée après signalements — visible seulement par vous et la modération.
        </p>
      )}
      {isOwner && l.status !== 'hidden' && (
        <div className="mb-4 flex items-center justify-between rounded-xl bg-saffron-soft px-4 py-3 text-sm">
          <span>C’est votre annonce{l.status !== 'published' ? ` (${l.status})` : ''}.</span>
          <Link href={`/mes-annonces/${l.id}`} className="font-semibold underline">
            Modifier / photos
          </Link>
        </div>
      )}

      {photos.length > 0 && (
        <div className="-mx-4 mb-5 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {photos.map((p, i) => (
            <div key={p.path} className="relative aspect-[4/3] w-[85%] shrink-0 snap-center overflow-hidden rounded-2xl bg-line sm:w-[70%]">
              <Image
                src={publicImage('listings', p.path)!}
                alt={`Photo ${i + 1} sur ${photos.length}`}
                fill
                priority={i === 0}
                sizes="(max-width: 640px) 85vw, 520px"
                className="object-cover"
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
        <span className="rounded-full bg-saffron-soft px-2 py-0.5 font-medium text-ink">{typeName(l.type)}</span>
        <span>{categoryName(l.category_slug)}</span>
        <span>· publiée le {formatDate(l.created_at)}</span>
      </div>
      <h1 className="mt-2 text-2xl font-bold">{l.title}</h1>
      {price && <p className="mt-1 text-lg font-semibold">{price}</p>}
      <p className="mt-1 text-sm text-ink-soft">
        📍 {l.city}, {countryName(l.country_code)}
      </p>

      {/* Texte affiché tel quel : React échappe tout, aucun HTML injecté possible */}
      <div className="card mt-5 whitespace-pre-line p-4 leading-relaxed">{l.description}</div>

      {owner && (
        <Link href={`/talents/${owner.id}`} className="card mt-4 flex items-center gap-3 p-4">
          <Avatar name={owner.display_name} path={owner.avatar_path} />
          <span>
            <span className="block font-semibold">{owner.display_name}</span>
            {owner.headline && <span className="block text-sm text-ink-soft">{owner.headline}</span>}
          </span>
        </Link>
      )}

      {!isOwner && (
        <div className="mt-5">
          {contactMsg && (
            <p role="alert" className="mb-3 rounded-xl bg-saffron-soft px-4 py-3 text-sm">
              {contactMsg}
            </p>
          )}
          {orderMsg && (
            <p role="alert" className="mb-3 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
              {orderMsg}
            </p>
          )}
          {user && orderable && (
            <details className="card mb-3 p-4">
              <summary className="cursor-pointer font-semibold">🛒 Commander et payer avec Wave</summary>
              <form action={createOrder} className="mt-3 space-y-3">
                <input type="hidden" name="listing" value={l.id} />
                <label className="block text-sm">
                  Quantité
                  <input name="quantity" type="number" min={1} max={99} defaultValue={1} required className="field mt-1" />
                </label>
                <label className="block text-sm">
                  Message au vendeur <span className="text-ink-soft">(livraison, taille, date…)</span>
                  <textarea name="note" maxLength={500} rows={3} className="field mt-1" />
                </label>
                <button className="btn btn-primary w-full">Envoyer la commande</button>
                <p className="text-xs text-ink-soft">
                  Le vendeur accepte d’abord, puis vous le payez directement sur son Wave. Rien n’est prélevé maintenant.
                </p>
              </form>
            </details>
          )}
          {user ? (
            <a href={`/api/contact/${l.owner_id}?annonce=${l.id}`} rel="nofollow noopener" className="btn btn-gold w-full">
              Contacter sur WhatsApp
            </a>
          ) : (
            <Link href={`/connexion?next=/annonces/${l.id}`} className="btn btn-gold w-full">
              Se connecter pour contacter
            </Link>
          )}
        </div>
      )}

      <p className="mt-6 rounded-xl bg-saffron-soft px-4 py-3 text-xs">
        ⚠️ Ne payez jamais pour obtenir un emploi. Vérifiez toute offre avant de vous déplacer.
      </p>

      {!isOwner && user && <ReportForm targetType="listing" targetId={l.id} label="Signaler cette annonce" />}
    </article>
  );
}
