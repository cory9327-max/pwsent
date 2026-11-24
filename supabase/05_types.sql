-- =====================================================================
--  PWS 포털 — 업데이트 5: 일정 종류·경기 구분을 관리자가 추가/수정
--  ★ SQL Editor 에서 "새 탭"을 열고 이 파일 내용만 붙여넣어 실행하세요.
--    (03_events.sql, 04_locations.sql 을 먼저 실행한 상태여야 합니다. 여러 번 실행해도 안전합니다)
-- =====================================================================

-- 1) 일정 종류 목록
create table if not exists public.event_types (
  key        text primary key,
  name       text check (name is null or char_length(btrim(name)) between 1 and 30), -- 비어 있으면 기본 번역 이름 사용
  color      text not null default '#6b7280',
  attendance boolean not null default false,  -- 출석 체크 대상(= 트레이너 이상만 등록)
  system     boolean not null default false,  -- 삭제할 수 없는 기본 종류(훈련·경기)
  position   int not null default 0,
  created_at timestamptz not null default now()
);
insert into public.event_types (key, color, attendance, system, position)
select * from (values
  ('training',  '#e8590c', true,  true,  1),
  ('match',     '#d92b2b', true,  true,  2),
  ('promo',     '#6741d9', false, false, 3),
  ('shoot',     '#0b7285', false, false, 4),
  ('education', '#2b8a3e', false, false, 5),
  ('volunteer', '#c2255c', false, false, 6),
  ('general',   '#6b7280', false, false, 7)
) as v(key, color, attendance, system, position)
where not exists (select 1 from public.event_types);

alter table public.event_types enable row level security;
drop policy if exists event_types_select on public.event_types;
drop policy if exists event_types_insert on public.event_types;
drop policy if exists event_types_update on public.event_types;
drop policy if exists event_types_delete on public.event_types;
create policy event_types_select on public.event_types for select using (public.is_approved());
create policy event_types_insert on public.event_types for insert with check (public.is_admin() and not system);
create policy event_types_update on public.event_types for update using (public.is_admin()) with check (public.is_admin());
create policy event_types_delete on public.event_types for delete using (public.is_admin() and not system);
grant select, insert, update, delete on public.event_types to authenticated;

-- 2) 경기 구분 목록
create table if not exists public.match_kinds (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (char_length(btrim(name)) between 1 and 80),
  position   int not null default 0,
  created_at timestamptz not null default now()
);
insert into public.match_kinds (name, position)
select * from (values ('Main', 1), ('Next step', 2)) as v(name, position)
where not exists (select 1 from public.match_kinds);

alter table public.match_kinds enable row level security;
drop policy if exists match_kinds_select on public.match_kinds;
drop policy if exists match_kinds_admin on public.match_kinds;
create policy match_kinds_select on public.match_kinds for select using (public.is_approved());
create policy match_kinds_admin on public.match_kinds for all using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.match_kinds to authenticated;

-- 3) 일정의 종류 칸을 고정 목록(enum)에서 자유 목록(text)으로 변경
drop policy if exists events_insert on public.events;
drop policy if exists events_update on public.events;
alter table public.events alter column type drop default;
alter table public.events alter column type type text using type::text;
alter table public.events alter column type set default 'general';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'events_type_fk') then
    alter table public.events add constraint events_type_fk
      foreign key (type) references public.event_types(key) on update cascade on delete restrict;
  end if;
end $$;

-- 4) 권한·출석 규칙: '출석 체크'가 켜진 종류 기준으로
create or replace function public.type_has_attendance(p_type text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select attendance from event_types where key = p_type), false)
$$;

create policy events_insert on public.events for insert
  with check (public.is_approved() and created_by = auth.uid()
              and (not public.type_has_attendance(type) or public.is_trainer()));
create policy events_update on public.events for update
  using (public.is_admin() or (created_by = auth.uid() and public.is_approved()))
  with check (public.is_admin() or (created_by = auth.uid() and (not public.type_has_attendance(type) or public.is_trainer())));

create or replace function public.can_self_checkin(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from events e
    where e.id = p_event and public.type_has_attendance(e.type)
      and (e.starts_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date
  )
$$;

create or replace function public.is_attendance_event(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from events e where e.id = p_event and public.type_has_attendance(e.type))
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
    on public.type_has_attendance(e.type)
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

-- 5) 캘린더 구독에 종류 이름 포함
drop function if exists public.calendar_feed(uuid);
create function public.calendar_feed(p_token uuid)
returns table (id uuid, title text, description text, type text, type_name text, match_kind text,
               starts_at timestamptz, ends_at timestamptz, location text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, e.title, e.description, e.type, et.name, e.match_kind, e.starts_at, e.ends_at, e.location, e.updated_at
  from events e left join event_types et on et.key = e.type
  where exists (select 1 from calendar_tokens t join profiles p on p.id = t.user_id
                where t.token = p_token and p.status = 'approved')
    and e.starts_at > now() - interval '90 days'
  order by e.starts_at
$$;
grant execute on function public.calendar_feed(uuid) to anon, authenticated;
grant execute on function public.type_has_attendance(text) to authenticated;
