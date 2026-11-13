import 'server-only';
import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { log } from './log';

// Réponses JSON homogènes pour les routes /api — jamais de détail technique (règle 17).

export const json = (status: number, body: Record<string, unknown>) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export const fail = (status: number, error: string) => json(status, { ok: false, error });

export function serverFail(err: unknown, context: string) {
  const ref = randomBytes(3).toString('hex').toUpperCase();
  log.error(context, { ref, err });
  return fail(500, `Une erreur est survenue (réf. ${ref}).`);
}

/** Refuse un envoi trop gros AVANT de le lire, d'après l'en-tête Content-Length. */
export function tooLarge(request: Request, maxBytes: number) {
  const len = Number(request.headers.get('content-length') ?? '0');
  return !Number.isFinite(len) || len > maxBytes + 64 * 1024; // marge pour l'enveloppe multipart
}
