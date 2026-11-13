// Règle 18 — aucune donnée personnelle ne doit sortir du logger.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redact } from '../src/lib/server/redact.ts';

test('masque emails, téléphones, jetons et champs sensibles', () => {
  const out = JSON.stringify(
    redact({
      event: 'x',
      note: 'contact awa.diop@gmail.com ou +221 77 123 45 67',
      header: 'Bearer abc.def.ghi',
      jwt: 'eyJhbGciOi.eyJzdWIiOi.SflKxwRJ',
      email: 'awa@x.sn',
      password: 'secret',
      nested: { whatsapp: '+221771234567', userId: '11111111-1111-1111-1111-111111111111' },
      err: new Error('échec pour moussa@exemple.com'),
    }),
  );
  for (const leak of ['awa.diop@gmail.com', '77 123 45 67', 'abc.def.ghi', 'eyJhbGciOi', 'awa@x.sn', 'secret', '+221771234567', 'moussa@exemple.com']) {
    assert.equal(out.includes(leak), false, `fuite : ${leak}`);
  }
  // les identifiants techniques restent lisibles pour enquêter
  assert.ok(out.includes('11111111-1111-1111-1111-111111111111'));
});
