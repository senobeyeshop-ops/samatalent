'use server';

import { redirect } from 'next/navigation';
import { supabaseUser } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/server/env';
import { allow, clientIp, fingerprint, LIMITS } from '@/lib/server/rate-limit';
import { emailSchema, safeNextPath } from '@/lib/validation';
import { log } from '@/lib/server/log';

export type LoginState = { status: 'idle' | 'sent' | 'error'; message?: string };

// Même réponse que l'adresse existe ou non : on ne révèle pas qui est inscrit.
const SENT: LoginState = {
  status: 'sent',
  message: 'Si cette adresse est valide, un lien de connexion vient de vous être envoyé. Il expire dans 1 heure.',
};
const TOO_MANY: LoginState = {
  status: 'error',
  message: 'Trop de tentatives. Patientez 15 minutes avant de réessayer.',
};

export async function sendMagicLink(_prev: LoginState, form: FormData): Promise<LoginState> {
  // Règle 9 : validation serveur
  const parsed = emailSchema.safeParse(form.get('email'));
  if (!parsed.success) return { status: 'error', message: 'Adresse email invalide.' };
  const email = parsed.data;
  const next = safeNextPath(String(form.get('next') ?? ''), '/profil');

  // Règle 7 : par IP ET par adresse
  const ip = await clientIp();
  const [okIp, okMail] = await Promise.all([
    allow(fingerprint('magic-ip', ip), LIMITS.magicLinkIp),
    allow(fingerprint('magic-mail', email), LIMITS.magicLinkEmail),
  ]);
  if (!okIp || !okMail) {
    log.warn('auth.magic_link.rate_limited');
    return TOO_MANY;
  }

  const supabase = await supabaseUser();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${serverEnv().NEXT_PUBLIC_APP_URL}/auth/callback?next=${encodeURIComponent(next)}`,
      shouldCreateUser: true,
    },
  });
  // On journalise l'échec (sans l'email) mais on répond pareil : pas d'énumération.
  if (error) log.warn('auth.magic_link.provider_error', { code: error.code, status: error.status });
  return SENT;
}

export async function signInWithGoogle(form: FormData) {
  const ip = await clientIp();
  if (!(await allow(fingerprint('oauth-ip', ip), LIMITS.magicLinkIp))) {
    redirect('/connexion?raison=trop');
  }
  const next = safeNextPath(String(form.get('next') ?? ''), '/profil');
  const supabase = await supabaseUser();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${serverEnv().NEXT_PUBLIC_APP_URL}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error || !data.url) {
    log.warn('auth.oauth.error', { code: error?.code });
    redirect('/connexion?raison=erreur');
  }
  redirect(data.url);
}
