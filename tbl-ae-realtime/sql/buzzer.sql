begin;
create table if not exists public.tbl_buzzer_rounds(
 id uuid primary key default gen_random_uuid(),
 session_id uuid not null references public.tbl_sessions(id),
 round_number integer not null,
 state text not null default 'open' check(state in ('open','claimed','closed')),
 winner_team_id uuid references public.tbl_teams(id),
 claimed_at timestamptz,
 points integer not null default 0 check(points between 0 and 100),
 opened_at timestamptz not null default clock_timestamp(),
 opened_by uuid not null,
 archived_at timestamptz,
 unique(session_id,round_number),
 check((winner_team_id is null and claimed_at is null and points=0) or (winner_team_id is not null and claimed_at is not null)),
 check(state<>'open' or winner_team_id is null)
);
create unique index if not exists tbl_buzzer_one_open on public.tbl_buzzer_rounds(session_id) where state='open';
create table if not exists public.tbl_buzzer_score_log(
 id uuid primary key default gen_random_uuid(),
 round_id uuid not null references public.tbl_buzzer_rounds(id),
 old_points integer not null,
 new_points integer not null,
 reason text not null check(length(reason) between 1 and 500),
 teacher_id uuid not null,
 changed_at timestamptz not null default clock_timestamp()
);
alter table public.tbl_buzzer_rounds enable row level security;
alter table public.tbl_buzzer_score_log enable row level security;
revoke all on public.tbl_buzzer_rounds,public.tbl_buzzer_score_log from public,anon,authenticated;

create or replace function public.tbl_buzzer_status(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $f$
declare v_team uuid;v_teacher boolean;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select exists(select 1 from public.tbl_sessions s where s.id=p_session_id and s.teacher_id=auth.uid() and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)) into v_teacher;
 select m.team_id into v_team from public.tbl_team_members m where m.session_id=p_session_id and m.user_id=auth.uid();
 if not v_teacher and (v_team is null or not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)) then raise exception 'Class access denied';end if;
 return jsonb_build_object(
  'my_team_id',v_team,
  'rounds',coalesce((select jsonb_agg(to_jsonb(q) order by q.round_number desc) from(
   select r.id,r.round_number,r.state,r.winner_team_id,t.team_name as winner_name,r.points,r.opened_at,r.claimed_at
   from public.tbl_buzzer_rounds r left join public.tbl_teams t on t.id=r.winner_team_id
   where r.session_id=p_session_id and r.archived_at is null order by r.round_number desc limit 30)q),'[]'::jsonb),
  'totals',coalesce((select jsonb_agg(to_jsonb(q) order by q.team_number) from(
   select t.id as team_id,t.team_number,t.team_name,coalesce(sum(r.points),0) as points
   from public.tbl_teams t left join public.tbl_buzzer_rounds r on r.winner_team_id=t.id and r.session_id=p_session_id and r.archived_at is null
   where t.session_id=p_session_id group by t.id,t.team_number,t.team_name)q),'[]'::jsonb),
  'score_log',case when v_teacher then coalesce((select jsonb_agg(to_jsonb(q) order by q.changed_at desc) from(
   select l.*,r.round_number from public.tbl_buzzer_score_log l join public.tbl_buzzer_rounds r on r.id=l.round_id
   where r.session_id=p_session_id and r.archived_at is null order by l.changed_at desc,l.id limit 100)q),'[]'::jsonb) else '[]'::jsonb end
 );
end;$f$;

