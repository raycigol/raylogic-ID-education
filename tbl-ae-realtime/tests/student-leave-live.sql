-- TEST-only, rolled-back verification; leaves all classroom rows unchanged.
begin;
set local lock_timeout='5s';
create or replace function pg_temp.tbl_fingerprint(exclude_members boolean default false) returns jsonb language plpgsql as $$
declare t record;v text;r jsonb:='{}';begin
 for t in select tablename from pg_tables where schemaname='public' and tablename like 'tbl_%' and (not exclude_members or tablename<>'tbl_team_members') order by tablename loop
 execute format('select md5(coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text)::text,''[]'')) from public.%I x',t.tablename) into v;r:=r||jsonb_build_object(t.tablename,v);end loop;return r;end;$$;
create temp table leave_verification(result text) on commit drop;
do $$
declare sid uuid:='0f82561e-c980-44cb-8a5d-091dbc9c71e6';student uuid;team uuid;before_data jsonb;protected_data jsonb;n integer;
begin
 if not exists(select 1 from public.tbl_sessions where id=sid and title='2026 ID Block TBL — TEST') then raise exception 'TEST identity mismatch';end if;
 select id into student from auth.users u where is_anonymous=true and not exists(select 1 from public.tbl_team_members m where m.user_id=u.id) limit 1;
 select id into team from public.tbl_teams t where session_id=sid and team_number=5 and not exists(select 1 from public.tbl_team_members m where m.team_id=t.id);
 if student is null or team is null then raise exception 'Unbound TEST student and TEST5 required';end if;
 before_data:=pg_temp.tbl_fingerprint();
 begin
 insert into public.tbl_team_members(session_id,team_id,user_id) values(sid,team,student);
 insert into public.tbl_submissions(session_id,team_id,stage_number,answer,submitted_by) values(sid,team,1,'B',student) on conflict(session_id,team_id,stage_number) do nothing;
 protected_data:=pg_temp.tbl_fingerprint(true);
 perform set_config('request.jwt.claim.sub',student::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',student,'is_anonymous',true)::text,true);
 begin perform public.tbl_student_leave_session(sid,12);raise exception 'Wrong team accepted';exception when raise_exception then if sqlerrm<>'Representative changed; refresh before leaving' then raise;end if;end;
 if not exists(select 1 from public.tbl_team_members where session_id=sid and user_id=student) then raise exception 'Wrong team deleted member';end if;
 n:=public.tbl_student_leave_session(sid,5);if n<>1 then raise exception 'Release failed';end if;
 if public.tbl_student_leave_session(sid,5)<>0 then raise exception 'Repeated leave failed';end if;
 if public.tbl_student_leave_session('7a3f52a2-bae0-4f68-8fb1-a4768fd58b1d',13)<>0 then raise exception 'Foreign session affected';end if;
 if protected_data is distinct from pg_temp.tbl_fingerprint(true) then raise exception 'Answers or protected rows changed';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',student,'is_anonymous',false)::text,true);
 begin perform public.tbl_student_leave_session(sid,5);raise exception 'Non-anonymous accepted';exception when raise_exception then if sqlerrm<>'Student authentication required' then raise;end if;end;
 raise exception using errcode='ZX001',message='rollback successful TEST exercise';
 exception when sqlstate 'ZX001' then null;end;
 if before_data is distinct from pg_temp.tbl_fingerprint() then raise exception 'Rollback data mismatch';end if;
 insert into leave_verification values('PASS: TEST self-release, wrong-team guard, repeat leave, auth guard, answers preserved; all tbl_* rows restored exactly');
end;$$;
select * from leave_verification;
rollback;