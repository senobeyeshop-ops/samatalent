import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase/server';
import { safeNextPath } from '@/lib/validation';
import { MfaForm } from './MfaForm';

export const metadata: Metadata = { title: 'Vérification en deux étapes', robots: { index: false } };

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { user } = await currentUser();
  if (!user) redirect('/connexion?next=/admin');
  const next = safeNextPath((await searchParams).next, '/admin');

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-2xl font-bold">Vérification en deux étapes</h1>
      <p className="mt-1 text-ink-soft">
        L’espace d’administration exige un code à 6 chiffres depuis une application d’authentification
        (Google Authenticator, Microsoft Authenticator…).
      </p>
      <MfaForm next={next} />
    </div>
  );
}
