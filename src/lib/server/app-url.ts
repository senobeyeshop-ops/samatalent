import 'server-only';
import { serverEnv } from './env';

/**
 * Adresse absolue sur le domaine OFFICIEL du site.
 * Sur Netlify, une route serveur voit parfois l'adresse interne du déploiement
 * (main--samatalent.netlify.app) au lieu de l'adresse publique : rediriger vers
 * request.url enverrait l'utilisateur sur un domaine où ses formulaires seraient
 * refusés par le contrôle d'origine (règle 13). On redirige donc toujours ici.
 */
export function appUrl(path: string) {
  return new URL(path, serverEnv().NEXT_PUBLIC_APP_URL);
}
