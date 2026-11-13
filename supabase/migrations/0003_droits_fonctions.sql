-- =====================================================================
-- Migration 0003 — corrige les droits d'exécution des fonctions
-- Trouvé par l'audit de sécurité Supabase sur la vraie base :
-- Supabase donne automatiquement EXECUTE aux rôles anon/authenticated sur
-- les nouvelles fonctions. Les fonctions de la migration 0002 étaient donc
-- appelables via /rest/v1/rpc/… par un visiteur non connecté.
-- =====================================================================

-- Fonctions de déclencheur : jamais appelables via l'API (elles tournent
-- automatiquement sur les tables, sans besoin du droit EXECUTE).
revoke execute on function public.check_photo_owner()   from public, anon, authenticated;
revoke execute on function public.on_report_insert()    from public, anon, authenticated;
revoke execute on function public.on_report_auto_hide() from public, anon, authenticated;
revoke execute on function public.handle_new_user()     from public, anon, authenticated;
revoke execute on function public.touch_updated_at()    from public, anon, authenticated;
revoke execute on function public.bump_conversation()   from public, anon, authenticated;

-- Renouvellement : réservé aux utilisateurs connectés
revoke execute on function public.renew_listing(uuid) from public, anon;
grant  execute on function public.renew_listing(uuid) to authenticated;

-- À l'avenir, toute fonction créée dans public est fermée par défaut,
-- quel que soit le rôle qui la crée.
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
