-- =====================================================================
-- Sama Talent — schéma Postgres / Supabase (migration 0001)
-- Règles : RLS partout, aucune table ouverte, prix calculés en base,
-- argent en FCFA entiers (XOF n'a pas de centimes), dates en timestamptz UTC.
-- Les fonctions SECURITY DEFINER fixent search_path = '' (anti-détournement).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 0. Verrouillage par défaut : on retire tout aux rôles clients,
--    puis on redonne uniquement ce qui est nécessaire (exigence 3).
-- ---------------------------------------------------------------------
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- ---------------------------------------------------------------------
-- 1. Référentiels
-- ---------------------------------------------------------------------
create table public.countries (
  code       char(2) primary key,               -- ISO 3166-1
  name       text not null,
  dial_code  text not null,                     -- ex. '+221'
  phone_len  smallint not null                  -- chiffres après l'indicatif
);
insert into public.countries (code, name, dial_code, phone_len) values
  ('SN','Sénégal','+221',9), ('CI','Côte d''Ivoire','+225',10),
  ('ML','Mali','+223',8),    ('BF','Burkina Faso','+226',8),
  ('NE','Niger','+227',8),   ('TG','Togo','+228',8),
  ('BJ','Bénin','+229',10),  ('GW','Guinée-Bissau','+245',9);

create table public.categories (
  slug       text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  label      text not null,
  icon       text not null default '✦',
  position   smallint not null default 0
);
insert into public.categories (slug, label, icon, position) values
  ('emploi','Emplois','💼',1), ('stage','Stages','🎓',2),
  ('services','Services','🛠️',3), ('produits','Produits','🛍️',4),
  ('chantiers','Chantiers & BTP','🏗️',5), ('professionnels','Professionnels','👔',6),
  ('evenementiel','Événementiel','🎉',7), ('numerique','Numérique & digital','💻',8);

-- ---------------------------------------------------------------------
-- 2. Profils
-- ---------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null default 'Talent'
                check (char_length(display_name) between 2 and 60),
  avatar_path   text,
  headline      text check (char_length(headline) <= 120),
  bio           text check (char_length(bio) <= 1500),
  skills        text[] not null default '{}'
                check (cardinality(skills) <= 15),
  city          text check (char_length(city) <= 60),
  country_code  char(2) not null default 'SN' references public.countries(code),
  role          text not null default 'user' check (role in ('user','admin')),
  status        text not null default 'active' check (status in ('active','suspended')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index profiles_country_idx on public.profiles (country_code);

-- Données privées séparées : le WhatsApp n'est JAMAIS lisible par les autres.
-- Le contact passe par une route serveur (connexion + limite + journal).
create table public.profile_private (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  whatsapp    text check (whatsapp ~ '^\+[0-9]{8,15}$'),
  email_notif boolean not null default true,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. Annonces
-- ---------------------------------------------------------------------
create table public.listings (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles(id) on delete cascade,
  type            text not null check (type in ('emploi','stage','service','produit','chantier','profil')),
  category_slug   text not null references public.categories(slug) on delete restrict,
  title           text not null check (char_length(title) between 5 and 120),
  description     text not null check (char_length(description) between 20 and 5000),
  price_xof       bigint check (price_xof is null or price_xof between 0 and 1000000000),
  price_negotiable boolean not null default false,
  city            text not null check (char_length(city) between 2 and 60),
  country_code    char(2) not null references public.countries(code),
  status          text not null default 'published'
                  check (status in ('draft','published','hidden','expired','deleted')),
  boosted_until   timestamptz,
  expires_at      timestamptz not null default now() + interval '60 days',
  search          tsvector generated always as (
                    setweight(to_tsvector('french', coalesce(title,'')), 'A') ||
                    setweight(to_tsvector('french', coalesce(description,'')), 'B') ||
                    setweight(to_tsvector('french', coalesce(city,'')), 'C')
                  ) stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index listings_owner_idx      on public.listings (owner_id);
create index listings_feed_idx       on public.listings (status, country_code, boosted_until desc nulls last, created_at desc);
create index listings_category_idx   on public.listings (category_slug, created_at desc);
create index listings_search_idx     on public.listings using gin (search);

create table public.listing_photos (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings(id) on delete cascade,
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  path        text not null unique,              -- '<owner_id>/<listing_id>/<uuid>.webp'
  position    smallint not null default 0 check (position between 0 and 4),
  created_at  timestamptz not null default now()
);
create index listing_photos_listing_idx on public.listing_photos (listing_id, position);
create index listing_photos_owner_idx   on public.listing_photos (owner_id);

-- ---------------------------------------------------------------------
-- 4. Messagerie
-- ---------------------------------------------------------------------
create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  user_a          uuid not null references public.profiles(id) on delete cascade,
  user_b          uuid not null references public.profiles(id) on delete cascade,
  listing_id      uuid references public.listings(id) on delete set null,
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  constraint ordered_pair check (user_a < user_b)
);
create unique index conversations_pair_listing_uq
  on public.conversations (user_a, user_b, coalesce(listing_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index conversations_a_idx on public.conversations (user_a, last_message_at desc);
create index conversations_b_idx on public.conversations (user_b, last_message_at desc);

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  sender_id        uuid not null references public.profiles(id) on delete cascade,
  body             text not null check (char_length(btrim(body)) between 1 and 2000),
  read_at          timestamptz,
  created_at       timestamptz not null default now()
);
create index messages_conv_idx   on public.messages (conversation_id, created_at);
create index messages_sender_idx on public.messages (sender_id);

create table public.blocks (
  blocker_id  uuid not null references public.profiles(id) on delete cascade,
  blocked_id  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);

-- ---------------------------------------------------------------------
-- 5. Modération
-- ---------------------------------------------------------------------
create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references public.profiles(id) on delete cascade,
  target_type  text not null check (target_type in ('listing','profile','message')),
  target_id    uuid not null,
  reason       text not null check (reason in ('arnaque','faux_profil','contenu_inapproprie','harcelement','spam','autre')),
  details      text check (char_length(details) <= 1000),
  status       text not null default 'open' check (status in ('open','reviewed','dismissed','actioned')),
  created_at   timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);
create index reports_status_idx on public.reports (status, created_at desc);

create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text not null,
  target      text,
  meta        jsonb not null default '{}',        -- jamais d'email/téléphone ici
  created_at  timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);

-- ---------------------------------------------------------------------
-- 6. Paiements (Boost) — prix uniquement côté serveur (exigence 14)
-- ---------------------------------------------------------------------
create table public.boost_plans (
  code       text primary key check (code ~ '^[a-z0-9_]{2,30}$'),
  label      text not null,
  days       smallint not null check (days between 1 and 90),
  price_xof  bigint not null check (price_xof > 0),
  active     boolean not null default true
);
insert into public.boost_plans (code, label, days, price_xof) values
  ('boost_3j','3 jours en tête', 3, 500),
  ('boost_7j','7 jours en tête', 7, 1000),
  ('boost_30j','30 jours en tête', 30, 3000);

create table public.payments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete restrict,
  listing_id    uuid references public.listings(id) on delete set null,
  plan_code     text not null references public.boost_plans(code) on delete restrict,
  amount_xof    bigint not null check (amount_xof > 0),
  currency      char(3) not null default 'XOF' check (currency = 'XOF'),
  provider      text not null check (provider in ('wave','orange_money')),
  provider_ref  text unique,                      -- id de session chez le prestataire
  status        text not null default 'pending'
                check (status in ('pending','paid','failed','expired','amount_mismatch')),
  created_at    timestamptz not null default now(),
  paid_at       timestamptz
);
create index payments_user_idx    on public.payments (user_id, created_at desc);
create index payments_listing_idx on public.payments (listing_id);
create index payments_status_idx  on public.payments (status, created_at);

-- Idempotence : un webhook reçu deux fois n'est traité qu'une fois.
create table public.webhook_events (
  provider     text not null,
  event_id     text not null,
  received_at  timestamptz not null default now(),
  primary key (provider, event_id)
);

-- ---------------------------------------------------------------------
-- 7. IA (Studio) — plafond de dépenses (exigence 16)
-- ---------------------------------------------------------------------
create table public.app_settings (
  key    text primary key,
  value  bigint not null
);
insert into public.app_settings (key, value) values
  ('ai_monthly_cap_usd_micros', 20000000),   -- 20 USD / mois, tout compris
  ('ai_user_daily_requests',    10),         -- 10 générations / jour / utilisateur
  ('ai_max_output_tokens',      600);

create table public.ai_usage (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references public.profiles(id) on delete set null,
  tool              text not null check (tool in ('bio','cv','annonce')),
  status            text not null default 'reserved' check (status in ('reserved','done','failed')),
  cost_usd_micros   bigint not null default 0 check (cost_usd_micros >= 0),
  tokens_in         int not null default 0,
  tokens_out        int not null default 0,
  created_at        timestamptz not null default now()
);
create index ai_usage_user_day_idx on public.ai_usage (user_id, created_at);
create index ai_usage_month_idx    on public.ai_usage (created_at);

-- ---------------------------------------------------------------------
-- 8. Limitation de débit (exigence 7) — clés hachées, jamais d'IP en clair
-- ---------------------------------------------------------------------
create table public.rate_limits (
  key           text not null,          -- ex. 'login:' || sha256(ip)
  window_start  timestamptz not null,
  hits          int not null default 0,
  primary key (key, window_start)
);
create index rate_limits_window_idx on public.rate_limits (window_start);

-- =====================================================================
-- FONCTIONS
-- =====================================================================

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create trigger profiles_touch  before update on public.profiles        for each row execute function public.touch_updated_at();
create trigger private_touch   before update on public.profile_private for each row execute function public.touch_updated_at();
create trigger listings_touch  before update on public.listings        for each row execute function public.touch_updated_at();

-- Création automatique du profil à l'inscription
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  insert into public.profile_private (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and role = 'admin' and status = 'active');
$$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'active');
$$;

