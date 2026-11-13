import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { currentUser, supabaseUser } from '@/lib/supabase/server';
import { ListingCard } from '@/components/ListingCard';
import { countryName, LISTING_CARD_COLUMNS, type ListingRow } from '@/lib/format';
import { uuidSchema } from '@/lib/validation';
import { Avatar } from '@/components/Avatar';
import { ReportForm } from '@/components/ReportForm';

type Params = { params: Promise<{ id: string }> };

async function load(id: string) {
  if (!uuidSchema.safeParse(id).success) return null;
  const supabase = await supabaseUser();
  // Colonnes publiques uniquement ; le WhatsApp est dans une autre table, illisible ici.
  const { data } = await supabase
    .from('profiles')
    .select('id, display_name, headline, bio, skills, city, country_code, avatar_path, created_at')
    .eq('id', id)
    .maybeSingle();
  return data ? { supabase, profile: data } : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const r = await load((await params).id);
  return { title: r?.profile.display_name ?? 'Talent introuvable' };
}

export default async function TalentPage({ params }: Params) {
  const r = await load((await params).id);
  if (!r) notFound();
  const { supabase, profile: p } = r;
  const { user } = await currentUser();
  const { data: listings } = await supabase
    .from('listings')
    .select(LISTING_CARD_COLUMNS)
    .eq('owner_id', p.id)
    .eq('status', 'published')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(20)
    .returns<ListingRow[]>();

  return (
    <div>
      <div className="flex items-center gap-4">
        <Avatar name={p.display_name} path={p.avatar_path} size={64} />
        <div>
          <h1 className="text-2xl font-bold">{p.display_name}</h1>
          {p.headline && <p className="text-ink-soft">{p.headline}</p>}
          <p className="text-sm text-ink-soft">
            {[p.city, countryName(p.country_code)].filter(Boolean).join(', ')}
          </p>
        </div>
      </div>
      {p.bio && <p className="card mt-5 whitespace-pre-line p-4">{p.bio}</p>}
      {p.skills.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {p.skills.map((s: string) => (
            <li key={s} className="rounded-full bg-saffron-soft px-3 py-1 text-sm">{s}</li>
          ))}
        </ul>
      )}
      <h2 className="mt-8 text-lg font-bold">Annonces</h2>
      {listings && listings.length > 0 ? (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {listings.map((l) => (
            <li key={l.id}><ListingCard l={l} /></li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-ink-soft">Aucune annonce en ligne.</p>
      )}
      {user && user.id !== p.id && <ReportForm targetType="profile" targetId={p.id} label="Signaler ce profil" />}
    </div>
  );
}
