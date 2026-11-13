-- Attaques sur le paiement et le Boost (migration 0004), après les autres tests.
\set ON_ERROR_STOP 0
reset role;
insert into public.listings(id,owner_id,type,category_slug,title,description,city,country_code,expires_at) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc','11111111-1111-1111-1111-111111111111','service','services','Annonce de A','Description assez longue pour passer','Dakar','SN', now()+interval '30 days');

set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
\echo W1 A se confirme un paiement lui-même — ATTENDU permission denied
select public.confirm_payment('wave','EV_x','cos-abcdefgh',500,'XOF');
\echo W2 A rattache une fausse session — ATTENDU permission denied
select public.attach_payment_ref(gen_random_uuid(),'cos-abcdefgh');
\echo W3 A marque un paiement en échec — ATTENDU permission denied
select public.fail_payment('wave','EV_y',gen_random_uuid(),null);
\echo W4 A s offre un boost en modifiant la date — ATTENDU permission denied
update public.listings set boosted_until = now()+interval '1 year' where owner_id = auth.uid();
\echo W5 A prend le Boost offert sur l annonce de B — ATTENDU forbidden
select public.claim_free_boost('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
\echo W6 A prend son Boost offert — ATTENDU une date
select public.claim_free_boost('cccccccc-cccc-cccc-cccc-cccccccccccc') is not null as boost_ok;
\echo W7 A reprend un second Boost offert — ATTENDU already_used
select public.claim_free_boost('cccccccc-cccc-cccc-cccc-cccccccccccc');
\echo W8 A ecrit dans free_boosts — ATTENDU permission denied
delete from public.free_boosts;
\echo W9 A cree un paiement : le prix vient de la base — ATTENDU 500
select amount_xof from public.create_boost_payment('cccccccc-cccc-cccc-cccc-cccccccccccc','boost_7j','wave');
\echo W10 forfait desactive — ATTENDU invalid_plan
select * from public.create_boost_payment('cccccccc-cccc-cccc-cccc-cccccccccccc','boost_3j','wave');

-- Côté serveur (service_role) : parcours Wave complet
reset role;
set role service_role;
\echo W11 reference de session invalide — ATTENDU invalid_ref
select public.attach_payment_ref((select id from public.payments order by created_at desc limit 1),'pas-une-session');
select public.attach_payment_ref((select id from public.payments order by created_at desc limit 1),'cos-test123456');
\echo W12 montant falsifie — ATTENDU amount_mismatch
select public.confirm_payment('wave','EV_1','cos-test123456',1,'XOF') as r;
reset role;
update public.payments set status='pending' where provider_ref='cos-test123456';
set role service_role;
\echo W13 bon montant — ATTENDU ok puis duplicate au rejeu
select public.confirm_payment('wave','EV_2','cos-test123456',500,'XOF') as r;
select public.confirm_payment('wave','EV_2','cos-test123456',500,'XOF') as r;
\echo W14 echec apres paiement — ATTENDU ignored
select public.fail_payment('wave','EV_3',null,'cos-test123456') as r;
reset role;
