// Tests des protections côté serveur — lancer : npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listingSchema, normalizePhone, profileSchema, safeNextPath, emailSchema } from '../src/lib/validation.ts';

test('règle 9 — annonce : prix trafiqué, champs inconnus, textes trop courts', () => {
  const input = {
    type: 'service', category_slug: 'services', title: 'Plombier à Yoff',
    description: 'Toutes réparations, intervention rapide 7j/7.', price_xof: '15 000', city: 'Dakar', country_code: 'SN',
  };
  const ok = listingSchema.safeParse(input);
  assert.ok(ok.success);
  assert.equal(ok.data.price_xof, 15000);

  // un champ « boosted_until » glissé dans le formulaire disparaît
  const sneaky = listingSchema.parse({ ...input, boosted_until: '2099-01-01', owner_id: 'x', status: 'hidden' });
  assert.equal('boosted_until' in sneaky, false);
  assert.equal('owner_id' in sneaky, false);
  assert.equal('status' in sneaky, false);

  assert.equal(listingSchema.safeParse({ ...input, price_xof: '-5' }).success, false);
  assert.equal(listingSchema.safeParse({ ...input, price_xof: '1e9' }).success, false);
  assert.equal(listingSchema.safeParse({ ...input, title: 'abc' }).success, false);
  assert.equal(listingSchema.safeParse({ ...input, type: 'admin' }).success, false);
  assert.equal(listingSchema.safeParse({ ...input, country_code: 'FR' }).success, false);
  // caractères d'inversion de texte (arnaques par faux noms de fichier / liens)
  assert.equal(listingSchema.safeParse({ ...input, title: 'Offre ‮gpj.exe' }).success, false);
});

test('règle 9 — téléphone normalisé selon le pays UEMOA', () => {
  assert.equal(normalizePhone('77 123 45 67', 'SN'), '+221771234567');
  assert.equal(normalizePhone('+221 77 123 45 67', 'SN'), '+221771234567');
  assert.equal(normalizePhone('00225 07 07 07 07 07', 'CI'), '+2250707070707');
  assert.equal(normalizePhone('7712345', 'SN'), null); // trop court
  assert.equal(normalizePhone('+33612345678', 'SN'), null); // mauvais pays
  const p = profileSchema.safeParse({ display_name: 'Awa', country_code: 'SN', whatsapp: '12' });
  assert.equal(p.success, false);
});

test('règle 9 — email', () => {
  assert.equal(emailSchema.parse('  Awa@Exemple.SN '), 'awa@exemple.sn');
  assert.equal(emailSchema.safeParse('pas-un-email').success, false);
});

test('OWASP A01 — pas de redirection ouverte après connexion', () => {
  assert.equal(safeNextPath('/publier'), '/publier');
  assert.equal(safeNextPath('https://pirate.com'), '/');
  assert.equal(safeNextPath('//pirate.com'), '/');
  assert.equal(safeNextPath('/\\pirate.com'), '/');
  assert.equal(safeNextPath(null, '/profil'), '/profil');
});
