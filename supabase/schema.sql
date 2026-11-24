-- =====================================================================
--  PWS 내부 관리 사이트 — 데이터베이스 스키마 (Supabase / PostgreSQL)
--  Supabase 대시보드 → SQL Editor 에 전체를 붙여넣고 한 번 실행하세요.
-- =====================================================================
--  ★ 최초 관리자 이메일: 아래 'YOUR_EMAIL@gmail.com' 을 본인 구글 이메일로 바꾸세요.
--    이 이메일로 가입하는 계정은 자동으로 [관리자 + 승인됨] 상태가 됩니다.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- 기본 설정 ----------
create table if not exists public.app_config (
  key   text primary key,
  value text not null
);
insert into public.app_config (key, value)
values ('bootstrap_admin_email', 'YOUR_EMAIL@gmail.com')
on conflict (key) do nothing;
alter table public.app_config enable row level security;   -- 정책 없음 = 외부에서 읽기/쓰기 불가

-- ---------- 열거형 ----------
do $$ begin
  create type public.app_role      as enum ('admin', 'trainer', 'player', 'staff');
  create type public.member_status as enum ('pending', 'approved', 'rejected');
  create type public.event_type    as enum ('general', 'training', 'match');
  create type public.attend_status as enum ('present', 'late');
  create type public.stay_type     as enum ('dorm', 'hotel', 'none');
  create type public.visit_status  as enum ('planned', 'confirmed', 'done', 'cancelled');
exception when duplicate_object then null; end $$;

-- ---------- 공통: updated_at 자동 갱신 ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- =====================================================================
--  회원 (profiles)
-- =====================================================================
create table if not exists public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  email            text,
  display_name     text,                        -- 본명 또는 링네임 (필수, 승인 후엔 관리자만 변경)
  name_type        text check (name_type in ('real', 'ring')),
  role             public.app_role      not null default 'player',
  status           public.member_status not null default 'pending',
  track_attendance boolean not null default true,   -- 근태 집계 대상 여부
  locale           text not null default 'ko' check (locale in ('ko', 'en', 'ja')),
  created_at       timestamptz not null default now(),
  approved_at      timestamptz,
  approved_by      uuid references public.profiles(id) on delete set null,
  constraint display_name_len check (display_name is null or char_length(btrim(display_name)) between 1 and 40)
);

-- 권한 헬퍼 (security definer: RLS 재귀 방지)
create or replace function public.is_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'approved')
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'approved' and role = 'admin')
$$;

-- 트레이너 이상 (트레이너 또는 관리자)
create or replace function public.is_trainer() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'approved' and role in ('admin', 'trainer'))
$$;

-- 신규 가입 시 프로필 자동 생성 (최초 관리자 이메일이면 바로 관리자 승인)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  boot text;
begin
  select value into boot from app_config where key = 'bootstrap_admin_email';
  if boot is not null and lower(new.email) = lower(boot) then
    insert into profiles (id, email, role, status, approved_at)
    values (new.id, new.email, 'admin', 'approved', now());
  else
    insert into profiles (id, email) values (new.id, new.email);
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 일반 회원이 바꿀 수 없는 칸 보호 + 마지막 관리자 보호
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- SQL Editor / service_role (auth.uid() 없음) 은 통과
  if auth.uid() is not null and not public.is_admin() then
    new.role             := old.role;
    new.status           := old.status;
    new.track_attendance := old.track_attendance;
    new.approved_at      := old.approved_at;
    new.approved_by      := old.approved_by;
    new.email            := old.email;
    -- 승인된 뒤에는 이름(본명/링네임) 변경 불가 → 관리자에게 요청 (처음 정하는 경우만 허용)
    if old.status = 'approved' and old.display_name is not null then
      new.display_name := old.display_name;
      new.name_type    := old.name_type;
    end if;
    -- 거절된 사람이 이름을 고쳐 다시 신청하면 승인 대기로
    if old.status = 'rejected' and new.display_name is distinct from old.display_name then
      new.status := 'pending';
    end if;
  end if;

  if new.status = 'approved' and old.status <> 'approved' then
    new.approved_at := now();
    new.approved_by := auth.uid();
  end if;

  if old.role = 'admin' and old.status = 'approved'
     and (new.role <> 'admin' or new.status <> 'approved')
     and not exists (select 1 from profiles
                     where role = 'admin' and status = 'approved' and id <> old.id) then
    raise exception 'last_admin' using hint = '관리자가 최소 1명은 있어야 합니다';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

