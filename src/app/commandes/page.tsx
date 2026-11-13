import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/server/guards';
import { formatDate } from '@/lib/format';
import { ORDER_STATUS, fcfa } from '@/lib/orders';

export const metadata: Metadata = { title: 'Mes commandes', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const { supabase, user } = await requireUser('/commandes');
  const vue = (await searchParams).vue === 'ventes' ? 'ventes' : 'achats';
  // RLS : seules MES commandes sortent ; le filtre précise le côté (achat ou vente)
  const { data: orders } = await supabase
    .from('orders' as never)
    .select('id, listing_title, quantity, total_xof, status, created_at')
    .eq(vue === 'ventes' ? 'seller_id' : 'buyer_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100);
  const list = (orders ?? []) as { id: string; listing_title: string; quantity: number; total_xof: number; status: string; created_at: string }[];

  const tab = (v: string, label: string) => (
    <Link
      href={`/commandes?vue=${v}`}
      aria-current={vue === v ? 'page' : undefined}
      className={`flex-1 rounded-xl px-4 py-2 text-center text-sm font-semibold ${vue === v ? 'bg-ink text-white' : 'bg-line/60'}`}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Mes commandes</h1>
      <div className="flex gap-2">
        {tab('achats', 'Mes achats')}
        {tab('ventes', 'Mes ventes')}
      </div>
      {list.length === 0 ? (
        <p className="card p-6 text-center text-ink-soft">
          {vue === 'ventes' ? 'Aucune commande reçue pour le moment.' : 'Vous n’avez encore rien commandé.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {list.map((o) => {
            const st = ORDER_STATUS[o.status] ?? { label: o.status, cls: '' };
            return (
              <li key={o.id}>
                <Link href={`/commandes/${o.id}`} className="card block p-4 hover:border-ink/30">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{o.listing_title}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink-soft">
                    {o.quantity} × · {fcfa(o.total_xof)} · {formatDate(o.created_at)}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
