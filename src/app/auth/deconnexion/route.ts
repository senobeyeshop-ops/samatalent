import { NextResponse, type NextRequest } from 'next/server';
import { supabaseUser } from '@/lib/supabase/server';
import { appUrl } from '@/lib/server/app-url';

// POST uniquement (un simple lien GET ne doit pas pouvoir déconnecter quelqu'un).
// L'origine est déjà vérifiée par le proxy (règle 13).
export async function POST(request: NextRequest) {
  // Un corps absent ou malformé ne doit pas faire planter la route (erreur 500)
  const form = await request.formData().catch(() => null);
  const everywhere = form?.get('partout') === '1';
  const supabase = await supabaseUser();
  // « partout » = révoque aussi les sessions des autres appareils
  await supabase.auth.signOut({ scope: everywhere ? 'global' : 'local' });

  const res = NextResponse.redirect(appUrl('/'), { status: 303 });
  res.cookies.delete('st_seen');
  res.cookies.delete('st_start');
  return res;
}
