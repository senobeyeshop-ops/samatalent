-- =====================================================================
-- Migration 0002 — photos, gestion des annonces, signalements
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Photo de profil : le chemin n'est écrit QUE par le serveur, après
--    contrôle du fichier. Sinon un utilisateur pourrait pointer son avatar
--    vers n'importe quel fichier (ou l'image d'un autre).
-- ---------------------------------------------------------------------
revoke update (avatar_path) on public.profiles from authenticated;
alter table public.profiles
  add constraint avatar_path_format
  check (avatar_path is null or avatar_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$');

-- ---------------------------------------------------------------------
-- 2. Photos d'annonce : 5 maximum, une seule par position, chemin imposé.
-- ---------------------------------------------------------------------
alter table public.listing_photos
  add constraint listing_photos_position_uq unique (listing_id, position),
  add constraint listing_photo_path_format
  check (path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
         and split_part(path, '/', 1) = owner_id::text
         and split_part(path, '/', 2) = listing_id::text);

-- La photo appartient forcément au propriétaire de l'annonce.
create or replace function public.check_photo_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.listings
                 where id = new.listing_id and owner_id = new.owner_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger listing_photos_owner before insert on public.listing_photos
  for each row execute function public.check_photo_owner();

-- ---------------------------------------------------------------------
-- 3. Renouveler une annonce (+60 jours) — l'utilisateur ne peut pas écrire
--    expires_at lui-même, il passe par cette fonction.
-- ---------------------------------------------------------------------
create or replace function public.renew_listing(p_listing uuid)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_new timestamptz;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.is_active_user() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.listings
     set expires_at = now() + interval '60 days',
         status = case when status = 'expired' then 'published' else status end
   where id = p_listing
     and owner_id = auth.uid()
     and status in ('published', 'expired', 'draft')
     -- pas de renouvellement à l'infini : seulement dans les 7 derniers jours
     and expires_at < now() + interval '7 days'
  returning expires_at into v_new;
  if v_new is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return v_new;
end $$;
grant execute on function public.renew_listing(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Signalements : la cible doit exister, on ne se signale pas soi-même,
--    et 3 signalements ouverts d'auteurs différents masquent l'annonce
--    automatiquement en attendant la modération.
-- ---------------------------------------------------------------------
create or replace function public.on_report_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_open int;
begin
  if new.target_type = 'listing' then
    select owner_id into v_owner from public.listings where id = new.target_id;
  elsif new.target_type = 'profile' then
    v_owner := (select id from public.profiles where id = new.target_id);
  elsif new.target_type = 'message' then
    select sender_id into v_owner from public.messages where id = new.target_id;
  end if;
  if v_owner is null then raise exception 'invalid_target' using errcode = '22023'; end if;
  if v_owner = new.reporter_id then raise exception 'invalid_target' using errcode = '22023'; end if;
  return new;
end $$;
create trigger reports_validate before insert on public.reports
  for each row execute function public.on_report_insert();

create or replace function public.on_report_auto_hide() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_open int;
begin
  if new.target_type <> 'listing' then return new; end if;
  select count(distinct reporter_id) into v_open from public.reports
   where target_type = 'listing' and target_id = new.target_id and status = 'open';
  if v_open >= 3 then
    update public.listings set status = 'hidden'
     where id = new.target_id and status = 'published';
    if found then
      insert into public.audit_log (actor_id, action, target, meta)
      values (null, 'listing.auto_hidden', new.target_id::text, jsonb_build_object('reports', v_open));
    end if;
  end if;
  return new;
end $$;
create trigger reports_auto_hide after insert on public.reports
  for each row execute function public.on_report_auto_hide();

-- L'admin lit le journal d'audit (lecture seule)
create policy audit_admin_read on public.audit_log for select to authenticated using (public.is_admin());
grant select on public.audit_log to authenticated;

-- Index utile au comptage des signalements par cible
create index reports_target_idx on public.reports (target_type, target_id, status);
