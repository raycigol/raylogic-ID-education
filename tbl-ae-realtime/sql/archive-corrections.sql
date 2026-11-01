begin;
alter table public.tbl_answer_corrections add column if not exists archived_at timestamptz;
create or replace function public.tbl_teacher_reset_session(p_session_id uuid, p_confirm_title text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
 v_title text;
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
  raise exception 'Teacher authentication required';
 end if;
 select title into v_title from public.tbl_sessions
 where id=p_session_id and teacher_id=auth.uid() for update;
 if not found then raise exception 'Teacher access denied'; end if;
 if p_confirm_title is distinct from v_title then raise exception 'Class title confirmation does not match'; end if;
 perform 1 from public.tbl_stages where session_id=p_session_id order by stage_number for update;
 delete from public.tbl_stage_results where session_id=p_session_id;
 delete from public.tbl_submissions where session_id=p_session_id;
 update public.tbl_stages set is_open=false,is_locked=false,is_revealed=false where session_id=p_session_id;
 update public.tbl_sessions set active_stage=1 where id=p_session_id;
 update public.tbl_answer_corrections set archived_at=clock_timestamp() where session_id=p_session_id and archived_at is null;
end;
$function$;
revoke all on function public.tbl_teacher_reset_session(uuid,text) from public,anon;
grant execute on function public.tbl_teacher_reset_session(uuid,text) to authenticated;

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


commit;

