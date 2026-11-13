import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { currentUser } from '@/lib/supabase/server';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Sama Talent', template: '%s · Sama Talent' },
  description: 'Le réseau des talents du Sénégal et de l’UEMOA : emplois, stages, services, produits, chantiers.',
  manifest: '/manifest.webmanifest',
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#13203a',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Rendu dynamique obligatoire : chaque page reçoit un nonce CSP neuf (règle 12).
  await connection();
  const { user } = await currentUser();

  return (
    <html lang="fr">
      <body className="min-h-dvh pb-20 antialiased">
        <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-bold">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-saffron text-[#13203a]">S</span>
              <span>
                Sama<span className="text-saffron">Talent</span>
              </span>
            </Link>
            {user ? (
              <form action="/auth/deconnexion" method="post">
                <button className="text-sm text-ink-soft underline-offset-4 hover:underline">Se déconnecter</button>
              </form>
            ) : (
              <Link href="/connexion" className="text-sm font-semibold">
                Se connecter
              </Link>
            )}
          </div>
        </header>

        <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>

        <nav
          aria-label="Navigation principale"
          className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/95 backdrop-blur"
        >
          <ul className="mx-auto grid max-w-3xl grid-cols-4 text-center text-xs">
            {[
              { href: '/', label: 'Accueil', icon: '⌂' },
              { href: '/recherche', label: 'Chercher', icon: '⌕' },
              { href: '/publier', label: 'Publier', icon: '＋' },
              { href: '/profil', label: 'Profil', icon: '◉' },
            ].map((i) => (
              <li key={i.href}>
                <Link href={i.href} className="flex flex-col items-center gap-0.5 py-2.5 text-ink-soft hover:text-ink">
                  <span aria-hidden className="text-lg leading-none">
                    {i.icon}
                  </span>
                  {i.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </body>
    </html>
  );
}
