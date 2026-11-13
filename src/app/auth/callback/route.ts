import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabaseUser } from '@/lib/supabase/server';
import { safeNextPath } from '@/lib/validation';
import { appUrl } from '@/lib/server/app-url';
import { log } from '@/lib/server/log';

const COOKIE_OPTS = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/' };
const OTP_TYPES: EmailOtpType[] = ['magiclink', 'email', 'signup', 'recovery', 'email_change'];

/**
 * Retour du lien magique ou de Google.
 *  - token_hash (lien email) : fonctionne même si l'email est ouvert sur un autre
 *    appareil ou dans l'application Gmail que celui qui a demandé le lien ;
 *  - code (Google, ou ancien format de lien) : exige le même navigateur.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  // Pas de redirection ouverte : seul un chemin interne est accepté.
  const next = safeNextPath(url.searchParams.get('next'), '/profil');
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const providerError = url.searchParams.get('error_code');

  const fail = (raison: string) => NextResponse.redirect(appUrl(`/connexion?raison=${raison}`));

  if (providerError) {
    log.warn('auth.callback.provider_error', { code: providerError.slice(0, 40) });
    return fail(providerError === 'otp_expired' ? 'expire' : 'lien');
  }

  const supabase = await supabaseUser();

  if (tokenHash && /^[\w-]{10,200}$/.test(tokenHash) && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) {
      log.warn('auth.callback.otp_error', { code: error.code });
      return fail(error.code === 'otp_expired' ? 'expire' : 'lien');
    }
  } else if (code && /^[\w-]{10,200}$/.test(code)) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      log.warn('auth.callback.code_error', { code: error.code });
      return fail(error.code === 'pkce_code_verifier_not_found' ? 'appareil' : 'lien');
    }
  } else {
    return fail('lien');
  }

  const res = NextResponse.redirect(appUrl(next));
  const now = String(Date.now());
  res.cookies.set('st_start', now, COOKIE_OPTS); // début de session (max 7 jours)
  res.cookies.set('st_seen', now, COOKIE_OPTS);
  return res;
}
