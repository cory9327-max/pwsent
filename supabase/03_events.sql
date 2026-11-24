-- =====================================================================
--  PWS 포털 — 업데이트 3: 일정 종류 확장 · 경기 구분 · 반복 일정 · 캘린더 구독
--  SQL Editor 에 전체를 붙여넣고 한 번 실행하세요. (여러 번 실행해도 안전합니다)
--  02_calendar.sql 내용이 포함되어 있어, 02 를 실행하지 않았어도 이 파일만 실행하면 됩니다.
-- =====================================================================

-- 1) 일정 종류: 훈련, 경기, 프로모, 외부촬영, 교육, 봉사, 기타(= 기존 general)
alter type public.event_type add value if not exists 'promo';
alter type public.event_type add value if not exists 'shoot';
alter type public.event_type add value if not exists 'education';
alter type public.event_type add value if not exists 'volunteer';

-- 2) 경기 구분(Main / Next step / 직접 입력), 반복 일정 묶음
alter table public.events add column if not exists match_kind text;
alter table public.events add column if not exists series_id uuid;
create index if not exists events_series_idx on public.events (series_id);

-- 3) 훈련·경기는 트레이너 이상만 등록, 나머지 종류는 승인된 회원 누구나
drop policy if exists events_insert on public.events;
drop policy if exists events_update on public.events;
create policy events_insert on public.events for insert
  with check (public.is_approved() and created_by = auth.uid()
              and (type not in ('training', 'match') or public.is_trainer()));
create policy events_update on public.events for update
  using (public.is_admin() or (created_by = auth.uid() and public.is_approved()))
  with check (public.is_admin() or (created_by = auth.uid() and (type not in ('training', 'match') or public.is_trainer())));

-- 4) 캘린더 구독 (회원별 비밀 주소)
create table if not exists public.calendar_tokens (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  token      uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table public.calendar_tokens enable row level security;
revoke all on public.calendar_tokens from anon, authenticated;

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

drop function if exists public.calendar_feed(uuid);
create function public.calendar_feed(p_token uuid)
returns table (id uuid, title text, description text, type text, match_kind text,
               starts_at timestamptz, ends_at timestamptz, location text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, e.title, e.description, e.type::text, e.match_kind, e.starts_at, e.ends_at, e.location, e.updated_at
  from events e
  where exists (select 1 from calendar_tokens t join profiles p on p.id = t.user_id
                where t.token = p_token and p.status = 'approved')
    and e.starts_at > now() - interval '90 days'
  order by e.starts_at
$$;

revoke all on function public.my_calendar_token(boolean) from public, anon;
grant execute on function public.my_calendar_token(boolean) to authenticated;
grant execute on function public.calendar_feed(uuid) to anon, authenticated;