create or replace function public.tbl_teacher_buzzer(p_session_id uuid,p_action text,p_round_id uuid default null,p_points integer default null,p_reason text default null,p_expected_points integer default null)
returns uuid language plpgsql security definer set search_path='' as $f$
declare v_round public.tbl_buzzer_rounds%rowtype;v_id uuid;v_number integer;
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Teacher authentication required';end if;
 perform 1 from public.tbl_sessions s where s.id=p_session_id and s.teacher_id=auth.uid() for update;
 if not found then raise exception 'Teacher access denied';end if;
 if p_action='start' then
  if exists(select 1 from public.tbl_buzzer_rounds r where r.session_id=p_session_id and r.state='open' and r.archived_at is null) then raise exception 'A buzzer round is already open';end if;
  update public.tbl_buzzer_rounds set state='closed' where session_id=p_session_id and state='claimed' and archived_at is null;
  select coalesce(max(r.round_number),0)+1 into v_number from public.tbl_buzzer_rounds r where r.session_id=p_session_id;
  insert into public.tbl_buzzer_rounds(session_id,round_number,opened_by) values(p_session_id,v_number,auth.uid()) returning id into v_id;
  return v_id;
 end if;
 select r.* into v_round from public.tbl_buzzer_rounds r where r.id=p_round_id and r.session_id=p_session_id and r.archived_at is null for update;
 if not found then raise exception 'Round not found or archived';end if;
 if p_action='close' then
  update public.tbl_buzzer_rounds set state='closed' where id=v_round.id;
 elsif p_action='score' then
  if v_round.winner_team_id is null then raise exception 'No winner to score';end if;
  if p_points is null or p_points not between 0 and 100 then raise exception 'Points must be 0-100';end if;
  if p_expected_points is distinct from v_round.points then raise exception 'Score changed; refresh before retrying';end if;
  if p_reason is null or length(btrim(p_reason)) not between 1 and 500 then raise exception 'Scoring reason required';end if;
  if p_points<>v_round.points then
   insert into public.tbl_buzzer_score_log(round_id,old_points,new_points,reason,teacher_id) values(v_round.id,v_round.points,p_points,btrim(p_reason),auth.uid());
   update public.tbl_buzzer_rounds set points=p_points where id=v_round.id;
  end if;
 else raise exception 'Invalid action';end if;
 return v_round.id;
end;$f$;

create or replace function public.tbl_student_buzz(p_session_id uuid,p_round_id uuid)
returns boolean language plpgsql security definer set search_path='' as $f$
declare v_team uuid;v_round public.tbl_buzzer_rounds%rowtype;
begin
 if auth.uid() is null or not coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Student authentication required';end if;
 select m.team_id into v_team from public.tbl_team_members m where m.session_id=p_session_id and m.user_id=auth.uid() for update;
 if v_team is null then raise exception 'Team membership not found';end if;
 select r.* into v_round from public.tbl_buzzer_rounds r where r.id=p_round_id and r.session_id=p_session_id and r.archived_at is null for update;
 if not found then raise exception 'Round not found or archived';end if;
 if v_round.state<>'open' then return coalesce(v_round.winner_team_id=v_team,false);end if;
 update public.tbl_buzzer_rounds set state='claimed',winner_team_id=v_team,claimed_at=clock_timestamp() where id=v_round.id;
 return true;
end;$f$;
revoke all on function public.tbl_buzzer_status(uuid),public.tbl_teacher_buzzer(uuid,text,uuid,integer,text,integer),public.tbl_student_buzz(uuid,uuid) from public,anon;
grant execute on function public.tbl_buzzer_status(uuid),public.tbl_teacher_buzzer(uuid,text,uuid,integer,text,integer),public.tbl_student_buzz(uuid,uuid) to authenticated;

-- Keep the existing reset contract; archive buzzer rounds in the same transaction.
create or replace function public.tbl_teacher_reset_session(p_session_id uuid,p_confirm_title text)
returns void language plpgsql security definer set search_path='' as $f$
declare v_title text;
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Teacher authentication required';end if;
 select title into v_title from public.tbl_sessions where id=p_session_id and teacher_id=auth.uid() for update;
 if not found then raise exception 'Teacher access denied';end if;
 if p_confirm_title is distinct from v_title then raise exception 'Class title confirmation does not match';end if;
 perform 1 from public.tbl_stages where session_id=p_session_id order by stage_number for update;
 delete from public.tbl_stage_results where session_id=p_session_id;
 delete from public.tbl_submissions where session_id=p_session_id;
 update public.tbl_stages set is_open=false,is_locked=false,is_revealed=false where session_id=p_session_id;
 update public.tbl_sessions set active_stage=1 where id=p_session_id;
 update public.tbl_answer_corrections set archived_at=clock_timestamp() where session_id=p_session_id and archived_at is null;
 update public.tbl_buzzer_rounds set state='closed',archived_at=clock_timestamp() where session_id=p_session_id and archived_at is null;
end;$f$;
revoke all on function public.tbl_teacher_reset_session(uuid,text) from public,anon;
grant execute on function public.tbl_teacher_reset_session(uuid,text) to authenticated;
commit;
