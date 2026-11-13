-- Parcours admin autorisé (à lancer après securite_0002.sql)
\set ON_ERROR_STOP 1
reset role;
update public.profiles set role='admin' where id='11111111-1111-1111-1111-111111111111';
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false) \g /dev/null
\echo A1 l admin voit les signalements ouverts — ATTENDU 3
select count(*) as signalements_vus from public.reports where status='open';
\echo A2 l admin voit l annonce masquee — ATTENDU 1
select count(*) as annonce_masquee_vue from public.listings where id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
\echo A3 suspension de l auteur : compte suspendu + annonces masquees
select public.admin_set_user_status('22222222-2222-2222-2222-222222222222','suspended','faux recrutement');
select (select status from public.profiles where id='22222222-2222-2222-2222-222222222222') as compte,
       (select count(*) from public.listings where owner_id='22222222-2222-2222-2222-222222222222' and status='published') as annonces_en_ligne;
select public.admin_resolve_report(id,'actioned') from public.reports where status='open' \g /dev/null
\echo A4 journal d audit lisible par l admin — ATTENDU >= 4 lignes
select count(*) as lignes_audit from public.audit_log;
reset role;
\echo A5 le compte suspendu ne peut plus publier — ATTENDU violation RLS
set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false) \g /dev/null
\set ON_ERROR_STOP 0
insert into public.listings(owner_id,type,category_slug,title,description,city,country_code) values (auth.uid(),'emploi','emploi','Nouvelle arnaque','Encore une fausse offre très longue','Dakar','SN');
