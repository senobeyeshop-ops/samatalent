'use client';

import Image from 'next/image';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function AvatarUploader({ url, name }: { url: string | null; name: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function send(method: 'POST' | 'DELETE', file?: File) {
    setError(null);
    if (file && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return setError('Format accepté : JPEG, PNG ou WebP.');
    if (file && file.size > 2 * 1024 * 1024) return setError('Image trop lourde (2 Mo maximum).');
    setBusy(true);
    let body: FormData | undefined;
    if (file) {
      body = new FormData();
      body.append('file', file);
    }
    const res = await fetch('/api/profile/avatar', { method, body });
    setBusy(false);
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? 'Envoi impossible.');
    if (input.current) input.current.value = '';
    startTransition(() => router.refresh());
  }

  return (
    <div className="mt-6 flex items-center gap-4">
      {url ? (
        <Image src={url} alt="Ma photo" width={80} height={80} className="h-20 w-20 rounded-full object-cover" />
      ) : (
        <span className="grid h-20 w-20 place-items-center rounded-full bg-ink text-3xl font-bold text-paper">
          {(name || '?').slice(0, 1).toUpperCase()}
        </span>
      )}
      <div className="space-y-1">
        <button type="button" className="btn btn-ghost text-sm" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Envoi…' : url ? 'Changer la photo' : 'Ajouter une photo'}
        </button>
        {url && (
          <button type="button" className="block text-xs text-ink-soft underline" onClick={() => send('DELETE')}>
            Retirer
          </button>
        )}
        {error && <p className="err">{error}</p>}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => e.target.files?.[0] && send('POST', e.target.files[0])}
      />
    </div>
  );
}
