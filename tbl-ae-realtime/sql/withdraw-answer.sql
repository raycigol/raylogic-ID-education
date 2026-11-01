begin;
create table if not exists public.tbl_answer_corrections(
 id uuid primary key default gen_random_uuid(),
 session_id uuid not null,
 team_id uuid not null,
 stage_number integer not null check(stage_number between 1 and 4),
 session_title text not null,
 team_name text not null,
 original_submission jsonb not null,
 reason text not null check(length(btrim(reason)) between 1 and 500),
 withdrawn_by uuid not null,
 withdrawn_at timestamptz not null default clock_timestamp(),
 archived_at timestamptz
);
alter table public.tbl_answer_corrections add column if not exists archived_at timestamptz;
create index if not exists tbl_answer_corrections_session_time on public.tbl_answer_corrections(session_id,withdrawn_at desc);
alter table public.tbl_answer_corrections enable row level security;
revoke all on public.tbl_answer_corrections from public,anon,authenticated;

create or replace function public.tbl_teacher_answer_review(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $f$
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Teacher authentication required';end if;
 if not exists(select 1 from public.tbl_sessions s where s.id=p_session_id and s.teacher_id=auth.uid()) then raise exception 'Teacher access denied';end if;
 return jsonb_build_object(
  'submissions',coalesce((select jsonb_agg(jsonb_build_object('submission',to_jsonb(sub),'team_name',t.team_name,'is_locked',st.is_locked,'is_revealed',st.is_revealed,'has_scores',exists(select 1 from public.tbl_stage_results r where r.session_id=sub.session_id and r.stage_number=sub.stage_number)) order by t.team_number,sub.stage_number)
   from public.tbl_submissions sub join public.tbl_teams t on t.id=sub.team_id and t.session_id=sub.session_id
   join public.tbl_stages st on st.session_id=sub.session_id and st.stage_number=sub.stage_number where sub.session_id=p_session_id),'[]'::jsonb),
  'history',coalesce((select jsonb_agg(to_jsonb(recent) order by recent.withdrawn_at desc,recent.id) from
   (select * from public.tbl_answer_corrections c where c.session_id=p_session_id and c.archived_at is null order by c.withdrawn_at desc,c.id limit 100) recent),'[]'::jsonb),
  'archived_history',coalesce((select jsonb_agg(to_jsonb(recent) order by recent.archived_at desc,recent.withdrawn_at desc,recent.id) from
   (select * from public.tbl_answer_corrections c where c.session_id=p_session_id and c.archived_at is not null order by c.archived_at desc,c.withdrawn_at desc,c.id limit 100) recent),'[]'::jsonb)
 );
end;$f$;
revoke all on function public.tbl_teacher_answer_review(uuid) from public,anon;
grant execute on function public.tbl_teacher_answer_review(uuid) to authenticated;

create or replace function public.tbl_teacher_withdraw_answer(p_session_id uuid,p_team_id uuid,p_stage integer,p_expected_submission jsonb,p_confirm_title text,p_confirm_text text,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $f$
declare v_title text;v_team_name text;v_stage public.tbl_stages%rowtype;v_submission public.tbl_submissions%rowtype;v_audit uuid;
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Teacher authentication required';end if;
 select s.title into v_title from public.tbl_sessions s where s.id=p_session_id and s.teacher_id=auth.uid();
 if not found then raise exception 'Teacher access denied';end if;
 if p_confirm_title is distinct from v_title then raise exception 'Class title confirmation does not match';end if;
 select t.team_name into v_team_name from public.tbl_teams t where t.id=p_team_id and t.session_id=p_session_id;
 if not found then raise exception 'Team does not belong to this session';end if;
 if p_confirm_text is distinct from '撤回 '||v_team_name||' S'||p_stage then raise exception 'Withdrawal confirmation does not match';end if;
 if p_reason is null or length(btrim(p_reason)) not between 1 and 500 then raise exception 'A reason of 1 to 500 characters is required';end if;
 select st.* into v_stage from public.tbl_stages st where st.session_id=p_session_id and st.stage_number=p_stage for update;
 if not found then raise exception 'Stage not found';end if;
 if v_stage.is_locked is distinct from false or v_stage.is_revealed is distinct from false then raise exception 'Locked or published stage cannot be withdrawn';end if;
 if exists(select 1 from public.tbl_stage_results r where r.session_id=p_session_id and r.stage_number=p_stage) then raise exception 'Stage already has scores; withdrawal denied';end if;
 select sub.* into v_submission from public.tbl_submissions sub where sub.session_id=p_session_id and sub.team_id=p_team_id and sub.stage_number=p_stage for update;
 if not found then raise exception 'Submission no longer exists; refresh the list';end if;
 if p_expected_submission is distinct from to_jsonb(v_submission) then raise exception 'Submission changed; refresh the list before withdrawing';end if;
 insert into public.tbl_answer_corrections(session_id,team_id,stage_number,session_title,team_name,original_submission,reason,withdrawn_by)
 values(p_session_id,p_team_id,p_stage,v_title,v_team_name,to_jsonb(v_submission),btrim(p_reason),auth.uid()) returning id into v_audit;
 delete from public.tbl_submissions sub where sub.id=v_submission.id and sub.session_id=p_session_id and sub.team_id=p_team_id and sub.stage_number=p_stage;
 return v_audit;
end;$f$;
revoke all on function public.tbl_teacher_withdraw_answer(uuid,uuid,integer,jsonb,text,text,text) from public,anon;
grant execute on function public.tbl_teacher_withdraw_answer(uuid,uuid,integer,jsonb,text,text,text) to authenticated;
commit;
