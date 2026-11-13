-- Attaques sur la migration 0002 (à lancer après securite.sql).
-- Chaque ligne « ATTENDU » dit ce qui doit se passer.
\set ON_ERROR_STOP 0
reset role;
insert into auth.users(id,email) values
  ('44444444-4444-4444-4444-444444444444','d@x'),
  ('55555555-5555-5555-5555-555555555555','e@x');
insert into public.listings(id,owner_id,type,category_slug,title,description,city,country_code,expires_at) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222','service','services','Annonce de B','Description assez longue pour passer','Dakar','SN', now()+interval '3 days'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222','emploi','emploi','Fausse offre','Payez 50 000 FCFA pour obtenir le poste','Thiès','SN', now()+interval '50 days');

set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
\echo U1 A change son avatar_path lui-même — ATTENDU permission denied
update public.profiles set avatar_path='22222222-2222-2222-2222-222222222222/x.webp' where id=auth.uid();
\echo U2 A ajoute une photo directement — ATTENDU permission denied
insert into public.listing_photos(listing_id,owner_id,path) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',auth.uid(),'x');
\echo U3 A renouvelle l annonce de B — ATTENDU forbidden
select public.renew_listing('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
\echo U4 A change la date d expiration — ATTENDU permission denied
update public.listings set expires_at = now()+interval '10 years' where owner_id = auth.uid();
\echo U5 A signale une cible inexistante — ATTENDU invalid_target
insert into public.reports(reporter_id,target_type,target_id,reason) values (auth.uid(),'listing','99999999-9999-9999-9999-999999999999','arnaque');
\echo U6 A signale au nom de C — ATTENDU violation RLS
insert into public.reports(reporter_id,target_type,target_id,reason) values ('33333333-3333-3333-3333-333333333333','listing','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','arnaque');
\echo U7 A lit le journal d audit — ATTENDU 0 ligne
select count(*) as audit_visible from public.audit_log;
-- signalements légitimes de A, C, D
insert into public.reports(reporter_id,target_type,target_id,reason) values (auth.uid(),'listing','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','arnaque');
\echo U8 A signale deux fois — ATTENDU doublon refusé
insert into public.reports(reporter_id,target_type,target_id,reason) values (auth.uid(),'listing','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','arnaque');
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
insert into public.reports(reporter_id,target_type,target_id,reason) values (auth.uid(),'listing','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','arnaque');
select set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444',false);
insert into public.reports(reporter_id,target_type,target_id,reason) values (auth.uid(),'listing','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','arnaque');
\echo U9 apres 3 signalements, l annonce n est plus visible du public — ATTENDU 0
select count(*) as visible_public from public.listings where id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
\echo U10 B se signale lui-même — ATTENDU invalid_target
insert into public.reports(reporter_id,target_type,target_id,reason) values (auth.uid(),'listing','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','spam');
\echo U11 B republie son annonce masquee — ATTENDU UPDATE 0 (statut toujours hidden)
update public.listings set status='published' where id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
select status as statut_apres_tentative from public.listings where id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
\echo U12 B renouvelle son annonce qui expire dans 3 jours — ATTENDU ok (+60 j)
select public.renew_listing('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') > now()+interval '59 days' as renouvelee;
\echo U13 B renouvelle encore tout de suite — ATTENDU forbidden (pas de renouvellement infini)
select public.renew_listing('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

reset role;
\echo U14 serveur : photo dont le chemin ne correspond pas a l annonce — ATTENDU violation check
set role service_role;
insert into public.listing_photos(listing_id,owner_id,path) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/cccccccc-cccc-cccc-cccc-cccccccccccc.webp');
\echo U15 serveur : photo attribuee a un non-proprietaire — ATTENDU forbidden
insert into public.listing_photos(listing_id,owner_id,path) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/cccccccc-cccc-cccc-cccc-cccccccccccc.webp');
\echo U16 serveur : 6e photo — ATTENDU refusée (position 0 a 4)
insert into public.listing_photos(listing_id,owner_id,path,position)
select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222',
       '22222222-2222-2222-2222-222222222222/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/'||gen_random_uuid()||'.webp', g
from generate_series(0,5) g;
select count(*) as photos_inserees from public.listing_photos;
reset role;
\echo U17 masquage automatique journalise — ATTENDU 1
select count(*) as audit_auto_hide from public.audit_log where action='listing.auto_hidden';
