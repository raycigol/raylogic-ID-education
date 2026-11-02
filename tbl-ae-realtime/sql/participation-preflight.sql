-- READ ONLY. Save results privately before installing session-participation.sql.
-- No join codes, passwords, student IDs, answers, or grades are selected.
select table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns where table_schema='public' and table_name in
('tbl_sessions','tbl_teams','tbl_stages','tbl_submissions','tbl_stage_results','tbl_team_members','tbl_team_invites','tbl_session_participation')
order by table_name,ordinal_position;

select c.relname,con.conname,pg_get_constraintdef(con.oid) definition
from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname like 'tbl_%' order by c.relname,con.conname;

select tablename,policyname,roles,cmd,qual,with_check from pg_policies
where schemaname='public' and tablename like 'tbl_%' order by tablename,policyname;

select p.proname,pg_get_function_identity_arguments(p.oid) arguments,pg_get_functiondef(p.oid) definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname like 'tbl_%' order by p.proname;

select s.id,s.title,count(t.id) existing_team_count,
array_agg(t.team_number order by t.team_number) team_numbers
from public.tbl_sessions s left join public.tbl_teams t on t.session_id=s.id group by s.id,s.title order by s.title;
