import 'server-only';
import { createHmac } from 'node:crypto';
import { headers } from 'next/headers';
import { secretEnv } from './env';
import { supabaseService } from '@/lib/supabase/server';
import { log } from './log';

// Règle 7 — limiter les tentatives.
// La clé stockée en base est une empreinte HMAC : on ne garde jamais
// l'adresse IP ni l'email en clair (règle 18).

export const LIMITS = {
  magicLinkIp: { max: 5, windowS: 15 * 60 },
  magicLinkEmail: { max: 3, windowS: 15 * 60 },
  createListing: { max: 10, windowS: 24 * 3600 },
  updateProfile: { max: 30, windowS: 3600 },
  contactWhatsapp: { max: 20, windowS: 3600 },
  photoUpload: { max: 20, windowS: 3600 },
  avatarUpload: { max: 10, windowS: 3600 },
  report: { max: 10, windowS: 24 * 3600 },
  listingWrite: { max: 60, windowS: 3600 },
  boostCheckout: { max: 10, windowS: 3600 },
} as const;

export function fingerprint(kind: string, value: string) {
  return `${kind}:${createHmac('sha256', secretEnv().RATE_LIMIT_SALT).update(value.toLowerCase()).digest('hex').slice(0, 32)}`;
}

export async function clientIp() {
  const h = await headers();
  // Netlify fournit l'IP réelle dans x-nf-client-connection-ip
  return (
    h.get('x-nf-client-connection-ip') ??
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'inconnue'
  );
}

/** true = autorisé ; false = trop de tentatives. En cas de panne, on refuse (fail closed). */
export async function allow(key: string, limit: { max: number; windowS: number }) {
  const { data, error } = await supabaseService().rpc('hit_rate_limit' as never, {
    p_key: key,
    p_max: limit.max,
    p_window_s: limit.windowS,
  } as never);
  if (error) {
    log.error('rate_limit.failure', { code: error.code });
    return false;
  }
  return data === true;
}
