'use client';

import Image from 'next/image';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type Photo = { id: string; url: string; position: number };

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Les contrôles ici ne sont qu'un confort (message immédiat).
// La vraie vérification est faite par le serveur (src/lib/server/image.ts).
export function PhotoManager({ listingId, photos }: { listingId: string; photos: Photo[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const full = photos.length >= 5;

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setBusy(true);
    try {
      for (const file of Array.from(files).slice(0, 5 - photos.length)) {
        if (!TYPES.includes(file.type)) throw new Error('Format accepté : JPEG, PNG ou WebP.');
        if (file.size > MAX_BYTES) throw new Error(`« ${file.name} » dépasse 2 Mo.`);
        const body = new FormData();
        body.append('file', file);
        const res = await fetch(`/api/listings/${listingId}/photos`, { method: 'POST', body });
        const out = await res.json().catch(() => ({ error: 'Envoi impossible.' }));
        if (!res.ok) throw new Error(out.error ?? 'Envoi impossible.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Envoi impossible.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
      startTransition(() => router.refresh());
    }
  }

  async function remove(id: string) {
    setError(null);
    const res = await fetch(`/api/photos/${id}`, { method: 'DELETE' });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? 'Suppression impossible.');
    startTransition(() => router.refresh());
  }

  return (
    <section className="card p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Photos</h2>
        <span className="text-xs text-ink-soft">{photos.length}/5 · JPEG, PNG, WebP · 2 Mo max</span>
      </div>
      <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
        {photos.map((p) => (
          <li key={p.id} className="relative aspect-square overflow-hidden rounded-xl bg-line">
            <Image src={p.url} alt="" fill sizes="120px" className="object-cover" />
            <button
              type="button"
              onClick={() => remove(p.id)}
              className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-ink/80 text-sm text-paper"
              aria-label="Supprimer cette photo"
            >
              ×
            </button>
          </li>
        ))}
        {!full && (
          <li>
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={busy}
              className="grid aspect-square w-full place-items-center rounded-xl border-2 border-dashed border-line text-2xl text-ink-soft hover:border-saffron"
              aria-label="Ajouter des photos"
            >
              {busy ? '…' : '+'}
            </button>
          </li>
        )}
      </ul>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(e) => upload(e.target.files)}
      />
      {error && <p className="err">{error}</p>}
      <p className="hint">La position GPS et les informations de l’appareil sont retirées automatiquement.</p>
    </section>
  );
}
