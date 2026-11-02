-- Install after all existing SQL. Atomic and repeatable; no classroom rows are
-- changed on installation. Default roster = every existing team in the session.
begin;
set local lock_timeout = '5s';
create table if not exists public.tbl_session_participation (
 session_id uuid primary key references public.tbl_sessions(id),
 team_ids uuid[] not null check(cardinality(team_ids)>0),
 revision bigint not null default 1,
 updated_by uuid not null,
 updated_at timestamptz not null default now()
);
alter table public.tbl_session_participation enable row level security;
revoke all on public.tbl_session_participation from public,anon,authenticated;

create or replace function public.tbl_active_team_ids(p_session_id uuid)
returns setof uuid language sql stable security definer set search_path='' as $f$
 select t.id from public.tbl_teams t
 where t.session_id=p_session_id and (
  not exists(select 1 from public.tbl_session_participation c where c.session_id=p_session_id)
  or t.id=any((select c.team_ids from public.tbl_session_participation c where c.session_id=p_session_id)::uuid[])
 );
$f$;
revoke all on function public.tbl_active_team_ids(uuid) from public,anon,authenticated;

create or replace function public.tbl_session_roster(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $f$
begin
 if auth.uid() is null or (not exists(select 1 from public.tbl_sessions s where s.id=p_session_id and s.teacher_id=auth.uid())
 and not exists(select 1 from public.tbl_team_members m where m.session_id=p_session_id and m.user_id=auth.uid())) then raise exception 'Session access denied';end if;
 return jsonb_build_object(
  'revision',coalesce((select c.revision from public.tbl_session_participation c where c.session_id=p_session_id),0),
  'target_count',(select count(*) from public.tbl_active_team_ids(p_session_id)),
  'frozen',exists(select 1 from public.tbl_stages st where st.session_id=p_session_id and (st.is_locked or st.is_revealed)) or exists(select 1 from public.tbl_stage_results r where r.session_id=p_session_id),
  'teams',coalesce((select jsonb_agg(jsonb_build_object('team_id',t.id,'team_number',t.team_number,'team_name',t.team_name,'active',t.id in(select public.tbl_active_team_ids(p_session_id))) order by t.team_number) from public.tbl_teams t where t.session_id=p_session_id),'[]'::jsonb)
 );
end;$f$;
revoke all on function public.tbl_session_roster(uuid) from public,anon;
grant execute on function public.tbl_session_roster(uuid) to authenticated;

create or replace function public.tbl_teacher_set_participation(p_session_id uuid,p_team_ids uuid[],p_expected_revision bigint,p_confirm_title text)
returns void language plpgsql security definer set search_path='' as $f$
declare v_revision bigint;v_ids uuid[];
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Teacher authentication required';end if;
 if not exists(select 1 from public.tbl_sessions s where s.id=p_session_id and s.teacher_id=auth.uid() and s.title=p_confirm_title) then raise exception 'Teacher access or title confirmation denied';end if;
 -- Same stage locks as submission/withdrawal/locking. Lock every stage in order.
 perform 1 from public.tbl_stages st where st.session_id=p_session_id order by st.stage_number for update;
 if not found then raise exception 'Session has no stages';end if;
 select coalesce((select c.revision from public.tbl_session_participation c where c.session_id=p_session_id),0) into v_revision;
 if p_expected_revision is distinct from v_revision then raise exception 'Roster changed; reload before saving';end if;
 if exists(select 1 from public.tbl_stages st where st.session_id=p_session_id and (st.is_locked or st.is_revealed)) or exists(select 1 from public.tbl_stage_results r where r.session_id=p_session_id) then raise exception 'Locked or scored session roster cannot change';end if;
 if p_team_ids is null or cardinality(p_team_ids)=0 or array_position(p_team_ids,null) is not null then raise exception 'Select at least one team';end if;
 select array_agg(distinct x order by x) into v_ids from unnest(p_team_ids) x;
 if cardinality(v_ids)<>cardinality(p_team_ids) or exists(select 1 from unnest(v_ids) x where not exists(select 1 from public.tbl_teams t where t.id=x and t.session_id=p_session_id)) then raise exception 'Invalid or duplicate team';end if;
 if exists(select 1 from public.tbl_submissions sub where sub.session_id=p_session_id and not(sub.team_id=any(v_ids))) then raise exception 'Excluded team has answers; review and withdraw those answers first';end if;
 insert into public.tbl_session_participation(session_id,team_ids,revision,updated_by)
 values(p_session_id,v_ids,v_revision+1,auth.uid()) on conflict(session_id) do update set team_ids=excluded.team_ids,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=now();
end;$f$;
revoke all on function public.tbl_teacher_set_participation(uuid,uuid[],bigint,text) from public,anon;
grant execute on function public.tbl_teacher_set_participation(uuid,uuid[],bigint,text) to authenticated;

create or replace function public.tbl_teacher_lock_stage(p_session_id uuid,p_stage integer)
returns void language plpgsql security definer set search_path='' as $f$
declare v_target integer;v_count integer;
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) or not exists(select 1 from public.tbl_sessions s where s.id=p_session_id and s.teacher_id=auth.uid()) then raise exception 'Teacher access denied';end if;
 perform 1 from public.tbl_stages st where st.session_id=p_session_id and st.stage_number=p_stage and st.is_open=true and st.is_locked=false and st.is_revealed=false for update;
 if not found then raise exception 'Stage is not open';end if;
 select count(*) into v_target from public.tbl_active_team_ids(p_session_id);
 select count(distinct sub.team_id) into v_count from public.tbl_submissions sub where sub.session_id=p_session_id and sub.stage_number=p_stage and sub.team_id in(select public.tbl_active_team_ids(p_session_id));
 if v_target=0 or v_count<>v_target then raise exception 'All active teams must submit: % / %',v_count,v_target;end if;
 update public.tbl_stages set is_open=false,is_locked=true where session_id=p_session_id and stage_number=p_stage;
