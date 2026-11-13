-- =====================================================================
-- Migration 0004 — paiement Wave (Boost)
-- Le prix reste fixé en base (create_boost_payment, migration 0001).
-- Ces fonctions ne sont appelables QUE par le serveur (clé service_role).
-- =====================================================================

-- Rattache la session Wave (cos-…) au paiement en attente, une seule fois.
create or replace function public.attach_payment_ref(p_payment uuid, p_provider_ref text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_provider_ref !~ '^cos-[A-Za-z0-9]{6,64}$' then
    raise exception 'invalid_ref' using errcode = '22023';
  end if;
  update public.payments set provider_ref = p_provider_ref
   where id = p_payment and status = 'pending' and provider_ref is null;
  if not found then raise exception 'invalid_payment' using errcode = '22023'; end if;
end $$;

-- Paiement refusé ou abandonné chez Wave (webhook checkout.session.payment_failed,
-- ou échec à la création de la session). Idempotent.
create or replace function public.fail_payment(p_provider text, p_event_id text, p_payment uuid, p_provider_ref text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_inserted int;
begin
  if p_event_id is not null then
    insert into public.webhook_events (provider, event_id) values (p_provider, p_event_id) on conflict do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then return 'duplicate'; end if;
  end if;
  update public.payments set status = 'failed'
   where status = 'pending'
     and provider = p_provider
     and (id = p_payment or (p_provider_ref is not null and provider_ref = p_provider_ref));
  return case when found then 'ok' else 'ignored' end;
end $$;

revoke execute on function public.attach_payment_ref(uuid, text)          from public, anon, authenticated;
revoke execute on function public.fail_payment(text, text, uuid, text)   from public, anon, authenticated;
grant  execute on function public.attach_payment_ref(uuid, text)          to service_role;
grant  execute on function public.fail_payment(text, text, uuid, text)   to service_role;
-- confirm_payment (0001) : réservé au serveur, on le redit explicitement
revoke execute on function public.confirm_payment(text, text, text, bigint, text) from public, anon, authenticated;

-- Retrouver vite un paiement par sa session Wave
create index if not exists payments_provider_ref_idx on public.payments (provider, provider_ref);

-- ---------------------------------------------------------------------
-- Nouveaux prix (panel acheteurs : « bonne affaire » 300–500 FCFA, « cher » dès 1 000)
-- ---------------------------------------------------------------------
update public.boost_plans set active = false where code = 'boost_3j';
update public.boost_plans set label = '7 jours en tête',  price_xof = 500  where code = 'boost_7j';
update public.boost_plans set label = '30 jours en tête', price_xof = 1500 where code = 'boost_30j';

-- ---------------------------------------------------------------------
-- Premier Boost offert : 7 jours, une seule fois par compte, à vie.
-- La clé primaire user_id garantit l'unicité même en cas de double clic.
-- ---------------------------------------------------------------------
create table if not exists public.free_boosts (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.free_boosts enable row level security;
create policy free_boosts_own_read on public.free_boosts for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.free_boosts from anon, authenticated;
grant select on public.free_boosts to authenticated;

create or replace function public.claim_free_boost(p_listing uuid)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); v_until timestamptz;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.listings
                 where id = p_listing and owner_id = v_me and status = 'published') then
    raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.free_boosts (user_id, listing_id) values (v_me, p_listing) on conflict do nothing;
  if not found then raise exception 'already_used' using errcode = '23505'; end if;
  update public.listings
     set boosted_until = greatest(coalesce(boosted_until, now()), now()) + interval '7 days'
   where id = p_listing
  returning boosted_until into v_until;
  return v_until;
end $$;
revoke execute on function public.claim_free_boost(uuid) from public, anon;
grant  execute on function public.claim_free_boost(uuid) to authenticated;
