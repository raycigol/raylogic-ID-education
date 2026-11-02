-- Run as postgres in Supabase SQL Editor, ONLY against the named TEST fixture.
-- Every classroom mutation is inside rollback subtransactions; final ROLLBACK.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create function pg_temp.participation_snapshot() returns jsonb language plpgsql as $f$
declare r record;h text;result jsonb:='{}';begin
 for r in select tablename from pg_tables where schemaname='public' and tablename like 'tbl_%' order by tablename loop
  execute format('select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'''') ) from public.%I t',r.tablename) into h;
  result:=result||jsonb_build_object(r.tablename,h);
 end loop;return result;end;$f$;
create function pg_temp.expect_failure(command text,expected text) returns void language plpgsql as $f$
begin
 begin execute command;exception when others then
  if position(expected in sqlerrm)>0 then return;end if;raise;
 end;raise exception 'Expected rejection: %',expected;
end;$f$;
create temporary table participation_qa_result(check_name text,result text) on commit drop;
do $test$
declare
 sid constant uuid:='0f82561e-c980-44cb-8a5d-091dbc9c71e6';
 title constant text:='2026 ID Block TBL — TEST';
 owner_id uuid;student_id uuid;team1 uuid;team8 uuid;last_team uuid;foreign_team uuid;foreign_session uuid;
 code1 uuid;code8 uuid;short8 text;ids uuid[];rev bigint;r jsonb;j jsonb;num integer;st integer;n integer;
 before_all jsonb;score_sum numeric;completed integer:=0;
begin
 select teacher_id into owner_id from public.tbl_sessions where id=sid and tbl_sessions.title=title;
 if owner_id is null then raise exception 'Named TEST fixture missing';end if;
 if exists(select 1 from public.tbl_submissions where session_id=sid) or exists(select 1 from public.tbl_stage_results where session_id=sid) then raise exception 'TEST has answers or grades; preserve them and use a separate approved fixture';end if;
 select id into student_id from auth.users where is_anonymous=true order by created_at limit 1;
 select id,session_id into foreign_team,foreign_session from public.tbl_teams where session_id<>sid order by id limit 1;
 if student_id is null or foreign_team is null then raise exception 'Required QA identities missing';end if;
 before_all:=pg_temp.participation_snapshot();
 begin
  -- Transient teams only; the enclosing exception restores original 13 teams.
  insert into public.tbl_teams(session_id,team_number,team_name)
  select sid,x,'QA temporary team '||x from generate_series(14,17) x
  where not exists(select 1 from public.tbl_teams t where t.session_id=sid and t.team_number=x);
  insert into public.tbl_team_invites(team_id)
  select t.id from public.tbl_teams t where t.session_id=sid and not exists(select 1 from public.tbl_team_invites i where i.team_id=t.id);
  select id into team1 from public.tbl_teams where session_id=sid and team_number=1;
  select id into team8 from public.tbl_teams where session_id=sid and team_number=8;
  select join_code into code1 from public.tbl_team_invites where team_id=team1;
  select join_code into code8 from public.tbl_team_invites where team_id=team8;
  foreach num in array array[13,16,17] loop
   begin
    update public.tbl_stages set is_open=false,is_locked=false,is_revealed=false where session_id=sid;
    select array_agg(id order by id) into ids from public.tbl_teams where session_id=sid and
      (case when num=13 then team_number<=13 when num=16 then team_number<>8 else true end);
    select coalesce((select revision from public.tbl_session_participation where session_id=sid),0) into rev;
    if num=16 then
     insert into public.tbl_team_members(session_id,team_id,user_id) values(sid,team8,student_id)
     on conflict(session_id,user_id) do update set team_id=excluded.team_id;
    end if;
    perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','is_anonymous',false)::text,true);
    perform set_config('role','authenticated',true);
    perform pg_temp.expect_failure(format('select public.tbl_teacher_set_participation(%L,ARRAY[]::uuid[],%s,%L)',sid,rev,title),'Select at least one');
    perform pg_temp.expect_failure(format('select public.tbl_teacher_set_participation(%L,ARRAY[%L]::uuid[],%s,%L)',sid,foreign_team,rev,title),'Invalid');
    perform public.tbl_teacher_set_participation(sid,ids,rev,title);
    r:=public.tbl_session_roster(sid);
    if (r->>'target_count')::int<>num then raise exception 'Wrong denominator';end if;
    perform pg_temp.expect_failure(format('select public.tbl_teacher_set_participation(%L,%L::uuid[],%s,%L)',sid,ids,rev,title),'Roster changed');
    if has_table_privilege('authenticated','public.tbl_session_participation','UPDATE') then raise exception 'Direct roster update exposed';end if;
    if num=16 then
     perform public.tbl_teacher_join_codes(sid,null);
     perform set_config('role','postgres',true);
     select code into short8 from public.tbl_team_short_codes where team_id=team8 and is_active;
     perform set_config('request.jwt.claims',jsonb_build_object('sub',student_id,'role','authenticated','is_anonymous',true)::text,true);
     perform set_config('role','authenticated',true);
     perform pg_temp.expect_failure(format('select public.tbl_join_team(%L)',code8),'not participating');
     j:=public.tbl_join_with_code(short8);
     if (j->>'ok')::boolean then raise exception 'Inactive short code joined';end if;
     perform pg_temp.expect_failure(format('select public.tbl_teacher_set_participation(%L,%L::uuid[],%s,%L)',sid,ids,rev+1,title),'Teacher authentication');
     perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','is_anonymous',false)::text,true);
    end if;
    for st in 1..4 loop
     perform public.tbl_teacher_open_stage(sid,st);
     perform pg_temp.expect_failure(format('select public.tbl_teacher_lock_stage(%L,%s)',sid,st),'All active teams');
     if num=16 and st=1 then
      perform set_config('request.jwt.claims',jsonb_build_object('sub',student_id,'role','authenticated','is_anonymous',true)::text,true);
      if exists(select 1 from public.tbl_student_status() s where s.session_id=sid and s.is_open) then raise exception 'Inactive controls open';end if;
      perform pg_temp.expect_failure(format('select public.tbl_submit_answer(%L,1,''A'')',sid),'not participating');
      perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','is_anonymous',false)::text,true);
     end if;
     perform public.tbl_teacher_simulate_test_submissions(sid,st);
     n:=public.tbl_teacher_simulate_test_submissions(sid,st);
     if n<>0 then raise exception 'Simulation not idempotent';end if;
     if st=1 then
      perform pg_temp.expect_failure(format('select public.tbl_teacher_set_participation(%L,%L::uuid[],%s,%L)',sid,array_remove(ids,team1),rev+1,title),'has answers');
      -- Leave exactly one enabled team missing, even though all others submitted.
      perform set_config('role','postgres',true);
      select team_id into last_team from public.tbl_submissions where session_id=sid and stage_number=st order by team_id limit 1;
      delete from public.tbl_submissions where session_id=sid and stage_number=st and team_id=last_team;
      perform set_config('role','authenticated',true);
      perform pg_temp.expect_failure(format('select public.tbl_teacher_lock_stage(%L,%s)',sid,st),'All active teams');
      perform public.tbl_teacher_simulate_test_submissions(sid,st);
     end if;
     if exists(select 1 from public.tbl_published_scores(sid) s where s.stage_number=st and s.score is not null) then raise exception 'Unpublished score leak';end if;
     perform public.tbl_teacher_lock_stage(sid,st);
     perform pg_temp.expect_failure(format('select public.tbl_teacher_set_participation(%L,%L::uuid[],%s,%L)',sid,ids,rev+1,title),'Locked');
     perform public.tbl_teacher_publish_stage(sid,st);
     select count(*) into n from public.tbl_published_scores(sid) s where s.stage_number=st;
     if n<>num then raise exception 'Published team count mismatch: % / %',n,num;end if;
    end loop;
    select sum(score) into score_sum from public.tbl_published_scores(sid) where team_number=1;
    if score_sum<>40 then raise exception 'Original A-answer scoring changed: %',score_sum;end if;
    perform pg_temp.expect_failure(format('select public.tbl_teacher_simulate_test_submissions(%L,1)',foreign_session),'restricted');
    raise exception 'QA_CASE_ROLLBACK';
   exception when raise_exception then if sqlerrm<>'QA_CASE_ROLLBACK' then raise;end if;
   end;
   completed:=completed+1;
  end loop;
  if completed<>3 then raise exception 'Not all cases completed';end if;
  raise exception 'QA_ALL_ROLLBACK';
 exception when raise_exception then if sqlerrm<>'QA_ALL_ROLLBACK' then raise;end if;
 end;
 if pg_temp.participation_snapshot() is distinct from before_all then raise exception 'Classroom data changed after rollback';end if;
 insert into participation_qa_result values
 ('13 / 16 (team 8 absent) / 17 teams','PASS'),
 ('Stage 1-4 open / partial rejection / lock / publish / original score','PASS'),
 ('Inactive UUID / short code / existing representative / student permissions','PASS'),
 ('Stale roster / existing answers / locked roster / score privacy / TEST restriction','PASS'),
 ('ALL tbl_* rows, including formal AND TEST, identical after rollback','PASS');
end;$test$;
select * from participation_qa_result;
rollback;

