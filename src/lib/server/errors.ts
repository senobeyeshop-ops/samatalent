import 'server-only';
import { randomBytes } from 'node:crypto';
import { log } from './log';

// Règle 17 — l'utilisateur ne voit jamais le détail technique.
// Il reçoit un message simple + une référence ; le détail reste dans le
// journal serveur sous cette même référence, pour pouvoir enquêter.

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fields?: Record<string, string> };

const KNOWN: Record<string, string> = {
  '42501': "Vous n'avez pas le droit de faire cette action.",
  '28000': 'Veuillez vous connecter.',
  '23505': 'Cet élément existe déjà.',
  '23514': 'Certaines informations ne sont pas valides.',
  '23503': 'Une information fait référence à un élément introuvable.',
  '54000': 'Trop de demandes en attente, réessayez plus tard.',
};

export function publicError(err: unknown, context: string): { ok: false; error: string } {
  const ref = randomBytes(3).toString('hex').toUpperCase();
  const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: unknown }).code) : undefined;
  log.error(context, { ref, code, err });
  return {
    ok: false,
    error: (code && KNOWN[code]) ?? `Une erreur est survenue (réf. ${ref}).`,
  };
}
