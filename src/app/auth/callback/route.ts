import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabaseUser } from '@/lib/supabase/server';
import { safeNextPath } from '@/lib/validation';
import { log } from '@/lib/server/log';

const COOKIE_OPTS = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/' };
const OTP_TYPES: EmailOtpType[] = ['magiclink', 'email', 'signup', 'recovery', 'email_change'];

// Retour du lien magique ou de Google : on échange le code contre une session.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  // Pas de redirection ouverte : seul un chemin interne est accepté.
  const next = safeNextPath(url.searchParams.get('next'), '/profil');
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;

  const supabase = await supabaseUser();
  let ok = false;

  if (code && /^[\w-]{10,200}$/.test(code)) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
    if (error) log.warn('auth.callback.code_error', { code: error.code });
  } else if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    ok = !error;
    if (error) log.warn('auth.callback.otp_error', { code: error.code });
  }

  if (!ok) return NextResponse.redirect(new URL('/connexion?raison=lien', url.origin));

  const res = NextResponse.redirect(new URL(next, url.origin));
  const now = String(Date.now());
  res.cookies.set('st_start', now, COOKIE_OPTS); // début de session (max 7 jours)
  res.cookies.set('st_seen', now, COOKIE_OPTS);
  return res;
}
