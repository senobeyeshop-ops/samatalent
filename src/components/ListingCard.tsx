import Image from 'next/image';
import Link from 'next/link';
import {
  categoryName,
  countryName,
  firstPhoto,
  formatDate,
  formatPrice,
  publicImage,
  typeName,
  type ListingRow,
} from '@/lib/format';

export function ListingCard({ l }: { l: ListingRow }) {
  const boosted = l.boosted_until && new Date(l.boosted_until) > new Date();
  const price = formatPrice(l.price_xof, l.price_negotiable);
  const img = publicImage('listings', firstPhoto(l.listing_photos));
  return (
    <Link
      href={`/annonces/${l.id}`}
      className={`card block overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md ${boosted ? 'border-2 border-saffron' : ''}`}
    >
      {img && (
        <div className="relative aspect-[4/3] bg-line">
          <Image src={img} alt="" fill sizes="(max-width: 640px) 100vw, 360px" className="object-cover" />
        </div>
      )}
      <div className="p-4">
        <div className="flex items-center gap-2 text-xs text-ink-soft">
          <span className="rounded-full bg-saffron-soft px-2 py-0.5 font-medium text-ink">{typeName(l.type)}</span>
          <span>{categoryName(l.category_slug)}</span>
          {boosted && <span className="ml-auto font-semibold text-saffron">★ En avant</span>}
        </div>
        <h3 className="mt-2 line-clamp-2 font-semibold">{l.title}</h3>
        {price && <p className="mt-1 text-sm font-medium">{price}</p>}
        <p className="mt-2 text-xs text-ink-soft">
          {l.city}, {countryName(l.country_code)} · {formatDate(l.created_at)}
        </p>
      </div>
    </Link>
  );
}
