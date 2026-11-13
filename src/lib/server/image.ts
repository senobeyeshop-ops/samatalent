// Règle 11 — contrôle du type et de la taille des fichiers.
// Sans dépendance « server-only » pour pouvoir être testé (tests/images.test.ts) ;
// n'est importé que par des routes serveur.
import sharp, { type Metadata } from 'sharp';

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2 Mo
const MAX_INPUT_PIXELS = 40_000_000; // ~ 6300 × 6300 : au-delà, c'est une « bombe » d'image
type Allowed = 'jpeg' | 'png' | 'webp';

export class ImageRejected extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(reason);
    this.reason = reason;
  }
}

/**
 * Lit les PREMIERS OCTETS du fichier : c'est eux qui disent ce qu'est vraiment
 * le fichier, pas son nom (« photo.jpg ») ni le type annoncé par le navigateur,
 * que n'importe qui peut falsifier.
 */
export function sniff(buf: Uint8Array): Allowed | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => buf[i] === b)) return 'png';
  const ascii = (a: number, b: number) => String.fromCharCode(...buf.subarray(a, b));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  return null;
}

export type Variant = 'listing' | 'avatar';

/**
 * Valide puis RÉ-ENCODE l'image. Le fichier stocké est une image neuve,
 * fabriquée par nous : tout ce qui était caché dans l'original (script,
 * archive collée à la fin, métadonnées, position GPS) est perdu.
 */
export async function processImage(input: Uint8Array, variant: Variant) {
  if (input.byteLength === 0) throw new ImageRejected('Fichier vide.');
  if (input.byteLength > MAX_UPLOAD_BYTES) throw new ImageRejected('Image trop lourde (2 Mo maximum).');

  const kind = sniff(input);
  if (!kind) throw new ImageRejected('Format non accepté : JPEG, PNG ou WebP uniquement.');

  const decoder = () =>
    sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error', animated: false, sequentialRead: true });

  let meta: Metadata;
  try {
    meta = await decoder().metadata();
  } catch {
    throw new ImageRejected('Image illisible ou corrompue.');
  }
  // Double contrôle : le décodeur doit être d'accord avec les octets lus.
  if (meta.format !== kind) throw new ImageRejected('Le contenu ne correspond pas à une image valide.');
  if (!meta.width || !meta.height) throw new ImageRejected('Image illisible.');
  if (meta.width * meta.height > MAX_INPUT_PIXELS) throw new ImageRejected('Image trop grande.');
  if (meta.width < 200 || meta.height < 200) throw new ImageRejected('Image trop petite (200 × 200 pixels minimum).');

  try {
    let img = decoder().rotate(); // applique l'orientation du téléphone, puis l'oublie
    img =
      variant === 'avatar'
        ? img.resize(512, 512, { fit: 'cover', position: 'attention' })
        : img.resize(1200, 1200, { fit: 'inside', withoutEnlargement: true });
    // sharp n'écrit AUCUNE métadonnée par défaut (pas d'EXIF, pas de GPS, pas d'ICC)
    const { data, info } = await img.webp({ quality: 80, effort: 4 }).toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height, bytes: info.size };
  } catch {
    throw new ImageRejected('Image illisible ou corrompue.');
  }
}

/** Lit au plus `limit` octets d'un fichier envoyé, sans tout charger en mémoire au préalable. */
export async function readLimited(file: File, limit = MAX_UPLOAD_BYTES) {
  if (file.size > limit) throw new ImageRejected('Image trop lourde (2 Mo maximum).');
  const reader = file.stream().getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new ImageRejected('Image trop lourde (2 Mo maximum).');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}