create or replace function public.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.blocks
                 where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;

-- Démarrer (ou retrouver) une conversation
create or replace function public.start_conversation(p_other uuid, p_listing uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); v_a uuid; v_b uuid; v_id uuid;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_me = p_other then raise exception 'invalid_target' using errcode = '22023'; end if;
  if not public.is_active_user() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = p_other and status = 'active') then
    raise exception 'invalid_target' using errcode = '22023'; end if;
  if public.is_blocked_between(v_me, p_other) then raise exception 'forbidden' using errcode = '42501'; end if;

  v_a := least(v_me, p_other); v_b := greatest(v_me, p_other);
  select id into v_id from public.conversations
   where user_a = v_a and user_b = v_b and listing_id is not distinct from p_listing;
  if v_id is null then
    insert into public.conversations (user_a, user_b, listing_id)
    values (v_a, v_b, p_listing) returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public.bump_conversation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end $$;
create trigger messages_bump after insert on public.messages
  for each row execute function public.bump_conversation();

create or replace function public.mark_conversation_read(p_conversation uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.messages m set read_at = now()
   from public.conversations c
  where m.conversation_id = p_conversation and c.id = m.conversation_id
    and auth.uid() in (c.user_a, c.user_b)
    and m.sender_id <> auth.uid() and m.read_at is null;
end $$;

-- Créer un paiement Boost : le PRIX vient de boost_plans, jamais du client.
create or replace function public.create_boost_payment(p_listing uuid, p_plan text, p_provider text)
returns table (payment_id uuid, amount_xof bigint)
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); v_price bigint; v_id uuid;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_provider not in ('wave','orange_money') then raise exception 'invalid_provider' using errcode = '22023'; end if;
  if not exists (select 1 from public.listings
                 where id = p_listing and owner_id = v_me and status = 'published') then
    raise exception 'forbidden' using errcode = '42501'; end if;
  select bp.price_xof into v_price from public.boost_plans bp where bp.code = p_plan and bp.active;
  if v_price is null then raise exception 'invalid_plan' using errcode = '22023'; end if;
  if (select count(*) from public.payments
       where user_id = v_me and status = 'pending' and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'too_many_pending' using errcode = '54000'; end if;

  insert into public.payments (user_id, listing_id, plan_code, amount_xof, provider)
  values (v_me, p_listing, p_plan, v_price, p_provider)
  returning id into v_id;
  return query select v_id, v_price;
end $$;

-- Appelée UNIQUEMENT par le webhook (service_role), après vérification de signature.
create or replace function public.confirm_payment(
  p_provider text, p_event_id text, p_provider_ref text, p_amount_xof bigint, p_currency text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_pay public.payments; v_days smallint; v_inserted int;
begin
  insert into public.webhook_events (provider, event_id) values (p_provider, p_event_id)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return 'duplicate'; end if;

  select * into v_pay from public.payments
   where provider = p_provider and provider_ref = p_provider_ref for update;
  if not found then return 'unknown_payment'; end if;
  if v_pay.status = 'paid' then return 'already_paid'; end if;

  if p_amount_xof <> v_pay.amount_xof or upper(p_currency) <> 'XOF' then
    update public.payments set status = 'amount_mismatch' where id = v_pay.id;
    return 'amount_mismatch';
  end if;

  update public.payments set status = 'paid', paid_at = now() where id = v_pay.id;
  select days into v_days from public.boost_plans where code = v_pay.plan_code;
  update public.listings
     set boosted_until = greatest(coalesce(boosted_until, now()), now()) + make_interval(days => v_days)
   where id = v_pay.listing_id;
  return 'ok';
end $$;

-- Limitation de débit (fenêtre fixe), appelée par le serveur uniquement.
create or replace function public.hit_rate_limit(p_key text, p_max int, p_window_s int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_start timestamptz; v_hits int;
begin
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_s) * p_window_s);
  insert into public.rate_limits (key, window_start, hits) values (p_key, v_start, 1)
  on conflict (key, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;
  return v_hits <= p_max;
end $$;

-- Réserver un appel IA : refuse si quota utilisateur ou plafond mensuel atteint.
create or replace function public.ai_reserve(p_user uuid, p_tool text, p_est_cost_micros bigint)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_cap bigint; v_daily bigint; v_spent bigint; v_today bigint; v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('ai_budget'));   -- évite les courses
  select value into v_cap   from public.app_settings where key = 'ai_monthly_cap_usd_micros';
  select value into v_daily from public.app_settings where key = 'ai_user_daily_requests';

  select coalesce(sum(cost_usd_micros), 0) into v_spent from public.ai_usage
   where created_at >= date_trunc('month', now());
  if v_spent + p_est_cost_micros > v_cap then return null; end if;

  select count(*) into v_today from public.ai_usage
   where user_id = p_user and created_at >= date_trunc('day', now());
  if v_today >= v_daily then return null; end if;

  insert into public.ai_usage (user_id, tool, cost_usd_micros)
  values (p_user, p_tool, p_est_cost_micros) returning id into v_id;
  return v_id;
end $$;

create or replace function public.ai_settle(p_id uuid, p_status text, p_cost_micros bigint, p_in int, p_out int)
returns void language sql security definer set search_path = '' as $$
  update public.ai_usage
     set status = p_status, cost_usd_micros = p_cost_micros, tokens_in = p_in, tokens_out = p_out
   where id = p_id;
$$;

-- Modération admin (journalisée)
create or replace function public.admin_set_listing_status(p_listing uuid, p_status text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('published','hidden','deleted') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update public.listings set status = p_status where id = p_listing;
  insert into public.audit_log (actor_id, action, target, meta)
  values (auth.uid(), 'listing.status', p_listing::text, jsonb_build_object('status', p_status, 'reason', left(p_reason, 300)));
end $$;

create or replace function public.admin_set_user_status(p_user uuid, p_status text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('active','suspended') then raise exception 'invalid_status' using errcode = '22023'; end if;
  if p_user = auth.uid() then raise exception 'invalid_target' using errcode = '22023'; end if;
  update public.profiles set status = p_status where id = p_user;
  if p_status = 'suspended' then
    update public.listings set status = 'hidden' where owner_id = p_user and status = 'published';
  end if;
  insert into public.audit_log (actor_id, action, target, meta)
  values (auth.uid(), 'user.status', p_user::text, jsonb_build_object('status', p_status, 'reason', left(p_reason, 300)));
end $$;

create or replace function public.admin_resolve_report(p_report uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('reviewed','dismissed','actioned') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update public.reports set status = p_status where id = p_report;
  insert into public.audit_log (actor_id, action, target, meta)
  values (auth.uid(), 'report.resolve', p_report::text, jsonb_build_object('status', p_status));
end $$;

-- Tâches planifiées (appelées par une fonction programmée, service_role)
create or replace function public.run_maintenance() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.listings set status = 'expired' where status = 'published' and expires_at < now();
  update public.payments set status = 'expired' where status = 'pending' and created_at < now() - interval '2 hours';
  delete from public.rate_limits    where window_start < now() - interval '1 day';
  delete from public.webhook_events where received_at  < now() - interval '90 days';
end $$;

-- Statistiques publiques de l'accueil
create view public.public_stats with (security_invoker = true) as
select (select count(*) from public.profiles where status = 'active')         as talents,
       (select count(*) from public.listings where status = 'published')      as annonces;

-- =====================================================================
-- RLS — activée sur TOUTES les tables (exigences 3 et 4)
-- =====================================================================
alter table public.countries       enable row level security;
alter table public.categories      enable row level security;
alter table public.profiles        enable row level security;
alter table public.profile_private enable row level security;
alter table public.listings        enable row level security;
alter table public.listing_photos  enable row level security;
alter table public.conversations   enable row level security;
alter table public.messages        enable row level security;
alter table public.blocks          enable row level security;
alter table public.reports         enable row level security;
alter table public.audit_log       enable row level security;
alter table public.boost_plans     enable row level security;
alter table public.payments        enable row level security;
alter table public.webhook_events  enable row level security;
alter table public.app_settings    enable row level security;
alter table public.ai_usage        enable row level security;
alter table public.rate_limits     enable row level security;
-- audit_log, webhook_events, app_settings, ai_usage, rate_limits :
-- RLS active SANS politique = fermées aux clients ; seul le serveur (service_role) y accède.

-- Référentiels : lecture publique
create policy countries_read   on public.countries   for select to anon, authenticated using (true);
create policy categories_read  on public.categories  for select to anon, authenticated using (true);
create policy plans_read       on public.boost_plans for select to anon, authenticated using (active);

-- Profils
create policy profiles_read on public.profiles for select to anon, authenticated
  using (status = 'active' or id = auth.uid() or public.is_admin());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy private_own_read   on public.profile_private for select to authenticated using (user_id = auth.uid());
create policy private_own_update on public.profile_private for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Annonces
create policy listings_read on public.listings for select to anon, authenticated
  using ((status = 'published' and expires_at > now()) or owner_id = auth.uid() or public.is_admin());
create policy listings_insert_own on public.listings for insert to authenticated
  with check (owner_id = auth.uid() and status in ('draft','published') and public.is_active_user());
create policy listings_update_own on public.listings for update to authenticated
  using (owner_id = auth.uid() and status <> 'hidden')
  with check (owner_id = auth.uid() and status in ('draft','published','deleted'));

create policy photos_read on public.listing_photos for select to anon, authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id
                 and ((l.status = 'published' and l.expires_at > now()) or l.owner_id = auth.uid() or public.is_admin())));
create policy photos_delete_own on public.listing_photos for delete to authenticated
  using (owner_id = auth.uid());
-- Insertion des photos : uniquement par la route d'upload serveur (après contrôle du fichier).

-- Conversations & messages : seuls les participants
create policy conv_read on public.conversations for select to authenticated
  using (auth.uid() in (user_a, user_b));
create policy msg_read on public.messages for select to authenticated
  using (exists (select 1 from public.conversations c
                 where c.id = conversation_id and auth.uid() in (c.user_a, c.user_b)));
create policy msg_insert on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid() and public.is_active_user()
    and exists (select 1 from public.conversations c
                where c.id = conversation_id and auth.uid() in (c.user_a, c.user_b)
                  and not public.is_blocked_between(c.user_a, c.user_b)));

-- Blocages
create policy blocks_own_read   on public.blocks for select to authenticated using (blocker_id = auth.uid());
create policy blocks_own_insert on public.blocks for insert to authenticated with check (blocker_id = auth.uid());
create policy blocks_own_delete on public.blocks for delete to authenticated using (blocker_id = auth.uid());

-- Signalements
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = auth.uid() and status = 'open');
create policy reports_read on public.reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());

