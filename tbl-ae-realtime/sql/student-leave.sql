-- Repeatable, additive migration. Installing this changes no classroom rows.
begin;
set local lock_timeout='5s';
create or replace function public.tbl_student_leave_session(p_session_id uuid,p_expected_team_number integer)
returns integer language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_team uuid;v_current uuid;v_number integer;v_count integer;
begin
 if v_user is null or not coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Student authentication required';end if;
 if p_session_id is null or p_expected_team_number is null or p_expected_team_number<1 then raise exception 'Session and expected team required';end if;
 select team_id into v_team from public.tbl_team_members where session_id=p_session_id and user_id=v_user;
 if not found then return 0;end if;
 -- Same lock order as joining and teacher representative release.
 perform 1 from public.tbl_team_invites where team_id=v_team for update;
 if not found then raise exception 'Team invite unavailable; contact teacher';end if;
 select m.team_id,t.team_number into v_current,v_number from public.tbl_team_members m
 join public.tbl_teams t on t.id=m.team_id and t.session_id=m.session_id
 where m.session_id=p_session_id and m.user_id=v_user for update of m;
 if not found then return 0;end if;
 if v_current<>v_team or v_number<>p_expected_team_number then raise exception 'Representative changed; refresh before leaving';end if;
 -- Only the caller's membership. Never touch submissions, results, codes or other representatives.
 delete from public.tbl_team_members where session_id=p_session_id and user_id=v_user and team_id=v_team;
 get diagnostics v_count=row_count;
 return v_count;
end;$$;
revoke all on function public.tbl_student_leave_session(uuid,integer) from public,anon;
grant execute on function public.tbl_student_leave_session(uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;
