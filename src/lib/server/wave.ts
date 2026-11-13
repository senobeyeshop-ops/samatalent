import 'server-only';
import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { log } from './log';

/**
 * Client Wave Checkout (docs.wave.com/checkout).
 * Règle 1 : clés lues ici seulement, jamais envoyées au navigateur.
 * Règle 14 : le montant transmis vient TOUJOURS de la base (create_boost_payment).
 */

const WAVE_API = 'https://api.wave.com/v1';

const waveEnvSchema = z.object({
  WAVE_API_KEY: z.string().min(20),
  WAVE_WEBHOOK_SECRET: z.string().min(16),
  // Facultatif : à renseigner seulement si la « signature des requêtes » est activée sur la clé API chez Wave
  WAVE_SIGNING_SECRET: z.string().min(16).optional(),
});

/** null tant que Wave n'est pas configuré : le bouton Booster affiche alors « bientôt disponible ». */
export function waveEnv() {
  const parsed = waveEnvSchema.safeParse(process.env);
  return parsed.success ? parsed.data : null;
}

const sessionSchema = z.object({
  id: z.string().regex(/^cos-[A-Za-z0-9]+$/),
  wave_launch_url: z.string().url().refine((u) => new URL(u).protocol === 'https:'),
  checkout_status: z.string(),
  payment_status: z.string(),
  amount: z.string(),
  currency: z.string(),
  client_reference: z.string().nullable().optional(),
});
export type WaveSession = z.infer<typeof sessionSchema>;

async function waveFetch(path: string, init: { method: 'GET' | 'POST'; body?: unknown }) {
  const env = waveEnv();
  if (!env) throw new Error('wave_not_configured');
  const body = init.body === undefined ? undefined : JSON.stringify(init.body);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.WAVE_API_KEY}`,
    'Content-Type': 'application/json',
  };
  if (env.WAVE_SIGNING_SECRET && body) {
    const t = Math.floor(Date.now() / 1000);
    headers['Wave-Signature'] = `t=${t},v1=${createHmac('sha256', env.WAVE_SIGNING_SECRET).update(`${t}${body}`).digest('hex')}`;
  }
  const res = await fetch(`${WAVE_API}${path}`, {
    method: init.method,
    headers,
    body,
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    // Code d'erreur Wave seulement, jamais la clé ni le corps complet (règle 18)
    log.warn('wave.api_error', { path: path.split('/').slice(0, 3).join('/'), status: res.status, code: json?.code });
    throw new Error(`wave_${res.status}`);
  }
  return json;
}

export async function createCheckoutSession(input: {
  amountXof: number;
  paymentId: string;
  successUrl: string;
  errorUrl: string;
}): Promise<WaveSession> {
  if (!Number.isInteger(input.amountXof) || input.amountXof <= 0) throw new Error('invalid_amount');
  const json = await waveFetch('/checkout/sessions', {
    method: 'POST',
    body: {
      amount: String(input.amountXof), // XOF : entier, pas de décimales
      currency: 'XOF',
      client_reference: input.paymentId,
      success_url: input.successUrl,
      error_url: input.errorUrl,
    },
  });
  return sessionSchema.parse(json);
}

export async function getCheckoutSession(sessionId: string): Promise<WaveSession> {
  if (!/^cos-[A-Za-z0-9]+$/.test(sessionId)) throw new Error('invalid_session_id');
  return sessionSchema.parse(await waveFetch(`/checkout/sessions/${sessionId}`, { method: 'GET' }));
}