-- Paiements : lecture de SES paiements ; création via create_boost_payment seulement
create policy payments_read on public.payments for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- =====================================================================
-- DROITS PAR COLONNE — un utilisateur ne peut pas se donner le rôle admin,
-- ni s'offrir un boost gratuit (boosted_until), ni changer d'auteur.
-- =====================================================================
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;

grant select on public.countries, public.categories, public.boost_plans to anon, authenticated;
grant select on public.profiles, public.listings, public.listing_photos, public.public_stats to anon, authenticated;

grant update (display_name, avatar_path, headline, bio, skills, city, country_code)
  on public.profiles to authenticated;
grant select, update (whatsapp, email_notif) on public.profile_private to authenticated;

grant insert (owner_id, type, category_slug, title, description, price_xof, price_negotiable, city, country_code, status)
  on public.listings to authenticated;
grant update (type, category_slug, title, description, price_xof, price_negotiable, city, country_code, status)
  on public.listings to authenticated;
grant delete on public.listing_photos to authenticated;

grant select on public.conversations to authenticated;
grant select, insert (conversation_id, sender_id, body) on public.messages to authenticated;
grant select, insert, delete on public.blocks to authenticated;
grant select, insert (reporter_id, target_type, target_id, reason, details) on public.reports to authenticated;
grant select on public.payments to authenticated;

