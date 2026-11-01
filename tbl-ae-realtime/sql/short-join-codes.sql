begin;
create table if not exists public.tbl_team_short_codes(
 code text primary key check(code ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$'),
 team_id uuid not null references public.tbl_teams(id) on delete cascade,
 is_active boolean not null default true,
 created_at timestamptz not null default now()
);
create unique index if not exists tbl_team_short_codes_active_team on public.tbl_team_short_codes(team_id) where is_active;
alter table public.tbl_team_short_codes enable row level security;
revoke all on public.tbl_team_short_codes from public,anon,authenticated;
create table if not exists public.tbl_join_attempts(
 user_id uuid primary key references auth.users(id) on delete cascade,
 window_start timestamptz not null,
 attempts integer not null
);
alter table public.tbl_join_attempts enable row level security;
revoke all on public.tbl_join_attempts from public,anon,authenticated;

create or replace function public.tbl_new_short_code()
returns text language plpgsql volatile set search_path='' as $function$
declare
 v_alphabet text:='23456789ABCDEFGHJKMNPQRSTUVWXYZ';
 v_code text:='';
 v_byte integer;
begin
 while length(v_code)<6 loop
  v_byte:=get_byte(decode(replace(gen_random_uuid()::text,'-',''),'hex'),0);
  if v_byte < (256/length(v_alphabet))*length(v_alphabet) then
   v_code:=v_code||substr(v_alphabet,(v_byte%length(v_alphabet))+1,1);
  end if;
 end loop;
 return v_code;
end;
$function$;
revoke all on function public.tbl_new_short_code() from public,anon,authenticated;

create or replace function public.tbl_teacher_join_codes(p_session_id uuid,p_rotate_team uuid default null)
returns table(team_id uuid,team_number integer,team_name text,short_code text)
language plpgsql security definer set search_path='' as $function$
declare
 v_team record;
 v_code text;
 v_retry integer;
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Teacher authentication required'; end if;
 perform 1 from public.tbl_sessions s where s.id=p_session_id and s.teacher_id=auth.uid() for share;
 if not found then raise exception 'Teacher access denied'; end if;
 if p_rotate_team is not null and not exists(select 1 from public.tbl_teams t join public.tbl_team_invites i on i.team_id=t.id where t.id=p_rotate_team and t.session_id=p_session_id) then raise exception 'Team does not belong to this session'; end if;
 for v_team in select t.id from public.tbl_teams t join public.tbl_team_invites i on i.team_id=t.id where t.session_id=p_session_id order by t.team_number for update of i loop
  if v_team.id=p_rotate_team or not exists(select 1 from public.tbl_team_short_codes c where c.team_id=v_team.id and c.is_active) then
   update public.tbl_team_short_codes c set is_active=false where c.team_id=v_team.id and c.is_active;
   v_retry:=0;
   loop
    v_retry:=v_retry+1;
    if v_retry>30 then raise exception 'Unable to generate a unique join code'; end if;
    v_code:=public.tbl_new_short_code();
    begin
     insert into public.tbl_team_short_codes(code,team_id) values(v_code,v_team.id);
     exit;
    exception when unique_violation then null;
    end;
   end loop;
  end if;
 end loop;
 return query select t.id,t.team_number,t.team_name,c.code from public.tbl_teams t join public.tbl_team_short_codes c on c.team_id=t.id and c.is_active where t.session_id=p_session_id order by t.team_number;
end;
$function$;
revoke all on function public.tbl_teacher_join_codes(uuid,uuid) from public,anon;
grant execute on function public.tbl_teacher_join_codes(uuid,uuid) to authenticated;

create or replace function public.tbl_join_with_code(p_code text)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
 v_user uuid:=auth.uid();
 v_code text:=upper(btrim(coalesce(p_code,'')));
 v_attempts integer;
 v_now timestamptz:=clock_timestamp();
 v_team record;
 v_error text;
begin
 if v_user is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) is not true then raise exception 'Anonymous student sign-in required'; end if;
 insert into public.tbl_join_attempts as attempt(user_id,window_start,attempts) values(v_user,v_now,1)
 on conflict(user_id) do update set
  attempts=case when attempt.window_start<=v_now-interval '1 minute' then 1 else least(attempt.attempts+1,1000) end,
  window_start=case when attempt.window_start<=v_now-interval '1 minute' then v_now else attempt.window_start end
 returning attempts into v_attempts;
 if v_attempts>5 then return jsonb_build_object('ok',false,'message','嘗試次數過多，請稍候 1 分鐘再試。'); end if;
 if v_code ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$' then
  select t.id,t.session_id,t.team_name,s.title,i.join_code into v_team
  from public.tbl_team_short_codes c join public.tbl_team_invites i on i.team_id=c.team_id
  join public.tbl_teams t on t.id=i.team_id join public.tbl_sessions s on s.id=t.session_id
  where c.code=v_code and c.is_active for update of i;
  if not found then return jsonb_build_object('ok',false,'message','加入碼無效或已更新，請向教師確認。'); end if;
  if not exists(select 1 from public.tbl_team_short_codes c where c.code=v_code and c.is_active) then
   return jsonb_build_object('ok',false,'message','加入碼無效或已更新，請向教師確認。');
  end if;
 elsif v_code ~ '^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$' then
  select t.id,t.session_id,t.team_name,s.title,i.join_code into v_team from public.tbl_team_invites i
  join public.tbl_teams t on t.id=i.team_id join public.tbl_sessions s on s.id=t.session_id
  where i.join_code=v_code::uuid for update of i;
  if not found then return jsonb_build_object('ok',false,'message','加入碼無效或已更新，請向教師確認。'); end if;
 else
  return jsonb_build_object('ok',false,'message','請輸入 6 碼加入碼或完整 UUID 代碼。');
 end if;
 begin
  perform public.tbl_join_team(v_team.join_code);
 exception when others then
  v_error:=case sqlerrm
   when 'Team already registered' then '此組已有代表加入，請確認組別或聯絡教師。'
   when 'Already registered in another team' then '你已加入其他組別，請先離開組別再使用正確代碼。'
   else '加入失敗，請確認代碼或聯絡教師。' end;
  return jsonb_build_object('ok',false,'message',v_error);
 end;
 return jsonb_build_object('ok',true,'session_id',v_team.session_id,'team_name',v_team.team_name,'title',v_team.title);
end;
$function$;
revoke all on function public.tbl_join_with_code(text) from public,anon;
grant execute on function public.tbl_join_with_code(text) to authenticated;
commit;
