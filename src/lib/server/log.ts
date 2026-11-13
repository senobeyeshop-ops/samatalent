import 'server-only';
import { redact } from './redact';

// Règle 18 — tout passe par ce logger, qui masque emails, téléphones,
// jetons et clés avant d'écrire quoi que ce soit.

type Level = 'info' | 'warn' | 'error';

function write(level: Level, event: string, meta: Record<string, unknown> = {}) {
  const line = JSON.stringify({
    t: new Date().toISOString(),
    level,
    event,
    ...(redact(meta) as Record<string, unknown>),
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const log = {
  info: (event: string, meta?: Record<string, unknown>) => write('info', event, meta),
  warn: (event: string, meta?: Record<string, unknown>) => write('warn', event, meta),
  error: (event: string, meta?: Record<string, unknown>) => write('error', event, meta),
};
