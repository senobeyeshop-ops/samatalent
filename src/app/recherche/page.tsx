import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';
import { supabaseUser } from '@/lib/supabase/server';
import { ListingCard } from '@/components/ListingCard';
import { LISTING_CARD_COLUMNS, type ListingRow } from '@/lib/format';
import { CATEGORIES, COUNTRIES } from '@/lib/validation';

export const metadata: Metadata = { title: 'Rechercher' };

const PAGE_SIZE = 20;

// Règle 9 : même les paramètres d'URL sont validés ; une valeur invalide est ignorée.
const query = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  categorie: z.enum(Object.keys(CATEGORIES) as [string, ...string[]]).optional().catch(undefined),
  pays: z.enum(Object.keys(COUNTRIES) as [string, ...string[]]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(50).optional().catch(1),
});

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const flat = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const { q, categorie, pays, page = 1 } = query.parse(flat);

  const supabase = await supabaseUser();
  let req = supabase
    .from('listings')
    .select(LISTING_CARD_COLUMNS, { count: 'exact' })
    .eq('status', 'published')
    .gt('expires_at', new Date().toISOString());

  // Règle 10 : la recherche passe en paramètre (websearch_to_tsquery), jamais concaténée
  if (q) req = req.textSearch('search', q, { type: 'websearch', config: 'french' });
  if (categorie) req = req.eq('category_slug', categorie);
  if (pays) req = req.eq('country_code', pays);

  const from = (page - 1) * PAGE_SIZE;
  const { data, count } = await req
    .order('boosted_until', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1)
    .returns<ListingRow[]>();

  const total = count ?? 0;
  const params = (p: number) => {
    const s = new URLSearchParams();
    if (q) s.set('q', q);
    if (categorie) s.set('categorie', categorie);
    if (pays) s.set('pays', pays);
    s.set('page', String(p));
    return `/recherche?${s}`;
  };

  return (
    <div>
      <h1 className="text-2xl font-bold">Rechercher</h1>
      <form className="mt-4 space-y-2" role="search">
        <input name="q" defaultValue={q} maxLength={100} placeholder="Mot-clé" className="field" aria-label="Mot-clé" />
        <div className="grid grid-cols-2 gap-2">
          <select name="categorie" defaultValue={categorie ?? ''} className="field" aria-label="Catégorie">
            <option value="">Toutes catégories</option>
            {Object.entries(CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select name="pays" defaultValue={pays ?? ''} className="field" aria-label="Pays">
            <option value="">Tous pays UEMOA</option>
            {Object.entries(COUNTRIES).map(([k, c]) => (
              <option key={k} value={k}>{c.name}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary w-full">Filtrer</button>
      </form>

      <p className="mt-6 text-sm text-ink-soft">{total} résultat{total > 1 ? 's' : ''}</p>
      {data && data.length > 0 ? (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {data.map((l) => (
            <li key={l.id}><ListingCard l={l} /></li>
          ))}
        </ul>
      ) : (
        <div className="card mt-3 p-6 text-center text-ink-soft">Aucune annonce ne correspond. Essayez un autre mot-clé.</div>
      )}

      <nav className="mt-6 flex justify-between text-sm" aria-label="Pagination">
        {page > 1 ? <Link href={params(page - 1)} className="btn btn-ghost">← Précédent</Link> : <span />}
        {from + PAGE_SIZE < total && <Link href={params(page + 1)} className="btn btn-ghost">Suivant →</Link>}
      </nav>
    </div>
  );
}
