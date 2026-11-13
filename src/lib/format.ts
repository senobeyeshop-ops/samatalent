import { CATEGORIES, COUNTRIES, LISTING_TYPES } from './validation';

const fcfa = new Intl.NumberFormat('fr-SN', { maximumFractionDigits: 0 });

export function formatPrice(price: number | null, negotiable: boolean) {
  if (price === null) return negotiable ? 'Prix à discuter' : null;
  return `${fcfa.format(price).replace(/ /g, ' ')} FCFA${negotiable ? ' · négociable' : ''}`;
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat('fr-SN', { dateStyle: 'medium', timeZone: 'Africa/Dakar' }).format(new Date(iso));
}

export const countryName = (c: string) => COUNTRIES[c as keyof typeof COUNTRIES]?.name ?? c;
export const categoryName = (c: string) => CATEGORIES[c as keyof typeof CATEGORIES] ?? c;
export const typeName = (t: string) => LISTING_TYPES[t as keyof typeof LISTING_TYPES] ?? t;

/** Adresse publique d'une image stockée (bucket public, fichier WebP ré-encodé par nous). */
export function publicImage(bucket: 'listings' | 'avatars', path: string | null | undefined) {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${base}/storage/v1/object/public/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

export type PhotoRow = { id?: string; path: string; position: number };
export const firstPhoto = (photos?: PhotoRow[] | null) =>
  photos && photos.length ? [...photos].sort((a, b) => a.position - b.position)[0].path : null;

export type ListingRow = {
  id: string;
  type: string;
  category_slug: string;
  title: string;
  price_xof: number | null;
  price_negotiable: boolean;
  city: string;
  country_code: string;
  boosted_until: string | null;
  created_at: string;
  listing_photos?: PhotoRow[] | null;
};

export const LISTING_CARD_COLUMNS =
  'id, type, category_slug, title, price_xof, price_negotiable, city, country_code, boosted_until, created_at, listing_photos(path, position)';
