import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/server/guards';
import { formatDate, typeName } from '@/lib/format';
import { renewListing } from './actions';

export const metadata: Metadata = { title: 'Mes annonces', robots: { index: false } };

const MESSAGES: Record<string, { text: string; tone: 'ok' | 'warn' }> = {
  renouvelee: { text: 'Annonce renouvelée pour 60 jours.', tone: 'ok' },
  supprimee: { text: 'Annonce supprimée, ainsi que ses photos.', tone: 'ok' },
  renouvellement: { text: 'Une annonce se renouvelle seulement dans ses 7 derniers jours.', tone: 'warn' },
  erreur: { text: 'Action impossible. Réessayez.', tone: 'warn' },
};

const STATUS: Record<string, { label: string; cls: string }> = {
  published: { label: 'En ligne', cls: 'bg-ok/10 text-ok' },
  draft: { label: 'Brouillon', cls: 'bg-line text-ink-soft' },
  expired: { label: 'Expirée', cls: 'bg-saffron-soft text-ink' },
  hidden: { label: 'Masquée par la modération', cls: 'bg-danger/10 text-danger' },
};

// Composant serveur : l'heure est lue une seule fois, au moment de la requête.
function windowNow() {
  const now = new Date().getTime();
  return { now, soon: now + 7 * 24 * 3600 * 1000 };
}

export default async function MyListings({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { supabase, user } = await requireUser('/mes-annonces');
  const msg = MESSAGES[(await searchParams).msg ?? ''];

  // RLS : on ne reçoit que ses propres annonces (+ filtre explicite owner_id)
  const { data: rows } = await supabase
    .from('listings')
    .select('id, type, title, status, expires_at, created_at, listing_photos(id)')
    .eq('owner_id', user.id)
    .neq('status', 'deleted')
    .order('created_at', { ascending: false })
    .limit(100);
  const { now, soon } = windowNow();


  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Mes annonces</h1>
        <Link href="/publier" className="btn btn-gold text-sm">
          + Publier
        </Link>
      </div>
      {msg && (
        <p role="status" className={`mt-4 rounded-xl px-4 py-3 text-sm ${msg.tone === 'ok' ? 'bg-ok/10 text-ok' : 'bg-saffron-soft'}`}>
          {msg.text}
        </p>
      )}

      {!rows?.length ? (
        <div className="card mt-6 p-6 text-center text-ink-soft">Vous n’avez encore publié aucune annonce.</div>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((l) => {
            const exp = new Date(l.expires_at).getTime();
            const expired = l.status === 'expired' || exp < now;
            const status = STATUS[expired && l.status === 'published' ? 'expired' : l.status] ?? STATUS.draft;
            const canRenew = l.status !== 'hidden' && exp < soon;
            return (
              <li key={l.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={`rounded-full px-2 py-0.5 font-medium ${status.cls}`}>{status.label}</span>
                  <span className="text-ink-soft">{typeName(l.type)}</span>
                  <span className="text-ink-soft">· {l.listing_photos?.length ?? 0} photo(s)</span>
                </div>
                <h2 className="mt-2 font-semibold">{l.title}</h2>
                <p className="text-xs text-ink-soft">
                  {expired ? 'Expirée le' : 'Expire le'} {formatDate(l.expires_at)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {l.status !== 'hidden' && (
                    <Link href={`/mes-annonces/${l.id}`} className="btn btn-ghost text-sm">
                      Modifier / photos
                    </Link>
                  )}
                  <Link href={`/annonces/${l.id}`} className="btn btn-ghost text-sm">
                    Voir
                  </Link>
                  {l.status === 'published' && (
                    <Link href={`/mes-annonces/${l.id}/booster`} className="btn btn-primary text-sm">
                      🚀 Booster
                    </Link>
                  )}
                  {canRenew && (
                    <form action={renewListing}>
                      <input type="hidden" name="id" value={l.id} />
                      <button className="btn btn-primary text-sm">Renouveler 60 j</button>
                    </form>
                  )}
                </div>
                {l.status === 'hidden' && (
                  <p className="mt-2 text-xs text-ink-soft">
                    Cette annonce a été signalée et attend l’examen d’un modérateur. Elle n’est plus visible du public.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