end;$f$;
revoke all on function public.tbl_teacher_lock_stage(uuid,integer) from public,anon;
grant execute on function public.tbl_teacher_lock_stage(uuid,integer) to authenticated;

-- Defense in depth: old clients/RPCs cannot insert inactive membership/answers.
create or replace function public.tbl_require_participating_team()
returns trigger language plpgsql security definer set search_path='' as $f$
begin
 if not exists(select 1 from public.tbl_active_team_ids(new.session_id) id where id=new.team_id) then raise exception 'This team is not participating in this session';end if;
 return new;
end;$f$;
revoke all on function public.tbl_require_participating_team() from public,anon,authenticated;
drop trigger if exists tbl_participation_submission on public.tbl_submissions;
create trigger tbl_participation_submission before insert or update on public.tbl_submissions for each row execute function public.tbl_require_participating_team();
drop trigger if exists tbl_participation_membership on public.tbl_team_members;
create trigger tbl_participation_membership before insert or update on public.tbl_team_members for each row execute function public.tbl_require_participating_team();

-- Return active roster placeholders so the score UI never invents team numbers.
-- Only revealed result rows are joined: no unrevealed scores leave the database.
create or replace function public.tbl_published_scores(p_session_id uuid)
returns table(team_number integer,team_name text,stage_number integer,score numeric)
language plpgsql security definer set search_path='' as $f$
begin
 perform public.tbl_session_roster(p_session_id);
 return query select t.team_number,t.team_name,r.stage_number,r.score
 from public.tbl_teams t left join (
 select r.* from public.tbl_stage_results r join public.tbl_stages st on st.session_id=r.session_id and st.stage_number=r.stage_number where st.is_revealed=true
 ) r on r.session_id=t.session_id and r.team_id=t.id
 where t.session_id=p_session_id and t.id in(select public.tbl_active_team_ids(p_session_id)) order by t.team_number,r.stage_number;
