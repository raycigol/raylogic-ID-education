begin;
create function pg_temp.withdraw_snapshot(p_protected boolean) returns jsonb language plpgsql as $s$
declare entry record;predicate text;digest text;result jsonb:='{}'::jsonb;
begin
 for entry in select tablename from pg_tables where schemaname='public' and tablename like 'tbl_%' loop
  predicate:=case when not p_protected then 'true' when entry.tablename='tbl_sessions' then 'id<>''0f82561e-c980-44cb-8a5d-091dbc9c71e6''::uuid'
   when entry.tablename in ('tbl_stages','tbl_submissions','tbl_stage_results','tbl_team_members','tbl_answer_corrections') then 'session_id<>''0f82561e-c980-44cb-8a5d-091dbc9c71e6''::uuid' else 'true' end;
  execute format('select md5(coalesce(jsonb_agg(data order by data::text)::text,'''') ) from(select to_jsonb(t) data from public.%I t where %s) rows',entry.tablename,predicate) into digest;
  result:=result||jsonb_build_object(entry.tablename,digest);
 end loop;return result;
end;$s$;
do $v$
declare
 v_all jsonb:=pg_temp.withdraw_snapshot(false);v_protected jsonb:=pg_temp.withdraw_snapshot(true);
 v_team uuid;v_other uuid;v_formal uuid;v_owner uuid;v_student uuid;v_name text;
 v_original jsonb;v_expected jsonb;v_others jsonb;v_audit uuid;v_before integer;v_second_audit uuid;v_archive_at timestamptz;v_review jsonb;
 v_case integer;v_denied boolean;v_error text;v_title text;v_confirm text;v_reason text;v_target uuid;v_stage integer;
begin
 if not exists(select 1 from public.tbl_sessions where id='0f82561e-c980-44cb-8a5d-091dbc9c71e6' and title='2026 ID Block TBL — TEST') then raise exception 'TEST fixture missing';end if;
 select teacher_id into v_owner from public.tbl_sessions where id='0f82561e-c980-44cb-8a5d-091dbc9c71e6';
 select id,team_name into v_team,v_name from public.tbl_teams where session_id='0f82561e-c980-44cb-8a5d-091dbc9c71e6' and team_number=1;
 select id into v_other from public.tbl_teams where session_id='0f82561e-c980-44cb-8a5d-091dbc9c71e6' and team_number=2;
 select id into v_formal from public.tbl_teams where session_id<>'0f82561e-c980-44cb-8a5d-091dbc9c71e6' limit 1;
 select user_id into v_student from public.tbl_team_members where team_id=v_team limit 1;
 if v_student is null then select id into v_student from auth.users u where u.is_anonymous=true and not exists(select 1 from public.tbl_team_members m where m.user_id=u.id and m.session_id='0f82561e-c980-44cb-8a5d-091dbc9c71e6') limit 1;end if;
 if v_team is null or v_other is null or v_student is null or v_formal is null then raise exception 'Required QA identities missing';end if;
 begin
  insert into public.tbl_team_members(session_id,team_id,user_id) values('0f82561e-c980-44cb-8a5d-091dbc9c71e6',v_team,v_student) on conflict(session_id,user_id) do nothing;
  update public.tbl_stages set is_open=true,is_locked=false,is_revealed=false where session_id='0f82561e-c980-44cb-8a5d-091dbc9c71e6' and stage_number=1;
  delete from public.tbl_stage_results where session_id='0f82561e-c980-44cb-8a5d-091dbc9c71e6' and stage_number=1;
  insert into public.tbl_submissions(session_id,team_id,stage_number,answer,submitted_by) values
   ('0f82561e-c980-44cb-8a5d-091dbc9c71e6',v_team,1,'A',v_student),
   ('0f82561e-c980-44cb-8a5d-091dbc9c71e6',v_team,2,'C',v_student),
   ('0f82561e-c980-44cb-8a5d-091dbc9c71e6',v_other,1,'D',v_student)
  on conflict(session_id,team_id,stage_number) do update set answer=excluded.answer;
  select to_jsonb(sub) into v_original from public.tbl_submissions sub where team_id=v_team and stage_number=1;
  select coalesce(jsonb_agg(to_jsonb(sub) order by sub.id),'[]'::jsonb) into v_others from public.tbl_submissions sub where not(sub.team_id=v_team and sub.stage_number=1);
  select count(*) into v_before from public.tbl_answer_corrections;
  for v_case in 1..11 loop
   v_expected:=v_original;v_title:='2026 ID Block TBL — TEST';v_confirm:='撤回 '||v_name||' S1';v_reason:='QA 誤加入別組';v_target:=v_team;v_stage:=1;
   perform set_config('request.jwt.claims',jsonb_build_object('sub',v_owner,'role','authenticated','is_anonymous',false)::text,true);
   if v_case=1 then v_title:='wrong title';v_error:='Class title confirmation does not match';
   elsif v_case=2 then v_confirm:='wrong group';v_error:='Withdrawal confirmation does not match';
   elsif v_case=3 then v_reason:='  ';v_error:='A reason of 1 to 500 characters is required';
   elsif v_case=4 then v_expected:='{}'::jsonb;v_error:='Submission changed; refresh the list before withdrawing';
   elsif v_case=5 then v_target:=v_formal;v_error:='Team does not belong to this session';
   elsif v_case=6 then update public.tbl_stages set is_open=false,is_locked=true where session_id='0f82561e-c980-44cb-8a5d-091dbc9c71e6' and stage_number=1;v_error:='Locked or published stage cannot be withdrawn';
   elsif v_case=7 then update public.tbl_stages set is_open=false,is_locked=true,is_revealed=true where session_id='0f82561e-c980-44cb-8a5d-091dbc9c71e6' and stage_number=1;v_error:='Locked or published stage cannot be withdrawn';
   elsif v_case=8 then insert into public.tbl_stage_results(session_id,team_id,stage_number,score) values('0f82561e-c980-44cb-8a5d-091dbc9c71e6',v_other,1,5);v_error:='Stage already has scores; withdrawal denied';
   elsif v_case=9 then perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","is_anonymous":false}',true);v_error:='Teacher access denied';
   elsif v_case=10 then perform set_config('request.jwt.claims',jsonb_build_object('sub',v_student,'is_anonymous',true)::text,true);v_error:='Teacher authentication required';
   else v_stage:=5;v_confirm:='撤回 '||v_name||' S5';v_error:='Stage not found';end if;
   perform set_config('role','authenticated',true);v_denied:=false;
   begin perform public.tbl_teacher_withdraw_answer('0f82561e-c980-44cb-8a5d-091dbc9c71e6',v_target,v_stage,v_expected,v_title,v_confirm,v_reason);
   exception when others then if sqlerrm=v_error then v_denied:=true;else raise;end if;end;
   perform set_config('role','none',true);
   if not v_denied then raise exception 'Unsafe withdrawal accepted: %',v_case;end if;
   if (select count(*) from public.tbl_answer_corrections)<>v_before or (select to_jsonb(sub) from public.tbl_submissions sub where team_id=v_team and stage_number=1) is distinct from v_original then raise exception 'Denied request mutated audit/submission';end if;
   update public.tbl_stages set is_open=true,is_locked=false,is_revealed=false where session_id='0f82561e-c980-44cb-8a5d-091dbc9c71e6' and stage_number=1;
   if v_case=8 then delete from public.tbl_stage_results where session_id='0f82561e-c980-44cb-8a5d-091dbc9c71e6' and team_id=v_other and stage_number=1;end if;
  end loop;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_owner,'is_anonymous',false)::text,true);perform set_config('role','authenticated',true);
  v_audit:=public.tbl_teacher_withdraw_answer('0f82561e-c980-44cb-8a5d-091dbc9c71e6',v_team,1,v_original,'2026 ID Block TBL — TEST','撤回 '||v_name||' S1','  QA 誤加入別組  ');
  perform set_config('role','none',true);
  if exists(select 1 from public.tbl_submissions where team_id=v_team and stage_number=1) then raise exception 'Target submission remains';end if;
  if (select coalesce(jsonb_agg(to_jsonb(sub) order by sub.id),'[]'::jsonb) from public.tbl_submissions sub where not(sub.team_id=v_team and sub.stage_number=1)) is distinct from v_others then raise exception 'Other groups or stages changed';end if;
  if not exists(select 1 from public.tbl_answer_corrections where id=v_audit and original_submission=v_original and withdrawn_by=v_owner and reason='QA 誤加入別組' and team_id=v_team and stage_number=1 and withdrawn_at is not null) then raise exception 'Audit incomplete';end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_student,'is_anonymous',true)::text,true);perform set_config('role','authenticated',true);
  perform public.tbl_submit_answer('0f82561e-c980-44cb-8a5d-091dbc9c71e6',1,'B');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_owner,'is_anonymous',false)::text,true);
  v_denied:=false;begin perform public.tbl_teacher_withdraw_answer('0f82561e-c980-44cb-8a5d-091dbc9c71e6',v_team,1,v_original,'2026 ID Block TBL — TEST','撤回 '||v_name||' S1','old screen');
  exception when others then if sqlerrm='Submission changed; refresh the list before withdrawing' then v_denied:=true;else raise;end if;end;
  if not v_denied then raise exception 'Old screen withdrew resubmitted answer';end if;
  perform public.tbl_teacher_reset_with_members('0f82561e-c980-44cb-8a5d-091dbc9c71e6','2026 ID Block TBL — TEST',false);
  v_review:=public.tbl_teacher_answer_review('0f82561e-c980-44cb-8a5d-091dbc9c71e6');
  if jsonb_array_length(v_review->'history')<>0 or not exists(select 1 from jsonb_array_elements(v_review->'archived_history') history where history->>'id'=v_audit::text) then raise exception 'Reset did not archive and clear current history';end if;
  perform set_config('role','none',true);
  select archived_at into v_archive_at from public.tbl_answer_corrections where id=v_audit;
  if v_archive_at is null or not exists(select 1 from public.tbl_answer_corrections where id=v_audit and original_submission=v_original and withdrawn_by=v_owner and reason='QA 誤加入別組') then raise exception 'Archived original audit changed';end if;
  update public.tbl_stages set is_open=true where session_id='0f82561e-c980-44cb-8a5d-091dbc9c71e6' and stage_number=1;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_student,'is_anonymous',true)::text,true);perform set_config('role','authenticated',true);
  perform public.tbl_submit_answer('0f82561e-c980-44cb-8a5d-091dbc9c71e6',1,'C');
  perform set_config('role','none',true);select to_jsonb(sub) into v_expected from public.tbl_submissions sub where team_id=v_team and stage_number=1;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_owner,'is_anonymous',false)::text,true);perform set_config('role','authenticated',true);
  v_second_audit:=public.tbl_teacher_withdraw_answer('0f82561e-c980-44cb-8a5d-091dbc9c71e6',v_team,1,v_expected,'2026 ID Block TBL — TEST','撤回 '||v_name||' S1','new lesson');
  v_review:=public.tbl_teacher_answer_review('0f82561e-c980-44cb-8a5d-091dbc9c71e6');
  if jsonb_array_length(v_review->'history')<>1 or v_review->'history'->0->>'id'<>v_second_audit::text or v_review->'history'->0->>'archived_at' is not null then raise exception 'New lesson audit not separated';end if;
  perform public.tbl_teacher_reset_with_members('0f82561e-c980-44cb-8a5d-091dbc9c71e6','2026 ID Block TBL — TEST',true);
  perform set_config('role','none',true);
  if (select archived_at from public.tbl_answer_corrections where id=v_audit) is distinct from v_archive_at or not exists(select 1 from public.tbl_answer_corrections where id=v_second_audit and archived_at is not null) then raise exception 'Repeated reset changed old archive or missed new audit';end if;
  if pg_temp.withdraw_snapshot(true) is distinct from v_protected then raise exception 'Formal class or unrelated data changed';end if;
  raise exception using errcode='P7777',message='Rollback answer withdrawal QA';
 exception when sqlstate 'P7777' then null;end;
 if pg_temp.withdraw_snapshot(false) is distinct from v_all then raise exception 'Rollback mismatch';end if;
 if has_table_privilege('authenticated','public.tbl_answer_corrections','SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('anon','public.tbl_answer_corrections','SELECT,INSERT,UPDATE,DELETE') then raise exception 'Audit table exposed or mutable';end if;
 if has_function_privilege('anon','public.tbl_teacher_withdraw_answer(uuid,uuid,integer,jsonb,text,text,text)','execute') then raise exception 'Unauthenticated withdrawal privilege exposed';end if;
end;$v$;
rollback;
select 'PASS: withdrawal guards; reset archives current history; originals preserved; new lesson separated; repeated reset stable; formal unchanged; QA rolled back' verification;
