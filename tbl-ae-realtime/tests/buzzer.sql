-- Supabase SQL Editor: TEST-only fixtures; all changes rolled back.
begin;
create or replace function pg_temp.buzzer_snapshot(p_session uuid)
returns jsonb language plpgsql as $f$
declare v_result jsonb:='{}';v_table text;v_rows jsonb;
begin
 for v_table in select distinct table_name from information_schema.columns where table_schema='public' and column_name='session_id' and table_name like 'tbl_%' loop
  execute format('select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),''[]''::jsonb) from public.%I x where session_id=$1',v_table) into v_rows using p_session;
  v_result:=v_result||jsonb_build_object(v_table,v_rows);
 end loop;
 select to_jsonb(s) into v_rows from public.tbl_sessions s where id=p_session;
 v_result:=v_result||jsonb_build_object('session',v_rows);
 select coalesce(jsonb_agg(to_jsonb(l) order by l.id),'[]'::jsonb) into v_rows from public.tbl_buzzer_score_log l join public.tbl_buzzer_rounds r on r.id=l.round_id where r.session_id=p_session;
 return v_result||jsonb_build_object('buzzer_log',v_rows);
end;$f$;
create temp table buzzer_before as select id,pg_temp.buzzer_snapshot(id) snapshot from public.tbl_sessions;
savepoint buzzer_qa;
do $v$
declare
 v_session uuid:='0f82561e-c980-44cb-8a5d-091dbc9c71e6';
 v_teacher uuid;v_team1 uuid;v_team2 uuid;v_user1 uuid:=gen_random_uuid();v_user2 uuid:=gen_random_uuid();
 v_round uuid;v_next uuid;v_status jsonb;v_failed boolean;v_title text;