-- Fonctions appelables par un utilisateur connecté
grant execute on function public.is_admin()                                to anon, authenticated;
grant execute on function public.is_active_user()                          to authenticated;
grant execute on function public.is_blocked_between(uuid, uuid)            to authenticated;
grant execute on function public.start_conversation(uuid, uuid)            to authenticated;
grant execute on function public.mark_conversation_read(uuid)              to authenticated;
grant execute on function public.create_boost_payment(uuid, text, text)    to authenticated;
grant execute on function public.admin_set_listing_status(uuid, text, text) to authenticated;
grant execute on function public.admin_set_user_status(uuid, text, text)    to authenticated;
grant execute on function public.admin_resolve_report(uuid, text)           to authenticated;

-- Fonctions réservées au serveur (clé service_role, jamais exposée au navigateur)
grant execute on function public.confirm_payment(text, text, text, bigint, text) to service_role;
grant execute on function public.hit_rate_limit(text, int, int)                  to service_role;
grant execute on function public.ai_reserve(uuid, text, bigint)                  to service_role;
grant execute on function public.ai_settle(uuid, text, bigint, int, int)         to service_role;
grant execute on function public.run_maintenance()                               to service_role;

-- =====================================================================
-- STOCKAGE — buckets avec taille et types imposés (exigence 11).
-- Aucune politique d'écriture client : seul le serveur téléverse,
-- après contrôle des octets magiques et ré-encodage en WebP.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars',  'avatars',  true, 2097152, array['image/webp']),
  ('listings', 'listings', true, 2097152, array['image/webp'])
on conflict (id) do nothing;
