\set ON_ERROR_STOP 0
grant all on all tables in schema public to service_role;
insert into auth.users(id,email) values ('11111111-1111-1111-1111-111111111111','a@x'),('22222222-2222-2222-2222-222222222222','b@x'),('33333333-3333-3333-3333-333333333333','c@x');
update public.profile_private set whatsapp='+221770000002' where user_id='22222222-2222-2222-2222-222222222222';
insert into public.listings(owner_id,type,category_slug,title,description,city,country_code) values
 ('22222222-2222-2222-2222-222222222222','service','services','Plombier Dakar','Plomberie toutes réparations rapides','Dakar','SN');

-- ===== Attaquant = A =====
set role authenticated; select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
\echo T1 lire le WhatsApp de B (attendu 0 ligne)
select count(*) from public.profile_private where user_id='22222222-2222-2222-2222-222222222222';
\echo T2 se donner le role admin (attendu: permission denied)
update public.profiles set role='admin' where id=auth.uid();
\echo T3 boost gratuit (attendu: permission denied)
insert into public.listings(owner_id,type,category_slug,title,description,city,country_code,boosted_until) values (auth.uid(),'service','services','Mon annonce','Description suffisamment longue ici','Dakar','SN', now()+interval '99 days');
\echo T4 modifier l annonce de B (attendu UPDATE 0)
update public.listings set title='piraté !!!' where owner_id='22222222-2222-2222-2222-222222222222';
\echo T5 publier au nom de B (attendu: violation RLS)
insert into public.listings(owner_id,type,category_slug,title,description,city,country_code) values ('22222222-2222-2222-2222-222222222222','service','services','Faux nom','Description suffisamment longue ici','Dakar','SN');
\echo T6 lire les tables internes (attendu: permission denied)
select * from public.ai_usage; select * from public.app_settings;
\echo T7 confirmer un paiement soi-même (attendu: permission denied)
select public.confirm_payment('wave','e1','x',1,'XOF');
\echo T8 booster l annonce de B (attendu: forbidden)
select * from public.create_boost_payment((select id from public.listings where owner_id='22222222-2222-2222-2222-222222222222'),'boost_7j','wave');
\echo T9 fonction admin (attendu: forbidden)
select public.admin_set_user_status('22222222-2222-2222-2222-222222222222','suspended','x');
-- conversation A<->B
select public.start_conversation('22222222-2222-2222-2222-222222222222') as conv \gset
insert into public.messages(conversation_id,sender_id,body) values (:'conv',auth.uid(),'Bonjour');
-- ===== C ne voit pas la conversation A-B =====
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
\echo T10 C lit les messages A-B (attendu 0)
select count(*) from public.messages;
\echo T11 C injecte un message dans A-B (attendu: violation RLS)
insert into public.messages(conversation_id,sender_id,body) values (:'conv',auth.uid(),'spam');
-- ===== B fait un vrai paiement =====
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
\echo T12 B cree un paiement : le prix vient de la base (attendu 1000)
select amount_xof from public.create_boost_payment((select id from public.listings where owner_id=auth.uid()),'boost_7j','wave');
\echo T13 visiteur anonyme ne voit pas les whatsapp (attendu: permission denied)
reset role; set role anon; select * from public.profile_private;
-- ===== serveur : webhook =====
reset role; update public.payments set provider_ref='cos_1'; set role service_role;
\echo T14 montant trafique (attendu amount_mismatch)
select public.confirm_payment('wave','evt_bad','cos_1',10,'XOF');
reset role; update public.payments set status='pending'; set role service_role;
\echo T15 bon paiement puis doublon (attendu ok puis duplicate)
select public.confirm_payment('wave','evt_1','cos_1',1000,'XOF');
select public.confirm_payment('wave','evt_1','cos_1',1000,'XOF');
select boosted_until > now()+interval '6 days' as boost_7j_applique from public.listings where owner_id='22222222-2222-2222-2222-222222222222';
\echo T16 plafond IA : 11e generation du jour refusee
select count(*) filter (where r is not null) as acceptes from (select public.ai_reserve('11111111-1111-1111-1111-111111111111','bio',1000) r from generate_series(1,11)) s;
\echo T17 limitation de debit : 6e tentative refusee
select array_agg(public.hit_rate_limit('login:hash',5,60)) from generate_series(1,6);