alter table public.profiles enable row level security;
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_delete on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_approved());
create policy profiles_update on public.profiles for update
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
create policy profiles_delete on public.profiles for delete
  using (public.is_admin() and id <> auth.uid());

-- =====================================================================
--  일정 (events) — 일반 일정은 누구나, 훈련/경기는 트레이너 이상
-- =====================================================================
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 120),
  description text,
  type        public.event_type not null default 'general',
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  location    text,
  created_by  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint ends_after_start check (ends_at is null or ends_at >= starts_at)
);
create index if not exists events_starts_idx on public.events (starts_at);
drop trigger if exists events_touch on public.events;
create trigger events_touch before update on public.events
  for each row execute function public.touch_updated_at();

alter table public.events enable row level security;
drop policy if exists events_select on public.events;
drop policy if exists events_insert on public.events;
drop policy if exists events_update on public.events;
drop policy if exists events_delete on public.events;
create policy events_select on public.events for select using (public.is_approved());
create policy events_insert on public.events for insert
  with check (public.is_approved() and created_by = auth.uid()
              and (type = 'general' or public.is_trainer()));
create policy events_update on public.events for update
  using (public.is_admin() or (created_by = auth.uid() and public.is_approved()))
  with check (public.is_admin() or (created_by = auth.uid() and (type = 'general' or public.is_trainer())));
create policy events_delete on public.events for delete
  using (public.is_admin() or (created_by = auth.uid() and public.is_approved()));

-- =====================================================================
--  출석 (attendance) — 기록 없으면 불참으로 집계
-- =====================================================================
create table if not exists public.attendance (
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  status     public.attend_status not null,
  checked_at timestamptz not null default now(),
  marked_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  primary key (event_id, user_id)
);

