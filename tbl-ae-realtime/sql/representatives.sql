begin;
create or replace function public.tbl_teacher_representatives(p_session_id uuid)
returns table(team_id uuid,team_number integer,team_name text,member_ids uuid[],submitted_stages integer[])
language plpgsql security definer set search_path='' as $f$
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Teacher authentication required';end if;
 if not exists(select 1 from public.tbl_sessions s where s.id=p_session_id and s.teacher_id=auth.uid()) then raise exception 'Teacher access denied';end if;
 return query select t.id,t.team_number,t.team_name,
  array(select m.user_id from public.tbl_team_members m where m.session_id=p_session_id and m.team_id=t.id order by m.user_id),
  array(select distinct sub.stage_number from public.tbl_submissions sub where sub.session_id=p_session_id and sub.team_id=t.id order by sub.stage_number)
 from public.tbl_teams t where t.session_id=p_session_id order by t.team_number;
end;$f$;
revoke all on function public.tbl_teacher_representatives(uuid) from public,anon;
grant execute on function public.tbl_teacher_representatives(uuid) to authenticated;

create or replace function public.tbl_teacher_release_representative(p_session_id uuid,p_team_id uuid,p_confirm_title text,p_expected_members uuid[],p_rotate_code boolean default false)
returns integer language plpgsql security definer set search_path='' as $f$
declare v_title text;v_members uuid[];v_released integer;
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Teacher authentication required';end if;
 select s.title into v_title from public.tbl_sessions s where s.id=p_session_id and s.teacher_id=auth.uid() for share;
 if not found then raise exception 'Teacher access denied';end if;
 if p_confirm_title is distinct from v_title then raise exception 'Class title confirmation does not match';end if;
 perform 1 from public.tbl_team_invites i join public.tbl_teams t on t.id=i.team_id where t.id=p_team_id and t.session_id=p_session_id for update of i;
 if not found then raise exception 'Team does not belong to this session';end if;
 perform 1 from public.tbl_team_members m where m.session_id=p_session_id and m.team_id=p_team_id order by m.user_id for update;
 select array(select m.user_id from public.tbl_team_members m where m.session_id=p_session_id and m.team_id=p_team_id order by m.user_id) into v_members;
 if p_expected_members is distinct from v_members then raise exception 'Representative changed; refresh the list before retrying';end if;
 delete from public.tbl_team_members m where m.session_id=p_session_id and m.team_id=p_team_id;
 get diagnostics v_released=row_count;
 if p_rotate_code then perform public.tbl_teacher_join_codes(p_session_id,p_team_id);end if;
 return v_released;
end;$f$;
revoke all on function public.tbl_teacher_release_representative(uuid,uuid,text,uuid[],boolean) from public,anon;
grant execute on function public.tbl_teacher_release_representative(uuid,uuid,text,uuid[],boolean) to authenticated;

create or replace function public.tbl_teacher_reset_with_members(p_session_id uuid,p_confirm_title text,p_clear_members boolean default false)
returns void language plpgsql security definer set search_path='' as $f$
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Teacher authentication required';end if;
 if not exists(select 1 from public.tbl_sessions s where s.id=p_session_id and s.teacher_id=auth.uid() and s.title=p_confirm_title) then raise exception 'Teacher access or title confirmation denied';end if;
 if p_clear_members then
  perform 1 from public.tbl_team_invites i join public.tbl_teams t on t.id=i.team_id where t.session_id=p_session_id order by t.id for update of i;
  delete from public.tbl_team_members m where m.session_id=p_session_id;
 end if;
 perform public.tbl_teacher_reset_session(p_session_id,p_confirm_title);
end;$f$;
revoke all on function public.tbl_teacher_reset_with_members(uuid,text,boolean) from public,anon;
grant execute on function public.tbl_teacher_reset_with_members(uuid,text,boolean) to authenticated;

create or replace function public.tbl_submit_answer(p_session_id uuid,p_stage integer,p_answer text)
returns table(accepted_answer text,accepted_at timestamptz)
language plpgsql security definer set search_path='' as $f$
declare v_user uuid:=auth.uid();v_team_id uuid;v_stage public.tbl_stages%rowtype;
begin
 if v_user is null then raise exception 'Authentication required';end if;
 if coalesce((auth.jwt()->>'is_anonymous')::boolean,false) is not true then raise exception 'Student authentication required';end if;
 select m.team_id into v_team_id from public.tbl_team_members m where m.session_id=p_session_id and m.user_id=v_user for update;
 if v_team_id is null then raise exception 'Team membership not found';end if;
 if p_answer is null or p_answer not in ('A','B','C','D','E') then raise exception 'Invalid answer';end if;
 select st.* into v_stage from public.tbl_stages st where st.session_id=p_session_id and st.stage_number=p_stage for update;
 if not found then raise exception 'Stage not found';end if;
 if v_stage.is_open is not true or v_stage.is_locked is true or v_stage.is_revealed is true then raise exception 'Stage is closed or locked';end if;
 insert into public.tbl_submissions(session_id,team_id,stage_number,answer,submitted_by,submitted_at)
 values(p_session_id,v_team_id,p_stage,p_answer,v_user,now())
 on conflict(session_id,team_id,stage_number) do update set answer=excluded.answer,submitted_by=excluded.submitted_by,submitted_at=excluded.submitted_at;
 return query select p_answer,sub.submitted_at from public.tbl_submissions sub where sub.session_id=p_session_id and sub.team_id=v_team_id and sub.stage_number=p_stage;
end;$f$;
commit;
