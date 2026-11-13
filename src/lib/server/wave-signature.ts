// Règle 15 — vérification de la signature des webhooks Wave.
// Fichier sans dépendance serveur pour être testé (tests/wave.test.ts).
//
// Format (docs.wave.com/webhook) :
//   Wave-Signature: t=1639081943,v1=<hex>[,v1=<hex>…]
//   v1 = HMAC-SHA256(secret, `${t}${corpsBrut}`)   ← horodatage collé au corps, sans séparateur
// Plusieurs v1 possibles pendant une rotation de clé. Fenêtre conseillée : 5 minutes.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const WAVE_TOLERANCE_S = 5 * 60;

export type SignatureCheck = { ok: true } | { ok: false; reason: 'missing' | 'malformed' | 'stale' | 'mismatch' };

export function parseWaveSignature(header: string | null) {
  if (!header) return null;
  let t: number | null = null;
  const v1: string[] = [];
  for (const part of header.split(',')) {
    const [k, ...rest] = part.trim().split('=');
    const value = rest.join('=');
    if (k === 't' && /^\d{9,11}$/.test(value)) t = Number(value);
    else if (k === 'v1' && /^[0-9a-f]{64}$/i.test(value)) v1.push(value.toLowerCase());
  }
  if (t === null || v1.length === 0) return null;
  return { t, v1 };
}

export function verifyWaveSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowS: number = Math.floor(Date.now() / 1000),
): SignatureCheck {
  if (!header) return { ok: false, reason: 'missing' };
  const parsed = parseWaveSignature(header);
  if (!parsed) return { ok: false, reason: 'malformed' };
  if (Math.abs(nowS - parsed.t) > WAVE_TOLERANCE_S) return { ok: false, reason: 'stale' }; // anti-rejeu

  const expected = Buffer.from(createHmac('sha256', secret).update(`${parsed.t}${rawBody}`).digest('hex'));
  const match = parsed.v1.some((sig) => {
    const given = Buffer.from(sig);
    return given.length === expected.length && timingSafeEqual(given, expected); // comparaison à temps constant
  });
  return match ? { ok: true } : { ok: false, reason: 'mismatch' };
}
