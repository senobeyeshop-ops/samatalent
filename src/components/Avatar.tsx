import Image from 'next/image';
import { publicImage } from '@/lib/format';

export function Avatar({ name, path, size = 44 }: { name: string; path?: string | null; size?: number }) {
  const src = publicImage('avatars', path);
  return src ? (
    <Image src={src} alt="" width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-ink font-bold text-paper"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
