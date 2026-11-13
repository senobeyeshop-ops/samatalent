import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/server/guards';
import { publicImage } from '@/lib/format';
import { ProfileForm } from './ProfileForm';
import { AvatarUploader } from './AvatarUploader';

export const metadata: Metadata = { title: 'Mon profil', robots: { index: false } };

export default async function ProfilePage() {
  const { supabase, user } = await requireUser('/profil');

  const [{ data: profile }, { data: priv }] = await Promise.all([
    supabase
      .from('profiles')
      .select('display_name, headline, bio, skills, city, country_code, avatar_path')
      .eq('id', user.id)
      .single(),
    supabase.from('profile_private').select('whatsapp, wave_number').eq('user_id', user.id).maybeSingle(),
  ]);

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Mon profil</h1>
          <p className="mt-1 text-sm text-ink-soft">Votre vitrine publique. Votre WhatsApp reste privé.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Link href={`/talents/${user.id}`} className="btn btn-ghost text-sm">
            Voir ma page
          </Link>
          <Link href="/mes-annonces" className="text-sm font-semibold underline-offset-4 hover:underline">
            Mes annonces →
          </Link>
          <Link href="/commandes" className="text-sm font-semibold underline-offset-4 hover:underline">
            Mes commandes →
          </Link>
        </div>
      </div>

      <AvatarUploader url={publicImage('avatars', profile?.avatar_path)} name={profile?.display_name ?? ''} />

      <ProfileForm
        initial={{
          display_name: profile?.display_name ?? '',
          headline: profile?.headline ?? '',
          bio: profile?.bio ?? '',
          skills: (profile?.skills ?? []).join(', '),
          city: profile?.city ?? '',
          country_code: profile?.country_code ?? 'SN',
          whatsapp: priv?.whatsapp ?? '',
          wave_number: priv?.wave_number ?? '',
        }}
      />

      <form action="/auth/deconnexion" method="post" className="mt-10 border-t border-line pt-6">
        <input type="hidden" name="partout" value="1" />
        <button className="text-sm text-danger underline-offset-4 hover:underline">
          Me déconnecter de tous mes appareils
        </button>
      </form>
    </div>
  );
}
