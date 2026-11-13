import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase/server';
import { safeNextPath } from '@/lib/validation';
import { signInWithGoogle } from './actions';
import { MagicLinkForm } from './MagicLinkForm';

export const metadata: Metadata = { title: 'Connexion', robots: { index: false } };

const REASONS: Record<string, string> = {
  expiree: 'Votre session a expiré après une période d’inactivité. Reconnectez-vous.',
  lien: 'Ce lien de connexion n’est pas valide. Demandez-en un nouveau ci-dessous.',
  expire: 'Ce lien a déjà servi ou a expiré (un lien ne fonctionne qu’une fois). Demandez-en un nouveau.',
  appareil: 'Ce lien a été ouvert dans un autre navigateur que celui de la demande. Demandez un nouveau lien.',
  trop: 'Trop de tentatives. Patientez quelques minutes.',
  erreur: 'La connexion n’a pas abouti. Réessayez.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; raison?: string }>;
}) {
  const { next: rawNext, raison } = await searchParams;
  const next = safeNextPath(rawNext, '/profil');
  const { user } = await currentUser();
  if (user) redirect(next);

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-2xl font-bold">Connexion</h1>
      <p className="mt-1 text-ink-soft">Pas de mot de passe à retenir : on vous envoie un lien.</p>

      {raison && REASONS[raison] && (
        <p role="alert" className="mt-4 rounded-xl bg-saffron-soft px-4 py-3 text-sm">
          {REASONS[raison]}
        </p>
      )}

      <MagicLinkForm next={next} />

      <div className="my-6 flex items-center gap-3 text-xs text-ink-soft">
        <span className="h-px flex-1 bg-line" /> ou <span className="h-px flex-1 bg-line" />
      </div>

      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <button className="btn btn-ghost w-full">Continuer avec Google</button>
      </form>

      <p className="mt-6 text-xs text-ink-soft">
        En continuant, vous acceptez nos conditions d’utilisation et notre politique de confidentialité.
      </p>
    </div>
  );
}
