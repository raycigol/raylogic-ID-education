-- Additive, repeatable migration. Does not update classroom answers, scores or stages.
begin;
set local lock_timeout='5s';
create table if not exists public.tbl_session_timers(
 session_id uuid primary key references public.tbl_sessions(id),
 stage_number integer not null check(stage_number between 1 and 4),
 phase text not null check(phase in ('discussion','submission')),
 state text not null check(state in ('running','paused','idle')),
 remaining_seconds integer not null check(remaining_seconds between 0 and 7200),
 ends_at timestamptz,
 revision bigint not null default 1,
 check((state='running')=(ends_at is not null))
);
alter table public.tbl_session_timers enable row level security;
revoke all on public.tbl_session_timers from public,anon,authenticated;

create or replace function public.tbl_timer_status(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not (
 exists(select 1 from public.tbl_sessions where id=p_session_id and teacher_id=auth.uid() and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false))
 or exists(select 1 from public.tbl_team_members where session_id=p_session_id and user_id=auth.uid() and coalesce((auth.jwt()->>'is_anonymous')::boolean,false))) then
 raise exception 'Class access denied';end if;
 return jsonb_build_object('server_now',clock_timestamp(),'timer',(select to_jsonb(t) from public.tbl_session_timers t where session_id=p_session_id));
end;$$;

create or replace function public.tbl_teacher_timer(p_session_id uuid,p_action text,p_stage integer default null,p_phase text default null,p_seconds integer default null,p_revision bigint default 0)
returns void language plpgsql security definer set search_path='' as $$
declare t public.tbl_session_timers%rowtype; n integer; v_now timestamptz:=clock_timestamp();
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Teacher authentication required';end if;
 perform 1 from public.tbl_sessions where id=p_session_id and teacher_id=auth.uid() for update;
 if not found then raise exception 'Teacher access denied';end if;
 select * into t from public.tbl_session_timers where session_id=p_session_id for update;
 if coalesce(t.revision,0) is distinct from p_revision then raise exception 'Timer changed; refresh before retrying';end if;
 if p_action='start' then
  if p_stage is null or p_phase is null or p_seconds is null or p_phase not in ('discussion','submission') or p_seconds not between 1 and 7200 then raise exception 'Invalid timer settings';end if;
  perform 1 from public.tbl_stages where session_id=p_session_id and stage_number=p_stage and is_open and not is_locked and not is_revealed for update;
  if not found then raise exception 'Open an unlocked stage before starting timer';end if;
  insert into public.tbl_session_timers as existing(session_id,stage_number,phase,state,remaining_seconds,ends_at)
  values(p_session_id,p_stage,p_phase,'running',p_seconds,v_now+make_interval(secs=>p_seconds))
  on conflict(session_id) do update set stage_number=excluded.stage_number,phase=excluded.phase,state='running',remaining_seconds=excluded.remaining_seconds,ends_at=excluded.ends_at,revision=existing.revision+1;
  return;
 end if;
 if t.session_id is null then raise exception 'No timer';end if;
 n:=case when t.state='running' then greatest(0,ceil(extract(epoch from t.ends_at-v_now))::integer) else t.remaining_seconds end;
 if p_action='pause' then
  if t.state<>'running' then raise exception 'Timer is not running';end if;
  update public.tbl_session_timers set state='paused',remaining_seconds=n,ends_at=null,revision=revision+1 where session_id=p_session_id;
 elsif p_action='resume' then
  if t.state<>'paused' or n=0 then raise exception 'No paused time remaining';end if;
  perform 1 from public.tbl_stages where session_id=p_session_id and stage_number=t.stage_number and is_open and not is_locked and not is_revealed for update;
  if not found then raise exception 'Stage is not open';end if;
  update public.tbl_session_timers set state='running',ends_at=v_now+make_interval(secs=>n),revision=revision+1 where session_id=p_session_id;
 elsif p_action='add' then
  if t.state='idle' or p_seconds is null or p_seconds not in (-60,60) then raise exception 'Invalid adjustment';end if;
  n:=greatest(0,least(7200,n+p_seconds));
  update public.tbl_session_timers set remaining_seconds=n,ends_at=case when state='running' then v_now+make_interval(secs=>n) end,revision=revision+1 where session_id=p_session_id;
 elsif p_action='stop' then
  update public.tbl_session_timers set state='idle',ends_at=null,remaining_seconds=0,revision=revision+1 where session_id=p_session_id;
 else raise exception 'Invalid timer action';end if;
end;$$;

-- Closing a stage pauses its timer; locking/publishing stops its display.
create or replace function public.tbl_timer_stage_change()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.is_locked or new.is_revealed then
  update public.tbl_session_timers set state='idle',ends_at=null,remaining_seconds=0,revision=revision+1 where session_id=new.session_id and stage_number=new.stage_number and state<>'idle';
 elsif not new.is_open and old.is_open then
  update public.tbl_session_timers set state='paused',remaining_seconds=greatest(0,ceil(extract(epoch from ends_at-clock_timestamp()))::integer),ends_at=null,revision=revision+1 where session_id=new.session_id and stage_number=new.stage_number and state='running';
 end if;
 return new;
end;$$;
drop trigger if exists tbl_timer_stage_change on public.tbl_stages;
create trigger tbl_timer_stage_change after update of is_open,is_locked,is_revealed on public.tbl_stages for each row execute function public.tbl_timer_stage_change();
create or replace function public.tbl_timer_session_reset()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.active_stage=1 and not exists(select 1 from public.tbl_stages where session_id=new.id and (is_open or is_locked or is_revealed)) then
  update public.tbl_session_timers set state='idle',ends_at=null,remaining_seconds=0,revision=revision+1 where session_id=new.id and state<>'idle';
 end if;
 return new;
end;$$;
drop trigger if exists tbl_timer_session_reset on public.tbl_sessions;
create trigger tbl_timer_session_reset after update of active_stage on public.tbl_sessions for each row execute function public.tbl_timer_session_reset();
revoke all on function public.tbl_timer_session_reset() from public,anon,authenticated;
revoke all on function public.tbl_timer_stage_change() from public,anon,authenticated;
revoke all on function public.tbl_timer_status(uuid),public.tbl_teacher_timer(uuid,text,integer,text,integer,bigint) from public,anon;
grant execute on function public.tbl_timer_status(uuid),public.tbl_teacher_timer(uuid,text,integer,text,integer,bigint) to authenticated;
notify pgrst,'reload schema';
commit;
