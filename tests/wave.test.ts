// Règle 15 — tests de la vérification de signature des webhooks Wave.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyWaveSignature } from '../src/lib/server/wave-signature.ts';

const SECRET = 'secret-factice-pour-les-tests-uniquement';
const body = JSON.stringify({
  id: 'EV_test123',
  type: 'checkout.session.completed',
  data: { id: 'cos-18qq25rgr100a', amount: '1000', currency: 'XOF', client_reference: 'abc', payment_status: 'succeeded' },
});
const now = 1_800_000_000;
const sign = (t: number, b: string, s = SECRET) => createHmac('sha256', s).update(`${t}${b}`).digest('hex');

test('une signature valide est acceptée', () => {
  assert.deepEqual(verifyWaveSignature(body, `t=${now},v1=${sign(now, body)}`, SECRET, now), { ok: true });
});

test('rotation de clé : une des signatures v1 suffit', () => {
  const h = `t=${now},v1=${sign(now, body, 'ancienne-cle')},v1=${sign(now, body)}`;
  assert.equal(verifyWaveSignature(body, h, SECRET, now).ok, true);
});

test('faux « paiement réussi » signé avec une autre clé : refusé', () => {
  const r = verifyWaveSignature(body, `t=${now},v1=${sign(now, body, 'cle-du-pirate')}`, SECRET, now);
  assert.deepEqual(r, { ok: false, reason: 'mismatch' });
});

test('montant modifié après signature : refusé', () => {
  const h = `t=${now},v1=${sign(now, body)}`;
  const trafique = body.replace('"amount":"1000"', '"amount":"1"');
  assert.equal(verifyWaveSignature(trafique, h, SECRET, now).ok, false);
});

test('rejeu d’un vieux message (> 5 min) : refusé', () => {
  const old = now - 301;
  assert.deepEqual(verifyWaveSignature(body, `t=${old},v1=${sign(old, body)}`, SECRET, now), { ok: false, reason: 'stale' });
});

test('signature avec un point entre horodatage et corps (mauvais format) : refusée', () => {
  const wrong = createHmac('sha256', SECRET).update(`${now}.${body}`).digest('hex');
  assert.equal(verifyWaveSignature(body, `t=${now},v1=${wrong}`, SECRET, now).ok, false);
});

test('en-tête absent ou mal formé : refusé', () => {
  assert.deepEqual(verifyWaveSignature(body, null, SECRET, now), { ok: false, reason: 'missing' });
  assert.deepEqual(verifyWaveSignature(body, 'n importe quoi', SECRET, now), { ok: false, reason: 'malformed' });
  assert.deepEqual(verifyWaveSignature(body, `t=${now}`, SECRET, now), { ok: false, reason: 'malformed' });
});
