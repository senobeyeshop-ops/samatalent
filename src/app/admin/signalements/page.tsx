import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/lib/server/guards';
import { formatDate } from '@/lib/format';
import { REPORT_REASONS } from '@/lib/validation';
import { moderate } from '../actions';

export const metadata: Metadata = { title: 'Signalements', robots: { index: false, follow: false } };

const MSG: Record<string, string> = {
  masquer: 'Annonce masquée.',
  suspendre: 'Compte suspendu et annonces masquées.',
  rejeter: 'Signalement rejeté.',
  retablir: 'Annonce rétablie.',
  erreur: 'Action refusée. Vérifiez votre session admin.',
  invalide: 'Demande invalide.',
};

type Report = {
  id: string;
  target_type: 'listing' | 'profile' | 'message';
  target_id: string;
  reason: keyof typeof REPORT_REASONS;
  details: string | null;
  created_at: string;
};

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { supabase } = await requireAdmin();
  const msg = MSG[(await searchParams).msg ?? ''];

  const { data: reports } = await supabase
    .from('reports')
    .select('id, target_type, target_id, reason, details, created_at')
    .eq('status', 'open')
    .order('created_at', { ascending: true })
    .limit(200)
    .returns<Report[]>();

  // Regroupe par cible : 1 carte = 1 annonce ou 1 profil, avec tous ses signalements
  const groups = new Map<string, Report[]>();
  for (const r of reports ?? []) {
    const k = `${r.target_type}:${r.target_id}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const listingIds = [...groups.values()].filter((g) => g[0].target_type === 'listing').map((g) => g[0].target_id);
  const profileIds = [...groups.values()].filter((g) => g[0].target_type === 'profile').map((g) => g[0].target_id);
  const [{ data: listings }, { data: profiles }] = await Promise.all([
    listingIds.length
      ? supabase.from('listings').select('id, title, status, owner_id').in('id', listingIds)
      : Promise.resolve({ data: [] as { id: string; title: string; status: string; owner_id: string }[] }),
    profileIds.length
      ? supabase.from('profiles').select('id, display_name, status').in('id', profileIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string; status: string }[] }),
  ]);
  const L = new Map((listings ?? []).map((l) => [l.id, l]));
  const P = new Map((profiles ?? []).map((p) => [p.id, p]));

  const ordered = [...groups.values()].sort((a, b) => b.length - a.length);

  return (
    <div>
      <Link href="/admin" className="text-sm text-ink-soft hover:underline">
        ← Administration
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Signalements ouverts ({reports?.length ?? 0})</h1>
      {msg && <p className="mt-3 rounded-xl bg-saffron-soft px-4 py-3 text-sm">{msg}</p>}

      {ordered.length === 0 ? (
        <div className="card mt-6 p-6 text-center text-ink-soft">Aucun signalement en attente. 🎉</div>
      ) : (
        <ul className="mt-6 space-y-4">
          {ordered.map((group) => {
            const first = group[0];
            const listing = first.target_type === 'listing' ? L.get(first.target_id) : undefined;
            const profile = first.target_type === 'profile' ? P.get(first.target_id) : undefined;
            const href = listing ? `/annonces/${listing.id}` : profile ? `/talents/${profile.id}` : null;
            const title = listing?.title ?? profile?.display_name ?? '(élément supprimé)';
            const state = listing?.status ?? profile?.status;
            return (
              <li key={`${first.target_type}:${first.target_id}`} className="card p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-danger/10 px-2 py-0.5 font-semibold text-danger">
                    {group.length} signalement{group.length > 1 ? 's' : ''}
                  </span>
                  <span className="text-ink-soft">{first.target_type === 'listing' ? 'Annonce' : 'Profil'}</span>
                  {state && <span className="text-ink-soft">· statut : {state}</span>}
                </div>
                <h2 className="mt-2 font-semibold">
                  {href ? (
                    <Link href={href} className="underline-offset-4 hover:underline" target="_blank">
                      {title}
                    </Link>
                  ) : (
                    title
                  )}
                </h2>
                <ul className="mt-2 space-y-1 text-sm">
                  {group.map((r) => (
                    <li key={r.id} className="text-ink-soft">
                      <b className="text-ink">{REPORT_REASONS[r.reason] ?? r.reason}</b> · {formatDate(r.created_at)}
                      {/* texte de l'utilisateur affiché tel quel, échappé par React */}
                      {r.details && <span className="block whitespace-pre-line pl-3">« {r.details} »</span>}
                    </li>
                  ))}
                </ul>
                <form action={moderate} className="mt-3 space-y-2">
                  <input type="hidden" name="report_id" value={first.id} />
                  <input type="hidden" name="target_type" value={first.target_type} />
                  <input type="hidden" name="target_id" value={first.target_id} />
                  <input name="note" maxLength={300} placeholder="Note interne (facultatif)" className="field text-sm" />
                  <div className="flex flex-wrap gap-2">
                    {first.target_type === 'listing' && state !== 'hidden' && (
                      <button name="decision" value="masquer" className="btn btn-primary text-sm">
                        Masquer l’annonce
                      </button>
                    )}
                    {first.target_type === 'listing' && state === 'hidden' && (
                      <button name="decision" value="retablir" className="btn btn-ghost text-sm">
                        Rétablir (faux signalement)
                      </button>
                    )}
                    <button name="decision" value="suspendre" className="btn bg-danger text-sm text-white">
                      Suspendre l’auteur
                    </button>
                    <button name="decision" value="rejeter" className="btn btn-ghost text-sm">
                      Rejeter
                    </button>
                  </div>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
