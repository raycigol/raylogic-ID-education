-- TEST-only changes in a rolled-back subtransaction. Outer transaction also rolls back.
begin;
set local lock_timeout='5s';
create or replace function pg_temp.timer_fingerprint() returns jsonb language plpgsql as $$
declare t record;v text;r jsonb:='{}';
begin
 for t in select tablename from pg_tables where schemaname='public' and tablename like 'tbl_%' order by tablename loop
  execute format('select md5(coalesce(jsonb_agg(j order by j::text)::text,''[]'')) from (select to_jsonb(x) j from public.%I x) q',t.tablename) into v;
  r:=r||jsonb_build_object(t.tablename,v);
 end loop;return r;
end;$$;
create temp table timer_verification(result text) on commit drop;
do $$
declare sid uuid:='0f82561e-c980-44cb-8a5d-091dbc9c71e6';teacher uuid;student uuid;before_data jsonb;rev bigint;status jsonb;
begin
 select teacher_id into teacher from public.tbl_sessions where id=sid and title='2026 ID Block TBL — TEST';
 if teacher is null then raise exception 'TEST identity mismatch';end if;
 select user_id into student from public.tbl_team_members where session_id=sid limit 1;
 if student is null then select id into student from auth.users u where is_anonymous=true and not exists(select 1 from public.tbl_team_members m where m.user_id=u.id and m.session_id<>sid) limit 1;end if;
 if student is null then raise exception 'TEST student representative required';end if;
 before_data:=pg_temp.timer_fingerprint();
 begin
  if not exists(select 1 from public.tbl_team_members where session_id=sid and user_id=student) then
   insert into public.tbl_team_members(session_id,team_id,user_id) select sid,id,student from public.tbl_teams where session_id=sid order by team_number limit 1;
  end if;
  perform set_config('request.jwt.claim.sub',teacher::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',teacher,'is_anonymous',false)::text,true);
  update public.tbl_stages set is_open=false where session_id=sid;
  update public.tbl_stages set is_locked=false,is_revealed=false,is_open=true where session_id=sid and stage_number=1;
  select coalesce((select revision from public.tbl_session_timers where session_id=sid),0) into rev;
  perform public.tbl_teacher_timer(sid,'start',1,'discussion',120,rev);
  select revision into rev from public.tbl_session_timers where session_id=sid;
  perform public.tbl_teacher_timer(sid,'pause',p_revision=>rev);
  perform public.tbl_teacher_timer(sid,'add',p_seconds=>60,p_revision=>rev+1);
  perform public.tbl_teacher_timer(sid,'resume',p_revision=>rev+2);
  perform set_config('request.jwt.claim.sub',student::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',student,'is_anonymous',true)::text,true);
  status:=public.tbl_timer_status(sid);
  if status->'timer'->>'phase'<>'discussion' or status->'timer'->>'state'<>'running' then raise exception 'Student timer mismatch';end if;
  begin
   perform public.tbl_teacher_timer(sid,'stop',p_revision=>rev+3);raise exception 'Student write accepted';
  exception when raise_exception then if sqlerrm<>'Teacher authentication required' then raise;end if;end;
  begin
   perform public.tbl_timer_status('7a3f52a2-bae0-4f68-8fb1-a4768fd58b1d');raise exception 'Formal read accepted';
  exception when raise_exception then if sqlerrm<>'Class access denied' then raise;end if;end;
  perform set_config('request.jwt.claim.sub',teacher::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',teacher,'is_anonymous',false)::text,true);
  perform public.tbl_teacher_close_stage(sid,1);
  if (select state from public.tbl_session_timers where session_id=sid)<>'paused' then raise exception 'Close did not pause';end if;
  update public.tbl_stages set is_open=true where session_id=sid and stage_number=1;
  select revision into rev from public.tbl_session_timers where session_id=sid;
  perform public.tbl_teacher_timer(sid,'start',1,'submission',30,rev);
  if public.tbl_timer_status(sid)->'timer'->>'phase'<>'submission' then raise exception 'Submission phase mismatch';end if;
  update public.tbl_stages set is_locked=true where session_id=sid and stage_number=1;
  if (select state from public.tbl_session_timers where session_id=sid)<>'idle' then raise exception 'Lock did not stop';end if;
  raise exception using errcode='ZX001',message='Rollback TEST timer changes';
 exception when sqlstate 'ZX001' then null;end;
 if before_data is distinct from pg_temp.timer_fingerprint() then raise exception 'Classroom data changed';end if;
 insert into timer_verification values('PASS: discussion/submission, pause/resume/add, student read/write protection, formal/TEST isolation, close/lock; ALL tbl_* data identical after rollback');
end;$$;
select * from timer_verification;
rollback;
