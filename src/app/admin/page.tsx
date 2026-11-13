import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/lib/server/guards';

export const metadata: Metadata = { title: 'Administration', robots: { index: false, follow: false } };

export default async function AdminPage() {
  const { supabase } = await requireAdmin();
  // Les compteurs passent par la RLS : l'admin voit tout grâce à is_admin() en base.
  const [listings, reports, users] = await Promise.all([
    supabase.from('listings').select('id', { count: 'exact', head: true }),
    supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold">Administration</h1>
      <p className="mt-1 text-sm text-ink-soft">Session admin protégée par code à 6 chiffres, expire après 15 min d’inactivité.</p>
      <dl className="mt-6 grid grid-cols-3 gap-3">
        {[
          ['Annonces', listings.count ?? 0],
          ['Signalements ouverts', reports.count ?? 0],
          ['Comptes', users.count ?? 0],
        ].map(([label, n]) => (
          <div key={label} className="card p-4">
            <dt className="text-xs text-ink-soft">{label}</dt>
            <dd className="text-2xl font-bold">{n}</dd>
          </div>
        ))}
      </dl>
      <Link href="/admin/signalements" className="btn btn-primary mt-6 w-full">
        Traiter les signalements ({reports.count ?? 0})
      </Link>
    </div>
  );
}
