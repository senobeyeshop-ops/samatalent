-- Attaques sur les commandes (migration 0005), après les autres tests.
\set ON_ERROR_STOP 0
reset role;
insert into auth.users(id,email) values ('66666666-6666-6666-6666-666666666666','f@x') on conflict do nothing;
insert into public.listings(id,owner_id,type,category_slug,title,description,price_xof,city,country_code,expires_at) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd','66666666-6666-6666-6666-666666666666','produit','produits','Sac en wax','Joli sac en wax cousu main à Dakar',8000,'Dakar','SN', now()+interval '30 days'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','66666666-6666-6666-6666-666666666666','emploi','emploi','Offre de poste','Description assez longue pour passer',50000,'Dakar','SN', now()+interval '30 days');
update public.profile_private set wave_number = '+221770000002' where user_id = '66666666-6666-6666-6666-666666666666';

set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
\echo C1 A écrit une commande directement — ATTENDU permission denied
insert into public.orders(listing_title,buyer_id,seller_id,quantity,unit_price_xof,total_xof) values ('x',auth.uid(),'66666666-6666-6666-6666-666666666666',1,1,1);
\echo C2 A commande une offre d emploi — ATTENDU not_orderable
select public.create_order('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',1,null);
\echo C3 quantite 0 — ATTENDU invalid_quantity
select public.create_order('dddddddd-dddd-dddd-dddd-dddddddddddd',0,null);
\echo C4 A commande 2 sacs : le total vient de la base — ATTENDU 16000
select public.create_order('dddddddd-dddd-dddd-dddd-dddddddddddd',2,'Livraison à Yoff ?') is not null as commande_creee;
select total_xof as total_commande from public.orders where buyer_id = auth.uid();
\echo C5 A lit le numero Wave avant acceptation — ATTENDU forbidden
select public.order_payment_info((select id from public.orders where buyer_id = auth.uid() limit 1));
\echo C6 A accepte sa propre commande a la place du vendeur — ATTENDU invalid_transition
select public.order_action((select id from public.orders where buyer_id = auth.uid() limit 1),'accept');
\echo C7 A modifie le prix — ATTENDU permission denied
update public.orders set total_xof = 1 where buyer_id = auth.uid();

select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
\echo C8 C (tiers) voit la commande — ATTENDU 0
select count(*) as vues_par_tiers from public.orders;
\echo C9 C agit sur la commande — ATTENDU forbidden
select public.order_action((select id from public.orders limit 1),'accept');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
\echo C9b C agit avec l identifiant connu — ATTENDU forbidden
select public.order_action((select id from public.orders where listing_id='dddddddd-dddd-dddd-dddd-dddddddddddd' limit 1),'accept');

-- parcours normal
select set_config('request.jwt.claim.sub','66666666-6666-6666-6666-666666666666',false);
\echo C10 vendeur B voit et accepte — ATTENDU accepted
reset role;
create temp table t_order as select id from public.orders where listing_id='dddddddd-dddd-dddd-dddd-dddddddddddd' limit 1;
grant select on t_order to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub','66666666-6666-6666-6666-666666666666',false);
select public.order_action((select id from t_order),'accept') as etape;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
\echo C11 A obtient le numero Wave apres acceptation — ATTENDU +221770000002
select public.order_payment_info((select id from t_order)) as numero_wave;
\echo C12 reference de paiement piegee — ATTENDU invalid_ref
select public.order_action((select id from t_order),'declare_paid','<script>');
\echo C13 A declare avoir paye — ATTENDU paid_declared
select public.order_action((select id from t_order),'declare_paid','T-ABC123') as etape;
\echo C14 A confirme lui-meme la reception — ATTENDU invalid_transition
select public.order_action((select id from t_order),'confirm_paid');
select set_config('request.jwt.claim.sub','66666666-6666-6666-6666-666666666666',false);
\echo C15 B confirme — ATTENDU paid_confirmed
select public.order_action((select id from t_order),'confirm_paid') as etape;
reset role;
