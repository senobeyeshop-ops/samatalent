// Règle 18 — masquage des données personnelles avant journalisation.
// Fichier sans dépendance serveur pour pouvoir être testé (tests/logs.test.ts).

const SENSITIVE_KEYS =
  /pass(word)?|token|secret|authorization|cookie|api[_-]?key|session|email|phone|whatsapp|^body$|message|description|bio|ip$/i;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /\+?\d[\d\s.-]{6,}\d/g;
const JWT = /eyJ[\w-]+\.[\w-]+\.[\w-]+/g;
const BEARER = /(bearer\s+)[\w.-]+/gi;

function redactString(s: string) {
  // les uuid sont des identifiants techniques utiles : on les met de côté
  const kept: string[] = [];
  const masked = s
    .replace(UUID, (m) => `\u0000${kept.push(m) - 1}\u0000`)
    .replace(JWT, '[jeton]')
    .replace(BEARER, '$1[jeton]')
    .replace(EMAIL, '[email]')
    .replace(PHONE, '[téléphone]');
  return masked.replace(/\u0000(\d+)\u0000/g, (_, i) => kept[Number(i)]);
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[…]';
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: redactString(value.message) };
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEYS.test(k) ? '[masqué]' : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}
