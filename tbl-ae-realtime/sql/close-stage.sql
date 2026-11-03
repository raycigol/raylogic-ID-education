-- Repeatable; installation does not modify classroom rows or existing RPCs.
begin;
set local lock_timeout='5s';
create or replace function public.tbl_teacher_close_stage(p_session_id uuid,p_stage integer)
returns void language plpgsql security definer set search_path='' as $f$
declare v_stage public.tbl_stages%rowtype;
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
 or not exists(select 1 from public.tbl_sessions s where s.id=p_session_id and s.teacher_id=auth.uid()) then
  raise exception 'Teacher access denied';
 end if;
 select * into v_stage from public.tbl_stages where session_id=p_session_id and stage_number=p_stage for update;
 if not found then raise exception 'Stage not found';end if;
 if v_stage.is_locked or v_stage.is_revealed then raise exception 'Locked or published stage cannot close';end if;
 -- Serializes with tbl_submit_answer. Preserve answers, scores and active_stage;
 -- active_stage remains the current stage, while is_open gates student writes.
 update public.tbl_stages set is_open=false where session_id=p_session_id and stage_number=p_stage;
end;$f$;
revoke all on function public.tbl_teacher_close_stage(uuid,integer) from public,anon;
grant execute on function public.tbl_teacher_close_stage(uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;
