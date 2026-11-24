-- =====================================================================
--  PWS 포털 — 업데이트 6: 주간 훈련 (시간표 · 한 번에 열기 · 주간 투표 · 평일 모집)
--  ★ SQL Editor 에서 "새 탭"을 열고 이 파일 내용만 붙여넣어 실행하세요.
--    (05_types.sql 까지 실행한 상태여야 합니다. 여러 번 실행해도 안전합니다)
-- =====================================================================

-- 1) 훈련 시간표 (타임)
create table if not exists public.training_slots (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 30),
  start_time text not null check (start_time ~ '^\d\d:\d\d$'),
  end_time   text check (end_time is null or end_time ~ '^\d\d:\d\d$'),
  position   int not null default 0,
  created_at timestamptz not null default now()
);
insert into public.training_slots (name, start_time, end_time, position)
select * from (values ('여성부', '12:00', '13:00', 1), ('전체', '13:00', '15:00', 2), ('선수부', '15:00', '17:00', 3))
  as v(name, start_time, end_time, position)
where not exists (select 1 from public.training_slots);

-- 2) 설정: 평일 훈련 진행 기준 인원
create table if not exists public.training_settings (
  id         boolean primary key default true check (id),
  min_people int not null default 3 check (min_people between 1 and 99)
);
insert into public.training_settings (id) values (true) on conflict (id) do nothing;

alter table public.training_slots    enable row level security;
alter table public.training_settings enable row level security;
drop policy if exists tslots_select on public.training_slots;
drop policy if exists tslots_write on public.training_slots;
drop policy if exists tset_select on public.training_settings;
drop policy if exists tset_update on public.training_settings;
create policy tslots_select on public.training_slots for select using (public.is_approved());
create policy tslots_write on public.training_slots for all using (public.is_trainer()) with check (public.is_trainer());
create policy tset_select on public.training_settings for select using (public.is_approved());
create policy tset_update on public.training_settings for update using (public.is_trainer()) with check (public.is_trainer());
grant select, insert, update, delete on public.training_slots to authenticated;
grant select, update on public.training_settings to authenticated;

-- 3) 일정: 상태(모집 중/확정)와 그날의 타임 목록
alter table public.events add column if not exists status text not null default 'confirmed';
alter table public.events add column if not exists slots jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'events_status_chk') then
    alter table public.events add constraint events_status_chk check (status in ('tentative', 'confirmed'));
  end if;
end $$;

-- 4) 주간 투표: 타임별 참가 표시, 주 단위 불참 표시
create table if not exists public.training_votes (
  event_id   uuid not null references public.events(id) on delete cascade,
  slot_key   text not null,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, slot_key, user_id)
);
create table if not exists public.training_week_skips (
  week_start date not null,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (week_start, user_id)
);

-- 투표 가능: 그 훈련의 타임이 맞고, 훈련 전날 자정(한국 시간) 전까지
create or replace function public.training_vote_open(p_event uuid, p_slot text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from events e
    where e.id = p_event and e.slots is not null
      and (e.starts_at at time zone 'Asia/Seoul')::date > (now() at time zone 'Asia/Seoul')::date
      and exists (select 1 from jsonb_array_elements(e.slots) s where s->>'id' = p_slot)
  )
$$;

alter table public.training_votes      enable row level security;
alter table public.training_week_skips enable row level security;
drop policy if exists tvotes_select on public.training_votes;
drop policy if exists tvotes_insert on public.training_votes;
drop policy if exists tvotes_delete on public.training_votes;
drop policy if exists tskips_select on public.training_week_skips;
drop policy if exists tskips_insert on public.training_week_skips;
drop policy if exists tskips_delete on public.training_week_skips;
create policy tvotes_select on public.training_votes for select using (public.is_approved());
create policy tvotes_insert on public.training_votes for insert
  with check (user_id = auth.uid() and public.is_approved() and public.training_vote_open(event_id, slot_key));
create policy tvotes_delete on public.training_votes for delete
  using (user_id = auth.uid() and public.training_vote_open(event_id, slot_key));
create policy tskips_select on public.training_week_skips for select using (public.is_approved());
create policy tskips_insert on public.training_week_skips for insert with check (user_id = auth.uid() and public.is_approved());
create policy tskips_delete on public.training_week_skips for delete using (user_id = auth.uid());
grant select, insert, delete on public.training_votes, public.training_week_skips to authenticated;

-- 5) 출석·근태는 '확정'된 일정만
create or replace function public.can_self_checkin(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from events e
    where e.id = p_event and e.status = 'confirmed' and public.type_has_attendance(e.type)
      and (e.starts_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date
  )
$$;

create or replace function public.is_attendance_event(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from events e where e.id = p_event and e.status = 'confirmed' and public.type_has_attendance(e.type))
$$;

create or replace function public.attendance_report(p_from date, p_to date)
returns table (user_id uuid, display_name text, role public.app_role,
               total int, present int, late int, absent int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_trainer() then
    raise exception 'forbidden';
  end if;
  return query
  select p.id, p.display_name, p.role,
         count(e.id)::int,
         count(a.user_id) filter (where a.status = 'present')::int,
         count(a.user_id) filter (where a.status = 'late')::int,
         (count(e.id) - count(a.user_id))::int
  from profiles p
  join events e
    on e.status = 'confirmed' and public.type_has_attendance(e.type)
   and (e.starts_at at time zone 'Asia/Seoul')::date between p_from and p_to
   and (e.starts_at at time zone 'Asia/Seoul')::date
         >= (coalesce(p.approved_at, p.created_at) at time zone 'Asia/Seoul')::date
  left join attendance a on a.event_id = e.id and a.user_id = p.id
  where p.status = 'approved' and p.track_attendance
    and ((e.starts_at at time zone 'Asia/Seoul')::date < (now() at time zone 'Asia/Seoul')::date
         or a.user_id is not null)
  group by p.id, p.display_name, p.role
  order by p.display_name;
end $$;

-- 6) 캘린더 구독에 상태 포함 (모집 중 표시)
drop function if exists public.calendar_feed(uuid);
create function public.calendar_feed(p_token uuid)
returns table (id uuid, title text, description text, type text, type_name text, match_kind text, status text,
               starts_at timestamptz, ends_at timestamptz, location text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, e.title, e.description, e.type, et.name, e.match_kind, e.status, e.starts_at, e.ends_at, e.location, e.updated_at
  from events e left join event_types et on et.key = e.type
  where exists (select 1 from calendar_tokens t join profiles p on p.id = t.user_id
                where t.token = p_token and p.status = 'approved')
    and e.starts_at > now() - interval '90 days'
  order by e.starts_at
$$;
grant execute on function public.calendar_feed(uuid) to anon, authenticated;
grant execute on function public.training_vote_open(uuid, text) to authenticated;
