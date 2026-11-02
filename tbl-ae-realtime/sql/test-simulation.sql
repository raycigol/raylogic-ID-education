-- Requires session-participation.sql. Normally install the complete migration instead.
begin;
create or replace function public.tbl_teacher_simulate_test_submissions(p_session_id uuid, p_stage integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
 v_user uuid := auth.uid();
 v_stage public.tbl_stages%rowtype;
 v_inserted integer;
begin
 if p_session_id is distinct from '0f82561e-c980-44cb-8a5d-091dbc9c71e6'::uuid then
  raise exception 'Simulation is restricted to the designated TEST session';
 end if;
 if v_user is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
  raise exception 'Teacher authentication required';
 end if;
 perform 1 from public.tbl_sessions
 where id = p_session_id and title = '2026 ID Block TBL — TEST' and teacher_id = v_user
 for share;
 if not found then raise exception 'TEST teacher access denied'; end if;
 select * into v_stage from public.tbl_stages
 where session_id = p_session_id and stage_number = p_stage for update;
 if not found then raise exception 'Stage not found'; end if;
 if v_stage.is_open is not true or v_stage.is_locked is distinct from false or v_stage.is_revealed is distinct from false then
  raise exception 'Stage is closed or locked';
 end if;
 if not exists(select 1 from public.tbl_active_team_ids(p_session_id)) then raise exception 'No active teams';end if;
 insert into public.tbl_submissions(session_id, team_id, stage_number, answer, submitted_by)
 select p_session_id, team.id, p_stage, 'A', v_user
 from public.tbl_teams team where team.session_id = p_session_id and team.id in(select public.tbl_active_team_ids(p_session_id))
 on conflict (session_id, team_id, stage_number) do nothing;
 get diagnostics v_inserted = row_count;
 return v_inserted;
end;
$function$;
revoke all on function public.tbl_teacher_simulate_test_submissions(uuid, integer) from public, anon;
grant execute on function public.tbl_teacher_simulate_test_submissions(uuid, integer) to authenticated;



commit;
