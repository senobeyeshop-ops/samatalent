import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * S'exécute AVANT chaque page. Il applique :
 *  - règle 12 : Content-Security-Policy avec nonce unique par requête
 *  - règle 13 : seules les requêtes venant de NOTRE domaine peuvent modifier des données
 *  - règle 8  : expiration des sessions (inactivité + durée maximale)
 *  - règle 5  : pages protégées et admin (revérifiées ensuite dans chaque page)
 */

const INACTIVITY_MS = 30 * 60 * 1000; //   30 min sans activité → déconnexion
const ADMIN_INACTIVITY_MS = 15 * 60 * 1000; // 15 min pour l'admin
const MAX_SESSION_MS = 7 * 24 * 3600 * 1000; // 7 jours maximum, puis reconnexion
const PROTECTED = ['/profil', '/publier', '/mes-annonces', '/messages', '/admin'];
const WEBHOOKS = ['/api/webhooks/']; // protégés par signature, pas par l'origine

const COOKIE_OPTS = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/' };

function buildCsp(nonce: string) {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const isDev = process.env.NODE_ENV === 'development';
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? ` 'unsafe-eval'` : ''}`,
    `style-src 'self' 'nonce-${nonce}'${isDev ? ` 'unsafe-inline'` : ''}`,
    // attributs style="" (taille des images) : du CSS seul, qui ne peut exécuter aucun code
    `style-src-attr 'unsafe-inline'`,
    `img-src 'self' blob: data: ${supabase}`,
    `font-src 'self'`,
    `connect-src 'self' ${supabase} ${supabase.replace('https://', 'wss://')}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    // la connexion Google redirige vers Supabase puis Google
    `form-action 'self' ${supabase} https://accounts.google.com`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join('; ');
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();

  // ---- Règle 13 : contrôle d'origine sur toute requête qui modifie ----
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !WEBHOOKS.some((p) => pathname.startsWith(p))) {
    const allowed = new URL(process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin).origin;
    const origin = request.headers.get('origin');
    if (origin !== allowed) {
      return new NextResponse('Origine refusée', { status: 403 });
    }
  }

  // ---- Règle 12 : nonce + CSP ----
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce);
  const forward = () => {
    const h = new Headers(request.headers);
    h.set('x-nonce', nonce);
    h.set('Content-Security-Policy', csp);
    return h;
  };

  let response = NextResponse.next({ request: { headers: forward() } });

  // ---- Session Supabase (rafraîchie ici, cookies HttpOnly) ----
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list, headers) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: forward() } });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
        },
      },
    },
  );

  // Lecture de la session. getClaims() vérifie la signature du jeton localement ;
  // si elle échoue alors qu'un cookie de session est présent (constaté sur l'edge
  // Netlify), on demande au serveur d'authentification (getUser), qui fait foi.
  const hasSessionCookie = request.cookies.getAll().some((c) => c.name.startsWith('sb-') && c.name.includes('-auth-token'));
  let userId: string | undefined;
  let aal: string | undefined;
  let claimsError: string | undefined;
  try {
    const { data, error } = await supabase.auth.getClaims();
    userId = data?.claims?.sub;
    aal = data?.claims?.aal as string | undefined;
    if (error) claimsError = error.code ?? error.name;
  } catch (e) {
    claimsError = e instanceof Error ? e.name : 'exception';
  }
  if (!userId && hasSessionCookie) {
    const { data: u, error: userError } = await supabase.auth.getUser();
    if (u.user) {
      userId = u.user.id;
      const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      aal = level?.currentLevel ?? undefined;
    }
    // Journal sans donnée personnelle : seulement des codes d'erreur (règle 18)
    // eslint-disable-next-line no-console
    console.warn(
      JSON.stringify({
        event: 'proxy.session_fallback',
        claimsError: claimsError ?? 'none',
        getUser: u.user ? 'ok' : (userError?.code ?? userError?.name ?? 'no_user'),
      }),
    );
  }
  const isAdminPath = pathname === '/admin' || pathname.startsWith('/admin/');

  const finish = (res: NextResponse) => {
    res.headers.set('Content-Security-Policy', csp);
    // recopie des cookies de session éventuellement rafraîchis
    if (res !== response) response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };
  const redirectTo = (path: string) => finish(NextResponse.redirect(new URL(path, request.url)));

  // ---- Règle 8 : expiration des sessions ----
  if (userId) {
    const now = Date.now();
    const seen = Number(request.cookies.get('st_seen')?.value ?? now);
    const start = Number(request.cookies.get('st_start')?.value ?? now);
    const limit = isAdminPath ? ADMIN_INACTIVITY_MS : INACTIVITY_MS;

    if (now - seen > limit || now - start > MAX_SESSION_MS) {
      await supabase.auth.signOut({ scope: 'local' });
      const res = redirectTo(`/connexion?raison=expiree&next=${encodeURIComponent(pathname)}`);
      res.cookies.delete('st_seen');
      res.cookies.delete('st_start');
      return res;
    }
    response.cookies.set('st_seen', String(now), COOKIE_OPTS);
    if (!request.cookies.get('st_start')) response.cookies.set('st_start', String(now), COOKIE_OPTS);
  }

  // ---- Règle 5 : pages protégées ----
  const needsAuth = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (needsAuth && !userId) {
    // Un cookie de session est là mais l'edge n'a pas su le lire : on laisse la page
    // décider (chaque page protégée appelle requireUser/requireAdmin côté serveur,
    // qui redirige lui-même vers /connexion si la session est vraiment absente).
    // Sans cela, le proxy et la page se contredisent et l'utilisateur fait des
    // allers-retours entre /publier et /connexion.
    // Journal : seulement les NOMS des cookies sb-*, jamais leurs valeurs (règle 18).
    const sbNames = request.cookies.getAll().map((c) => c.name).filter((n) => n.startsWith('sb-'));
    // eslint-disable-next-line no-console
    console.warn(JSON.stringify({ event: 'proxy.protected_no_user', path: pathname, sbCookies: sbNames }));
    if (!hasSessionCookie) return redirectTo(`/connexion?next=${encodeURIComponent(pathname)}`);
  }

  if (isAdminPath && userId) {
    // 1re barrière : rôle admin lu en base (RLS : on ne lit que sa propre ligne)
    const { data: me } = await supabase.from('profiles').select('role,status').eq('id', userId).maybeSingle();
    const isAdmin = me?.role === 'admin' && me?.status === 'active';
    // On répond « page introuvable » pour ne pas révéler que /admin existe.
    if (!isAdmin) return finish(NextResponse.rewrite(new URL('/introuvable', request.url), { status: 404 }));
    // MFA obligatoire pour l'admin
    if (aal !== 'aal2') return redirectTo('/connexion/mfa?next=/admin');
  }

  return finish(response);
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|robots.txt).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
