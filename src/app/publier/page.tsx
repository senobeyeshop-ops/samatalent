import type { Metadata } from 'next';
import { requireUser } from '@/lib/server/guards';
import { ListingForm } from './ListingForm';
import { createListing } from './actions';

export const metadata: Metadata = { title: 'Publier une annonce', robots: { index: false } };

export default async function PublishPage() {
  const { supabase, user } = await requireUser('/publier');
  const { data: profile } = await supabase.from('profiles').select('country_code, city').eq('id', user.id).single();

  return (
    <div>
      <h1 className="text-2xl font-bold">Publier une annonce</h1>
      <p className="mt-1 text-sm text-ink-soft">Gratuit. Visible 60 jours, renouvelable. Les photos s’ajoutent juste après.</p>
      <ListingForm
        action={createListing}
        submitLabel="Publier mon annonce"
        initial={{
          type: '',
          category_slug: '',
          title: '',
          description: '',
          price_xof: '',
          price_negotiable: false,
          city: profile?.city ?? '',
          country_code: profile?.country_code ?? 'SN',
        }}
      />
      <p className="mt-6 rounded-xl bg-saffron-soft px-4 py-3 text-xs">
        ⚠️ Ne demandez jamais d’argent pour un emploi. Les annonces frauduleuses sont supprimées et leurs auteurs bannis.
      </p>
    </div>
  );
}
