-- =====================================================================
--  PWS 포털 — 캘린더 구독 (구글 캘린더 / 애플 캘린더 자동 동기화)
--  schema.sql 을 실행한 뒤, 이 파일을 SQL Editor 에서 한 번 실행하세요.
-- =====================================================================
--  회원마다 비밀 구독 주소가 하나씩 생깁니다. 주소를 아는 사람만 일정을 볼 수 있고,
--  회원이 정지·삭제되면 그 주소는 바로 빈 캘린더가 됩니다.

create table if not exists public.calendar_tokens (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  token      uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table public.calendar_tokens enable row level security;   -- 정책 없음 = 아래 함수로만 접근
revoke all on public.calendar_tokens from anon, authenticated;

-- 내 구독 토큰 가져오기 (없으면 생성, p_reset = true 면 새로 발급 → 기존 주소 무효)
create or replace function public.my_calendar_token(p_reset boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare tok uuid;
begin
  if not public.is_approved() then raise exception 'forbidden'; end if;
  if p_reset then
    insert into calendar_tokens (user_id) values (auth.uid())
    on conflict (user_id) do update set token = gen_random_uuid(), created_at = now();
  else
    insert into calendar_tokens (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  end if;
  select token into tok from calendar_tokens where user_id = auth.uid();
  return tok;
end $$;

-- 구독 주소용 일정 목록 (로그인 없이 토큰으로만 조회. 해외선수 정보는 포함되지 않음)
create or replace function public.calendar_feed(p_token uuid)
returns table (id uuid, title text, description text, type public.event_type,
               starts_at timestamptz, ends_at timestamptz, location text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, e.title, e.description, e.type, e.starts_at, e.ends_at, e.location, e.updated_at
  from events e
  where exists (select 1 from calendar_tokens t join profiles p on p.id = t.user_id
                where t.token = p_token and p.status = 'approved')
    and e.starts_at > now() - interval '90 days'
  order by e.starts_at
$$;

revoke all on function public.my_calendar_token(boolean) from public, anon;
grant execute on function public.my_calendar_token(boolean) to authenticated;
grant execute on function public.calendar_feed(uuid) to anon, authenticated;
