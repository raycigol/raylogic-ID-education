-- TEST-only synthetic state inside a rolled-back subtransaction.
begin;
set local lock_timeout='5s';
create or replace function pg_temp.tbl_fingerprint() returns jsonb language plpgsql as $$
declare t record;v text;r jsonb:='{}';
begin
 for t in select tablename from pg_tables where schemaname='public' and tablename like 'tbl_%' order by tablename loop
  execute format('select md5(coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text)::text,''[]'')) from public.%I x',t.tablename) into v;
  r:=r||jsonb_build_object(t.tablename,v);
 end loop;return r;
end;$$;
create temp table close_stage_verification(result text) on commit drop;
do $$
declare sid uuid:='0f82561e-c980-44cb-8a5d-091dbc9c71e6';teacher uuid;student uuid;before_data jsonb;answers_before jsonb;answers_after jsonb;
begin
 select teacher_id into teacher from public.tbl_sessions where id=sid and title='2026 ID Block TBL — TEST';
 if teacher is null then raise exception 'TEST identity mismatch';end if;
 select user_id into student from public.tbl_team_members where session_id=sid limit 1;
 if student is null then select id into student from auth.users where is_anonymous=true limit 1;end if;
 if student is null then raise exception 'TEST student required';end if;
 before_data:=pg_temp.tbl_fingerprint();
 begin
  if not exists(select 1 from public.tbl_team_members where session_id=sid and user_id=student) then
   insert into public.tbl_team_members(session_id,team_id,user_id) select sid,id,student from public.tbl_teams where session_id=sid and id in(select public.tbl_active_team_ids(sid)) order by team_number limit 1;
  end if;
  perform set_config('request.jwt.claim.sub',teacher::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',teacher,'is_anonymous',false)::text,true);
  update public.tbl_stages set is_open=false where session_id=sid;
  update public.tbl_stages set is_locked=false,is_revealed=false where session_id=sid and stage_number=1;
  perform public.tbl_teacher_open_stage(sid,1);
  perform public.tbl_teacher_simulate_test_submissions(sid,1);
  select jsonb_agg(to_jsonb(s) order by s.team_id) into answers_before from public.tbl_submissions s where session_id=sid;
  perform public.tbl_teacher_close_stage(sid,1);
  perform public.tbl_teacher_close_stage(sid,1); -- repeat close is safe
  if exists(select 1 from public.tbl_stages where session_id=sid and stage_number=1 and is_open) then raise exception 'Close failed';end if;
  select jsonb_agg(to_jsonb(s) order by s.team_id) into answers_after from public.tbl_submissions s where session_id=sid;
  if answers_before is distinct from answers_after then raise exception 'Answers changed';end if;
  perform set_config('request.jwt.claim.sub',student::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',student,'is_anonymous',true)::text,true);
  begin
   perform public.tbl_teacher_close_stage(sid,1);raise exception 'Student unexpectedly closed stage';
  exception when raise_exception then if sqlerrm<>'Teacher access denied' then raise;end if;end;
  begin
   perform public.tbl_submit_answer(sid,1,'B');raise exception 'Closed stage accepted submission';
  exception when raise_exception then if sqlerrm<>'Stage is closed or locked' then raise;end if;end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',student,'is_anonymous',false)::text,true);
  begin
   perform public.tbl_teacher_close_stage(sid,1);raise exception 'Non-owner unexpectedly closed stage';
  exception when raise_exception then if sqlerrm<>'Teacher access denied' then raise;end if;end;
  perform set_config('request.jwt.claim.sub',teacher::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',teacher,'is_anonymous',false)::text,true);
  perform public.tbl_teacher_open_stage(sid,1);
  perform set_config('request.jwt.claim.sub',student::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',student,'is_anonymous',true)::text,true);
  perform public.tbl_submit_answer(sid,1,'B');
  perform set_config('request.jwt.claim.sub',teacher::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',teacher,'is_anonymous',false)::text,true);
  update public.tbl_stages set is_locked=true where session_id=sid and stage_number=1;
  begin
   perform public.tbl_teacher_close_stage(sid,1);raise exception 'Locked close accepted';
  exception when raise_exception then if sqlerrm<>'Locked or published stage cannot close' then raise;end if;end;
  update public.tbl_stages set is_open=false,is_locked=true,is_revealed=true where session_id=sid and stage_number=1;
  begin
   perform public.tbl_teacher_close_stage(sid,1);raise exception 'Published close accepted';
  exception when raise_exception then if sqlerrm<>'Locked or published stage cannot close' then raise;end if;end;
  raise exception using errcode='ZX001',message='Rollback test changes';
 exception when sqlstate 'ZX001' then null;end;
 if before_data is distinct from pg_temp.tbl_fingerprint() then raise exception 'Classroom data changed';end if;
 insert into close_stage_verification values('PASS: close/reclose/reopen, answers preserved, closed submission denied, reopened submission accepted, student/non-owner/locked/published denied; ALL tbl_* data identical after rollback');
end;$$;
select * from close_stage_verification;
rollback;