begin
 select teacher_id,title into v_teacher,v_title from public.tbl_sessions where id=v_session for update;
 if v_teacher is null or v_title<>'2026 ID Block TBL — TEST' then raise exception 'TEST fixture guard failed';end if;
 select id into strict v_team1 from public.tbl_teams where session_id=v_session and team_number=1;
 select id into strict v_team2 from public.tbl_teams where session_id=v_session and team_number=2;
 insert into auth.users(id,is_anonymous) values(v_user1,true),(v_user2,true);
 insert into public.tbl_team_members(session_id,team_id,user_id) values(v_session,v_team1,v_user1),(v_session,v_team2,v_user2);
 update public.tbl_buzzer_rounds set state='closed',archived_at=clock_timestamp() where session_id=v_session and archived_at is null;
 perform set_config('request.jwt.claim.sub',v_teacher::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_teacher,'is_anonymous',false)::text,true);
 perform public.tbl_teacher_buzzer(v_session,'disable');
 v_status:=public.tbl_buzzer_status(v_session);
 if (v_status->>'enabled')::boolean then raise exception 'Disable failed';end if;
 perform public.tbl_teacher_buzzer(v_session,'enable');
 v_status:=public.tbl_buzzer_status(v_session);
 if (v_status->>'enabled')::boolean is not true then raise exception 'Enable failed';end if;
 v_round:=public.tbl_teacher_buzzer(v_session,'start');
 v_failed:=false;
 begin perform public.tbl_teacher_buzzer(v_session,'start');exception when others then
  if sqlerrm<>'A buzzer round is already open' then raise;end if;v_failed:=true;
 end;
 if not v_failed then raise exception 'Duplicate open accepted';end if;
 perform set_config('request.jwt.claim.sub',v_user1::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user1,'is_anonymous',true)::text,true);
 v_failed:=false;
 begin perform public.tbl_teacher_buzzer(v_session,'close',v_round);exception when others then
  if sqlerrm<>'Teacher authentication required' then raise;end if;v_failed:=true;
 end;
 if not v_failed then raise exception 'Student teacher action accepted';end if;
 if public.tbl_student_buzz(v_session,v_round) is not true or public.tbl_student_buzz(v_session,v_round) is not true then raise exception 'Winner/retry failed';end if;
 perform set_config('request.jwt.claim.sub',v_user2::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user2,'is_anonymous',true)::text,true);
 if public.tbl_student_buzz(v_session,v_round) is not false then raise exception 'Late request replaced winner';end if;
 v_status:=public.tbl_buzzer_status(v_session);
 if v_status->'rounds'->0->>'winner_team_id'<>v_team1::text or v_status->'score_log'<>'[]'::jsonb then raise exception 'Winner/privacy failed';end if;
 perform set_config('request.jwt.claim.sub',v_teacher::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_teacher,'is_anonymous',false)::text,true);
 perform public.tbl_teacher_buzzer(v_session,'score',v_round,5,'QA correct',0);
 v_failed:=false;
 begin perform public.tbl_teacher_buzzer(v_session,'score',v_round,9,'QA stale',0);exception when others then
  if sqlerrm<>'Score changed; refresh before retrying' then raise;end if;v_failed:=true;
 end;
 if not v_failed then raise exception 'Stale score accepted';end if;
 perform public.tbl_teacher_buzzer(v_session,'score',v_round,3,'QA correction',5);
 if (select count(*) from public.tbl_buzzer_score_log where round_id=v_round)<>2 then raise exception 'Audit failed';end if;
 if not exists(select 1 from jsonb_array_elements(public.tbl_buzzer_status(v_session)->'totals') t where t->>'team_id'=v_team1::text and (t->>'points')::int=3) then raise exception 'Total failed';end if;
 perform public.tbl_teacher_buzzer(v_session,'disable');
 v_status:=public.tbl_buzzer_status(v_session);
 if (v_status->>'enabled')::boolean or not exists(select 1 from jsonb_array_elements(v_status->'totals') t where t->>'team_id'=v_team1::text and (t->>'points')::int=3) then raise exception 'Disable lost scores';end if;
 perform public.tbl_teacher_buzzer(v_session,'enable');
 v_next:=public.tbl_teacher_buzzer(v_session,'start');
 perform set_config('request.jwt.claim.sub',v_user2::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user2,'is_anonymous',true)::text,true);
 if public.tbl_student_buzz(v_session,v_round) is not false then raise exception 'Old round accepted';end if;
 if (public.tbl_buzzer_status(v_session)->'rounds'->0->>'winner_team_id') is not null then raise exception 'Old request claimed new round';end if;
 delete from public.tbl_team_members where session_id=v_session and user_id=v_user2;
 v_failed:=false;
 begin perform public.tbl_student_buzz(v_session,v_next);exception when others then
  if sqlerrm<>'Team membership not found' then raise;end if;v_failed:=true;
 end;
 if not v_failed then raise exception 'Released representative accepted';end if;
 perform set_config('request.jwt.claim.sub',v_teacher::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_teacher,'is_anonymous',false)::text,true);
 perform public.tbl_teacher_reset_session(v_session,v_title);
 v_status:=public.tbl_buzzer_status(v_session);
 if (v_status->>'enabled')::boolean then raise exception 'Reset left feature enabled';end if;
 if v_status->'rounds'<>'[]'::jsonb or exists(select 1 from jsonb_array_elements(v_status->'totals') t where (t->>'points')::int<>0) then raise exception 'Reset not cleared';end if;
 if (select count(*) from public.tbl_buzzer_score_log where round_id=v_round)<>2 then raise exception 'Reset lost audit';end if;
 perform set_config('request.jwt.claim.sub',v_user1::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user1,'is_anonymous',true)::text,true);
 v_failed:=false;
 begin perform public.tbl_student_buzz(v_session,v_round);exception when others then
  if sqlerrm<>'Buzzer feature is disabled' then raise;end if;v_failed:=true;
 end;
 if not v_failed then raise exception 'Archived round accepted';end if;
 if exists(select 1 from buzzer_before b where b.id<>v_session and pg_temp.buzzer_snapshot(b.id) is distinct from b.snapshot) then raise exception 'Other classroom modified';end if;
 if has_table_privilege('authenticated','public.tbl_buzzer_rounds','SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('authenticated','public.tbl_buzzer_score_log','SELECT,INSERT,UPDATE,DELETE') or has_function_privilege('anon','public.tbl_student_buzz(uuid,uuid)','execute') then raise exception 'Direct/anonymous privilege exposed';end if;
end;$v$;
rollback to buzzer_qa;
do $v$
begin
 if exists(select 1 from buzzer_before b where pg_temp.buzzer_snapshot(b.id) is distinct from b.snapshot) then raise exception 'Rollback snapshot mismatch';end if;
end;$v$;
rollback;
select 'PASS: TEST winner/retry/late/old-round guards; manual score/audit/stale correction; student denied teacher actions; representative revoked; reset archives and zeroes totals; all classroom snapshots restored; QA rolled back' verification;
