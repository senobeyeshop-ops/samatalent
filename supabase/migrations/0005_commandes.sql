-- =====================================================================
-- Migration 0005 — Commandes, paiement DIRECT au vendeur par Wave
-- Sama Talent ne touche jamais l'argent : l'acheteur paie le vendeur
-- sur son numéro Wave, puis chacun confirme dans l'application.
-- Prix (règle 14) : recopié depuis l'annonce par la base, jamais par le navigateur.
-- =====================================================================

-- Numéro Wave du vendeur : privé, révélé uniquement à l'acheteur d'une commande ACCEPTÉE
alter table public.profile_private
  add column if not exists wave_number text check (wave_number ~ '^\+[0-9]{8,15}$');
grant update (wave_number) on public.profile_private to authenticated;

create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  listing_id      uuid references public.listings(id) on delete set null,
  listing_title   text not null,
  buyer_id        uuid not null references public.profiles(id) on delete cascade,
  seller_id       uuid not null references public.profiles(id) on delete cascade,
  quantity        int  not null check (quantity between 1 and 99),
  unit_price_xof  bigint not null check (unit_price_xof > 0),
  total_xof       bigint not null check (total_xof > 0),
  note            text check (char_length(note) <= 500),
  status          text not null default 'requested'
                  check (status in ('requested','accepted','refused','paid_declared','paid_confirmed','cancelled')),
  payment_ref     text check (payment_ref ~ '^[A-Za-z0-9-]{4,40}$'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (buyer_id <> seller_id)
);
create index if not exists orders_buyer_idx  on public.orders (buyer_id, created_at desc);
create index if not exists orders_seller_idx on public.orders (seller_id, created_at desc);
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();

-- Règle 4 : chacun ne voit que SES commandes (achats ou ventes). Aucune écriture directe.
alter table public.orders enable row level security;
create policy orders_read_parties on public.orders for select to authenticated
  using ((select auth.uid()) in (buyer_id, seller_id));
revoke all on public.orders from anon, authenticated;
grant select on public.orders to authenticated;

-- ---------------------------------------------------------------------
-- Passer commande
-- ---------------------------------------------------------------------
create or replace function public.create_order(p_listing uuid, p_quantity int, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); v_l public.listings; v_id uuid;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.is_active_user() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_quantity is null or p_quantity not between 1 and 99 then raise exception 'invalid_quantity' using errcode = '22023'; end if;
  if p_note is not null and char_length(p_note) > 500 then raise exception 'invalid_note' using errcode = '22023'; end if;

  select * into v_l from public.listings
   where id = p_listing and status = 'published' and expires_at > now();
  if not found or v_l.type not in ('produit','service') or coalesce(v_l.price_xof, 0) <= 0 then
    raise exception 'not_orderable' using errcode = '22023'; end if;
  if v_l.owner_id = v_me then raise exception 'own_listing' using errcode = '22023'; end if;
  if public.is_blocked_between(v_me, v_l.owner_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = v_l.owner_id and status = 'active') then
    raise exception 'not_orderable' using errcode = '22023'; end if;
  -- anti-abus : 10 commandes en attente par heure maximum
  if (select count(*) from public.orders where buyer_id = v_me and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'too_many' using errcode = '54000'; end if;

  insert into public.orders (listing_id, listing_title, buyer_id, seller_id, quantity, unit_price_xof, total_xof, note)
  values (v_l.id, v_l.title, v_me, v_l.owner_id, p_quantity, v_l.price_xof, v_l.price_xof * p_quantity, nullif(trim(p_note), ''))
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Faire avancer une commande. Chaque action n'est permise qu'au bon rôle
-- et depuis le bon statut : impossible de sauter une étape.
--   vendeur  : accept, refuse, confirm_paid, not_received
--   acheteur : declare_paid (avec la référence Wave facultative), cancel
-- ---------------------------------------------------------------------
create or replace function public.order_action(p_order uuid, p_action text, p_ref text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); v_o public.orders; v_new text;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_o from public.orders where id = p_order for update;
  if not found or v_me not in (v_o.buyer_id, v_o.seller_id) then
    raise exception 'forbidden' using errcode = '42501'; end if;

  v_new := case
    when v_me = v_o.seller_id and p_action = 'accept'       and v_o.status = 'requested'     then 'accepted'
    when v_me = v_o.seller_id and p_action = 'refuse'       and v_o.status = 'requested'     then 'refused'
    when v_me = v_o.seller_id and p_action = 'confirm_paid' and v_o.status in ('accepted','paid_declared') then 'paid_confirmed'
    when v_me = v_o.seller_id and p_action = 'not_received' and v_o.status = 'paid_declared' then 'accepted'
    when v_me = v_o.buyer_id  and p_action = 'declare_paid' and v_o.status = 'accepted'      then 'paid_declared'
    when v_me = v_o.buyer_id  and p_action = 'cancel'       and v_o.status in ('requested','accepted') then 'cancelled'
    else null end;
  if v_new is null then raise exception 'invalid_transition' using errcode = '22023'; end if;

  if p_action = 'declare_paid' and p_ref is not null and p_ref !~ '^[A-Za-z0-9-]{4,40}$' then
    raise exception 'invalid_ref' using errcode = '22023'; end if;

  update public.orders
     set status = v_new,
         payment_ref = case when p_action = 'declare_paid' then nullif(p_ref, '') else payment_ref end
   where id = p_order;
  return v_new;
end $$;

-- ---------------------------------------------------------------------
-- Numéro Wave du vendeur : SEULEMENT pour l'acheteur, et SEULEMENT
-- une fois la commande acceptée (pas de récolte de numéros).
-- ---------------------------------------------------------------------
create or replace function public.order_payment_info(p_order uuid)
returns text language plpgsql security definer stable set search_path = '' as $$
declare v_me uuid := auth.uid(); v_o public.orders; v_num text;
begin
  select * into v_o from public.orders where id = p_order;
  if not found or v_o.buyer_id is distinct from v_me or v_o.status not in ('accepted','paid_declared') then
    raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(wave_number, whatsapp) into v_num from public.profile_private where user_id = v_o.seller_id;
  return v_num;
end $$;

revoke execute on function public.create_order(uuid, int, text)       from public, anon;
revoke execute on function public.order_action(uuid, text, text)      from public, anon;
revoke execute on function public.order_payment_info(uuid)            from public, anon;
grant  execute on function public.create_order(uuid, int, text)       to authenticated;
grant  execute on function public.order_action(uuid, text, text)      to authenticated;
grant  execute on function public.order_payment_info(uuid)            to authenticated;
