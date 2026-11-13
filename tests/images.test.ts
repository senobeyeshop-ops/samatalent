// Règle 11 — tests du contrôle des fichiers envoyés.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { processImage, sniff, ImageRejected } from '../src/lib/server/image.ts';

const photo = (w = 800, h = 600) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 232, g: 163, b: 23 } } });

const rejects = async (buf: Uint8Array, motif: RegExp) => {
  await assert.rejects(processImage(buf, 'listing'), (e: unknown) => e instanceof ImageRejected && motif.test(e.reason));
};

test('une vraie photo JPEG est acceptée et convertie en WebP', async () => {
  const jpg = await photo(3000, 2000).jpeg().toBuffer();
  const out = await processImage(jpg, 'listing');
  assert.equal(sniff(out.data), 'webp');
  assert.ok(out.width <= 1200 && out.height <= 1200, 'redimensionnée');
});

test('la position GPS et les métadonnées sont supprimées', async () => {
  const jpg = await photo()
    .jpeg()
    .withExif({
      IFD0: { Make: 'TelephoneTest', Copyright: 'Awa Diop' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '14/1 44/1 0/1', GPSLongitudeRef: 'W', GPSLongitude: '17/1 30/1 0/1' },
    })
    .toBuffer();
  assert.ok((await sharp(jpg).metadata()).exif, 'le fichier de test contient bien de l’EXIF');
  const out = await processImage(jpg, 'listing');
  const meta = await sharp(out.data).metadata();
  assert.equal(meta.exif, undefined, 'plus aucun EXIF');
  assert.equal(meta.icc, undefined);
  assert.equal(out.data.includes(Buffer.from('Awa Diop')), false);
});

test('un fichier texte renommé en .jpg est refusé', async () => {
  await rejects(new TextEncoder().encode('<?php system($_GET["c"]); ?> ceci n’est pas une image'), /Format/);
});

test('un SVG (qui peut contenir du script) est refusé', async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><script>alert(1)</script><rect width="400" height="400"/></svg>';
  await rejects(new TextEncoder().encode(svg), /Format/);
});

test('un faux JPEG (bons premiers octets, contenu bidon) est refusé', async () => {
  const fake = new Uint8Array(5000).fill(0x41);
  fake.set([0xff, 0xd8, 0xff, 0xe0]);
  await rejects(fake, /illisible|corrompue|valide/);
});

test('une « bombe » d’image (énorme une fois décompressée) est refusée', async () => {
  const bomb = await photo(10000, 10000).png({ compressionLevel: 9 }).toBuffer();
  assert.ok(bomb.byteLength < 2 * 1024 * 1024, 'le piège pèse moins de 2 Mo');
  await rejects(bomb, /grande|illisible/);
});

test('un fichier de plus de 2 Mo est refusé', async () => {
  await rejects(new Uint8Array(2 * 1024 * 1024 + 1), /lourde/);
});

test('une image minuscule (pixel espion) est refusée', async () => {
  await rejects(await photo(1, 1).png().toBuffer(), /petite/);
});

test('un script caché à la fin d’une vraie image disparaît au ré-encodage', async () => {
  const jpg = await photo().jpeg().toBuffer();
  const piege = Buffer.concat([jpg, Buffer.from('<script>alert("piratage")</script>')]);
  const out = await processImage(piege, 'listing');
  assert.equal(out.data.includes(Buffer.from('piratage')), false);
});

test('avatar recadré en carré 512 × 512', async () => {
  const out = await processImage(await photo(1600, 900).png().toBuffer(), 'avatar');
  assert.equal(out.width, 512);
  assert.equal(out.height, 512);
});