-- 본인 출석 가능 여부: 훈련/경기 일정이고, 한국 시간 기준 당일일 때만
create or replace function public.can_self_checkin(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from events e
    where e.id = p_event
      and e.type in ('training', 'match')
      and (e.starts_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date
  )
$$;

create or replace function public.is_attendance_event(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from events where id = p_event and type in ('training', 'match'))
$$;

alter table public.attendance enable row level security;
drop policy if exists attendance_select on public.attendance;
drop policy if exists attendance_insert on public.attendance;
drop policy if exists attendance_update on public.attendance;
drop policy if exists attendance_delete on public.attendance;
create policy attendance_select on public.attendance for select using (public.is_approved());
-- 본인: 당일 1회 체크 / 트레이너 이상: 언제든 누구든 기록
create policy attendance_insert on public.attendance for insert
  with check (
    (user_id = auth.uid() and public.is_approved() and public.can_self_checkin(event_id))
    or (public.is_trainer() and public.is_attendance_event(event_id))
  );
create policy attendance_update on public.attendance for update
  using (public.is_trainer()) with check (public.is_trainer());
create policy attendance_delete on public.attendance for delete using (public.is_trainer());

-- 근태 집계 (트레이너 이상). 오늘 이전 일정 중 체크 안 한 건 = 불참
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
    on e.type in ('training', 'match')
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

-- =====================================================================
--  투표 (polls)
-- =====================================================================
create table if not exists public.polls (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 160),
  description text,
  event_id    uuid references public.events(id) on delete cascade,  -- 훈련 참가 투표 등
  multiple    boolean not null default false,
  closes_at   timestamptz,
  created_by  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create table if not exists public.poll_options (
  id       uuid primary key default gen_random_uuid(),
  poll_id  uuid not null references public.polls(id) on delete cascade,
  label    text not null check (char_length(label) between 1 and 120),
  position int  not null default 0
);
create table if not exists public.poll_votes (
  poll_id    uuid not null references public.polls(id) on delete cascade,
  option_id  uuid not null references public.poll_options(id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (option_id, user_id)
);
create index if not exists poll_votes_poll_idx on public.poll_votes (poll_id);

create or replace function public.owns_poll(p_poll uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from polls where id = p_poll and created_by = auth.uid())
$$;
create or replace function public.poll_open(p_poll uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from polls where id = p_poll and (closes_at is null or closes_at > now()))
$$;

-- 단일 선택 투표: 새 표를 넣으면 기존 표 자동 삭제
create or replace function public.single_choice_vote() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not (select multiple from polls where id = new.poll_id) then
    delete from poll_votes where poll_id = new.poll_id and user_id = new.user_id;
  end if;
  return new;
end $$;
drop trigger if exists poll_votes_single on public.poll_votes;
create trigger poll_votes_single before insert on public.poll_votes
  for each row execute function public.single_choice_vote();

alter table public.polls        enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes   enable row level security;
drop policy if exists polls_select on public.polls;
drop policy if exists polls_insert on public.polls;
drop policy if exists polls_update on public.polls;
drop policy if exists polls_delete on public.polls;
create policy polls_select on public.polls for select using (public.is_approved());
create policy polls_insert on public.polls for insert
  with check (public.is_approved() and created_by = auth.uid());
create policy polls_update on public.polls for update
  using (public.is_admin() or (created_by = auth.uid() and public.is_approved()))
  with check (public.is_admin() or created_by = auth.uid());
create policy polls_delete on public.polls for delete
  using (public.is_admin() or (created_by = auth.uid() and public.is_approved()));

drop policy if exists poll_options_select on public.poll_options;
drop policy if exists poll_options_write on public.poll_options;
create policy poll_options_select on public.poll_options for select using (public.is_approved());
create policy poll_options_write on public.poll_options for all
  using (public.is_admin() or (public.is_approved() and public.owns_poll(poll_id)))
  with check (public.is_admin() or (public.is_approved() and public.owns_poll(poll_id)));

drop policy if exists poll_votes_select on public.poll_votes;
drop policy if exists poll_votes_insert on public.poll_votes;
drop policy if exists poll_votes_delete on public.poll_votes;
create policy poll_votes_select on public.poll_votes for select using (public.is_approved());
create policy poll_votes_insert on public.poll_votes for insert
  with check (
    user_id = auth.uid() and public.is_approved() and public.poll_open(poll_id)
    and exists (select 1 from public.poll_options o where o.id = option_id and o.poll_id = poll_votes.poll_id)
  );
create policy poll_votes_delete on public.poll_votes for delete
  using (user_id = auth.uid() and public.poll_open(poll_id));

-- =====================================================================
--  훈련 기록 (training) — 항목(체력·낙법 등)은 트레이너가 직접 생성
-- =====================================================================
create table if not exists public.training_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 40),
  color      text not null default '#d93a3a',
  created_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.training_logs (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid references public.events(id) on delete set null,
  log_date   date not null default ((now() at time zone 'Asia/Seoul')::date),
  notes      text,
  created_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.training_log_items (
  id          uuid primary key default gen_random_uuid(),
  log_id      uuid not null references public.training_logs(id) on delete cascade,
  category_id uuid references public.training_categories(id) on delete set null,
  content     text not null default '',
  minutes     int check (minutes is null or minutes between 0 and 1440),
  position    int not null default 0
);
drop trigger if exists training_logs_touch on public.training_logs;
create trigger training_logs_touch before update on public.training_logs
  for each row execute function public.touch_updated_at();

create or replace function public.owns_log(p_log uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from training_logs where id = p_log and created_by = auth.uid())
$$;

alter table public.training_categories enable row level security;
alter table public.training_logs       enable row level security;
alter table public.training_log_items  enable row level security;

drop policy if exists tcat_select on public.training_categories;
drop policy if exists tcat_insert on public.training_categories;
drop policy if exists tcat_update on public.training_categories;
drop policy if exists tcat_delete on public.training_categories;
create policy tcat_select on public.training_categories for select using (public.is_approved());
create policy tcat_insert on public.training_categories for insert
  with check (public.is_trainer() and created_by = auth.uid());
create policy tcat_update on public.training_categories for update
  using (public.is_admin() or (public.is_trainer() and created_by = auth.uid()))
  with check (public.is_admin() or created_by = auth.uid());
create policy tcat_delete on public.training_categories for delete
  using (public.is_admin() or (public.is_trainer() and created_by = auth.uid()));

drop policy if exists tlog_select on public.training_logs;
drop policy if exists tlog_insert on public.training_logs;
drop policy if exists tlog_update on public.training_logs;
drop policy if exists tlog_delete on public.training_logs;
create policy tlog_select on public.training_logs for select using (public.is_approved());
create policy tlog_insert on public.training_logs for insert
  with check (public.is_trainer() and created_by = auth.uid());
create policy tlog_update on public.training_logs for update
  using (public.is_admin() or (public.is_trainer() and created_by = auth.uid()))
  with check (public.is_admin() or created_by = auth.uid());
create policy tlog_delete on public.training_logs for delete
  using (public.is_admin() or (public.is_trainer() and created_by = auth.uid()));

drop policy if exists titem_select on public.training_log_items;
drop policy if exists titem_write on public.training_log_items;
create policy titem_select on public.training_log_items for select using (public.is_approved());
create policy titem_write on public.training_log_items for all
  using (public.is_admin() or (public.is_trainer() and public.owns_log(log_id)))
  with check (public.is_admin() or (public.is_trainer() and public.owns_log(log_id)));

-- =====================================================================
--  공유 드라이브 파일 기록 (shared_files) — 실제 파일은 구글 드라이브에
-- =====================================================================
create table if not exists public.shared_files (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  drive_file_id text not null,
  url           text not null,
  mime_type     text,
  size_bytes    bigint,
  event_id      uuid references public.events(id) on delete set null,
  uploaded_by   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now()
);
alter table public.shared_files enable row level security;
drop policy if exists files_select on public.shared_files;
drop policy if exists files_insert on public.shared_files;
drop policy if exists files_update on public.shared_files;
drop policy if exists files_delete on public.shared_files;
create policy files_select on public.shared_files for select using (public.is_approved());
create policy files_insert on public.shared_files for insert
  with check (public.is_approved() and uploaded_by = auth.uid());
create policy files_update on public.shared_files for update
  using (public.is_admin() or (uploaded_by = auth.uid() and public.is_approved()))
  with check (public.is_admin() or uploaded_by = auth.uid());
create policy files_delete on public.shared_files for delete
  using (public.is_admin() or (uploaded_by = auth.uid() and public.is_approved()));

-- =====================================================================
--  해외선수 일정·비용 (foreign_visits) — 관리자 전용
-- =====================================================================
create table if not exists public.foreign_visits (
  id              uuid primary key default gen_random_uuid(),
  player_name     text not null,
  ring_name       text,
  country         text,
  contact         text,
  arrival_date    date,
  departure_date  date,
  schedule        text,                    -- 출전 경기·일정 메모
  stay            public.stay_type not null default 'dorm',
  stay_cost       numeric(14, 2) not null default 0,
  flight_provided boolean not null default false,
  flight_cost     numeric(14, 2) not null default 0,
  guarantee       numeric(14, 2) not null default 0,
  other_cost      numeric(14, 2) not null default 0,
  currency        text not null default 'KRW',
  status          public.visit_status not null default 'planned',
  notes           text,
  created_by      uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint fv_dates check (departure_date is null or arrival_date is null or departure_date >= arrival_date)
);
drop trigger if exists foreign_visits_touch on public.foreign_visits;
create trigger foreign_visits_touch before update on public.foreign_visits
  for each row execute function public.touch_updated_at();

alter table public.foreign_visits enable row level security;
drop policy if exists fv_admin on public.foreign_visits;
create policy fv_admin on public.foreign_visits for all
  using (public.is_admin()) with check (public.is_admin());

-- =====================================================================
--  권한 부여
-- =====================================================================
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on public.app_config from anon, authenticated;
grant execute on all functions in schema public to authenticated;