end;$f$;
revoke all on function public.tbl_published_scores(uuid) from public,anon;
grant execute on function public.tbl_published_scores(uuid) to authenticated;
create or replace function public.tbl_teacher_simulate_test_submissions(p_session_id uuid, p_stage integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
 v_user uuid := auth.uid();
 v_stage public.tbl_stages%rowtype;
 v_inserted integer;
begin
 if p_session_id is distinct from '0f82561e-c980-44cb-8a5d-091dbc9c71e6'::uuid then
  raise exception 'Simulation is restricted to the designated TEST session';
 end if;
 if v_user is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
  raise exception 'Teacher authentication required';
 end if;
 perform 1 from public.tbl_sessions
 where id = p_session_id and title = '2026 ID Block TBL — TEST' and teacher_id = v_user
 for share;
 if not found then raise exception 'TEST teacher access denied'; end if;
 select * into v_stage from public.tbl_stages
 where session_id = p_session_id and stage_number = p_stage for update;
 if not found then raise exception 'Stage not found'; end if;
 if v_stage.is_open is not true or v_stage.is_locked is distinct from false or v_stage.is_revealed is distinct from false then
  raise exception 'Stage is closed or locked';
 end if;
 if not exists(select 1 from public.tbl_active_team_ids(p_session_id)) then raise exception 'No active teams';end if;
 insert into public.tbl_submissions(session_id, team_id, stage_number, answer, submitted_by)
 select p_session_id, team.id, p_stage, 'A', v_user
 from public.tbl_teams team where team.session_id = p_session_id and team.id in(select public.tbl_active_team_ids(p_session_id))
 on conflict (session_id, team_id, stage_number) do nothing;
 get diagnostics v_inserted = row_count;
 return v_inserted;
end;
$function$;
revoke all on function public.tbl_teacher_simulate_test_submissions(uuid, integer) from public, anon;
grant execute on function public.tbl_teacher_simulate_test_submissions(uuid, integer) to authenticated;


create or replace function public.tbl_join_team(p_join_code uuid)
returns table(team_number integer,team_name text) language plpgsql security definer set search_path='' as $f$
declare v_user uuid:=auth.uid();v_team public.tbl_teams%rowtype;v_existing uuid;
begin
 if v_user is null then raise exception 'Authentication required';end if;
 if coalesce((auth.jwt()->>'is_anonymous')::boolean,false) is not true then raise exception 'Anonymous student sign-in required';end if;
 select t.* into v_team from public.tbl_team_invites i join public.tbl_teams t on t.id=i.team_id where i.join_code=p_join_code for update of i;
 if not found then raise exception 'Invalid join code';end if;
 if v_team.id not in(select public.tbl_active_team_ids(v_team.session_id)) then raise exception 'This team is not participating in this session';end if;
 select m.team_id into v_existing from public.tbl_team_members m where m.session_id=v_team.session_id and m.user_id=v_user;
 if v_existing is not null then
  if v_existing<>v_team.id then raise exception 'Already registered in another team';end if;
  return query select v_team.team_number,v_team.team_name;return;
 end if;
 if exists(select 1 from public.tbl_team_members m where m.team_id=v_team.id) then raise exception 'Team already registered';end if;
 insert into public.tbl_team_members(session_id,team_id,user_id) values(v_team.session_id,v_team.id,v_user);
 return query select v_team.team_number,v_team.team_name;
end;$f$;
revoke all on function public.tbl_join_team(uuid) from public,anon;
grant execute on function public.tbl_join_team(uuid) to authenticated;

create or replace function public.tbl_student_status()
returns table(session_id uuid,team_number integer,team_name text,stage_number integer,is_open boolean,is_locked boolean,is_revealed boolean,my_answer text,my_submitted_at timestamptz)
language sql security definer set search_path='' as $f$
 select t.session_id,t.team_number,t.team_name,st.stage_number,
 st.is_open and t.id in(select public.tbl_active_team_ids(t.session_id)),st.is_locked,st.is_revealed,sub.answer,sub.submitted_at
 from public.tbl_team_members m join public.tbl_teams t on t.id=m.team_id and t.session_id=m.session_id
 join public.tbl_stages st on st.session_id=t.session_id
 left join public.tbl_submissions sub on sub.session_id=t.session_id and sub.team_id=t.id and sub.stage_number=st.stage_number
 where m.user_id=auth.uid() order by st.stage_number;
$f$;
revoke all on function public.tbl_student_status() from public,anon;
grant execute on function public.tbl_student_status() to authenticated;

commit;
