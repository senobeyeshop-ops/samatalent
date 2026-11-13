import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/server/guards';
import { publicImage } from '@/lib/format';
import { uuidSchema } from '@/lib/validation';
import { ListingForm } from '@/app/publier/ListingForm';
import { PhotoManager } from '@/components/PhotoManager';
import { deleteListing, updateListing } from '../actions';

export const metadata: Metadata = { title: 'Modifier l’annonce', robots: { index: false } };

export default async function EditListing({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ publiee?: string; msg?: string }>;
}) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const { supabase, user } = await requireUser(`/mes-annonces/${id}`);
  const sp = await searchParams;

  const { data: l } = await supabase
    .from('listings')
    .select('id, owner_id, type, category_slug, title, description, price_xof, price_negotiable, city, country_code, status, listing_photos(id, path, position)')
    .eq('id', id)
    .eq('owner_id', user.id) // jamais l'annonce d'un autre, même publique
    .neq('status', 'deleted')
    .maybeSingle();
  if (!l) notFound();
  if (l.status === 'hidden') {
    return (
      <div className="card p-6">
        <h1 className="text-xl font-bold">Annonce en cours de modération</h1>
        <p className="mt-2 text-ink-soft">Elle ne peut pas être modifiée tant qu’un modérateur ne l’a pas examinée.</p>
        <Link href="/mes-annonces" className="btn btn-ghost mt-4">
          Retour
        </Link>
      </div>
    );
  }

  const photos = [...(l.listing_photos ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((p) => ({ id: p.id, position: p.position, url: publicImage('listings', p.path)! }));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/mes-annonces" className="text-sm text-ink-soft hover:underline">
          ← Mes annonces
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Modifier l’annonce</h1>
      </div>

      {sp.publiee === '1' && (
        <p role="status" className="rounded-xl bg-ok/10 px-4 py-3 text-sm text-ok">
          Annonce en ligne ! Ajoutez des photos : les annonces avec photos reçoivent bien plus de contacts.{' '}
          <Link href={`/annonces/${l.id}`} className="font-semibold underline">
            Voir l’annonce
          </Link>
        </p>
      )}

      <PhotoManager listingId={l.id} photos={photos} />

      <ListingForm
        action={updateListing.bind(null, l.id)}
        submitLabel="Enregistrer les modifications"
        successMessage="Modifications enregistrées."
        initial={{
          type: l.type,
          category_slug: l.category_slug,
          title: l.title,
          description: l.description,
          price_xof: l.price_xof === null ? '' : String(l.price_xof),
          price_negotiable: l.price_negotiable,
          city: l.city,
          country_code: l.country_code,
        }}
      />

      <details className="card p-4" open={sp.msg === 'confirmer'}>
        <summary className="cursor-pointer text-sm font-semibold text-danger">Supprimer cette annonce</summary>
        <form action={deleteListing} className="mt-3 space-y-3">
          <input type="hidden" name="id" value={l.id} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="confirm" value="oui" required className="h-5 w-5" /> Je confirme : l’annonce et ses photos
            seront supprimées définitivement.
          </label>
          <button className="btn w-full bg-danger text-white">Supprimer définitivement</button>
        </form>
      </details>
    </div>
  );
}
