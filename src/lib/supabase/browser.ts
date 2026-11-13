'use client';

import { createBrowserClient } from '@supabase/ssr';

// Client navigateur : uniquement la clé publique « anon », protégée par la RLS.
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
