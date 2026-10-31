begin;
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
end;
$function$;
revoke all on function public.tbl_teacher_reset_session(uuid,text) from public,anon;
grant execute on function public.tbl_teacher_reset_session(uuid,text) to authenticated;
commit;
