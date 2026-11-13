import Link from 'next/link';
import { supabaseUser } from '@/lib/supabase/server';
import { ListingCard } from '@/components/ListingCard';
import { LISTING_CARD_COLUMNS, type ListingRow } from '@/lib/format';
import { CATEGORIES } from '@/lib/validation';

const ICONS: Record<string, string> = {
  emploi: '💼', stage: '🎓', services: '🛠️', produits: '🛍️',
  chantiers: '🏗️', professionnels: '👔', evenementiel: '🎉', numerique: '💻',
};

export default async function Home() {
  const supabase = await supabaseUser();
  const nowIso = new Date().toISOString();
  const [{ data: listings }, { data: stats }] = await Promise.all([
    supabase
      .from('listings')
      .select(LISTING_CARD_COLUMNS)
      .eq('status', 'published')
      .gt('expires_at', nowIso)
      .order('boosted_until', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(10)
      .returns<ListingRow[]>(),
    supabase.from('public_stats').select('talents, annonces').maybeSingle(),
  ]);

  return (
    <div className="space-y-10">
      <section className="pt-2">
        <p className="text-sm font-semibold text-saffron">✦ Le réseau des talents du Sénégal et de l’UEMOA</p>
        <h1 className="mt-2 text-3xl font-extrabold leading-tight">
          Le bon talent,
          <br />
          <span className="text-saffron">au bon endroit.</span>
        </h1>
        <p className="mt-3 text-ink-soft">
          Professionnels, services, produits, emplois, stages, chantiers : tout au même endroit, de Dakar à Lomé.
        </p>
        <form action="/recherche" className="mt-5 flex gap-2" role="search">
          <input name="q" maxLength={100} placeholder="Plombier, stage marketing, traiteur…" className="field" aria-label="Rechercher" />
          <button className="btn btn-primary">Chercher</button>
        </form>
        <dl className="mt-5 flex gap-6 text-sm">
          <div>
            <dt className="text-ink-soft">Talents inscrits</dt>
            <dd className="text-xl font-bold">{stats?.talents ?? 0}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Annonces publiées</dt>
            <dd className="text-xl font-bold">{stats?.annonces ?? 0}</dd>
          </div>
        </dl>
      </section>

      <section>
        <h2 className="text-lg font-bold">Parcourir par catégorie</h2>
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Object.entries(CATEGORIES).map(([slug, label]) => (
            <li key={slug}>
              <Link href={`/recherche?categorie=${slug}`} className="card flex items-center gap-2 p-3 text-sm font-medium hover:border-saffron">
                <span aria-hidden>{ICONS[slug]}</span> {label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold">Dernières annonces</h2>
          <Link href="/recherche" className="text-sm text-ink-soft hover:underline">
            Tout voir
          </Link>
        </div>
        {listings && listings.length > 0 ? (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {listings.map((l) => (
              <li key={l.id}>
                <ListingCard l={l} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="card mt-3 p-6 text-center text-ink-soft">
            Aucune annonce pour l’instant. Soyez le premier !
          </div>
        )}
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-bold">Comment ça marche</h2>
        <ol className="mt-3 space-y-3 text-sm">
          <li><b>1. Créez votre profil</b> — photo, compétences, WhatsApp (privé).</li>
          <li><b>2. Publiez ou cherchez</b> — offres, services, stages, chantiers.</li>
          <li><b>3. Échangez et concluez</b> — par WhatsApp, en toute sécurité.</li>
        </ol>
        <Link href="/publier" className="btn btn-gold mt-5 w-full">
          Publier une annonce
        </Link>
      </section>

      <p className="rounded-xl bg-saffron-soft px-4 py-3 text-xs">
        ⚠️ <b>Attention aux arnaques :</b> ne payez jamais pour obtenir un emploi et vérifiez toute offre avant de vous déplacer.
      </p>
    </div>
  );
}
