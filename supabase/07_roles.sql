-- =====================================================================
--  PWS 포털 — 업데이트 7: 직급·권한 설정 · 일정 공개 범위 · 관리자 드라이브
--  ★ SQL Editor 에서 "새 탭"을 열고 이 파일 내용만 붙여넣어 실행하세요.
--    (06_weekly_training.sql 까지 실행한 상태여야 합니다. 여러 번 실행해도 안전합니다)
-- =====================================================================
--  권한 이름
--    post         일정 등록 · 투표 만들기 · 드라이브 올리기
--    sessions     훈련·경기 등 출석 일정 등록, 주간 훈련 열기, 시간표 수정
--    attendance   출석 수정, 근태 집계 보기
--    training_log 훈련 기록 작성, 훈련 항목 관리
--    edit_all     남이 올린 글 수정·삭제
--    members      회원 승인, 직급 지정
--    settings     직급·권한 설정, 기본 목록(장소·일정 종류·경기 구분) 관리
--    foreign      해외선수 일정·비용 보기와 관리
--    admin_drive  관리자 드라이브 보기와 올리기

-- 1) 직급 목록
create table if not exists public.roles (
  key        text primary key,
  name       text check (name is null or char_length(btrim(name)) between 1 and 30), -- 비어 있으면 기본 번역 이름
  color      text not null default '#5c5f66',
  perms      text[] not null default '{}',
  system     boolean not null default false,   -- 삭제할 수 없는 직급 (관리자, 신규 가입 기본 직급)
  position   int not null default 0,
  created_at timestamptz not null default now()
);
insert into public.roles (key, color, perms, system, position)
select * from (values
  ('admin',   '#17171a', array['post','sessions','attendance','training_log','edit_all','members','settings','foreign','admin_drive'], true,  1),
  ('trainer', '#e8590c', array['post','sessions','attendance','training_log'], false, 2),
  ('player',  '#5c5f66', array['post'], true,  3),
  ('staff',   '#3b5bdb', array['post'], false, 4)
) as v(key, color, perms, system, position)
where not exists (select 1 from public.roles);

-- 2) 회원의 직급 칸을 고정 목록(enum)에서 직급 목록 참조로 변경
drop function if exists public.attendance_report(date, date);
drop policy if exists profiles_delete on public.profiles;  -- 직급 칸을 참조하므로 먼저 내렸다가 아래에서 다시 만듦
alter table public.profiles alter column role drop default;
alter table public.profiles alter column role type text using role::text;
alter table public.profiles alter column role set default 'player';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_role_fk') then
    alter table public.profiles add constraint profiles_role_fk
      foreign key (role) references public.roles(key) on update cascade on delete restrict;
  end if;
end $$;

-- 3) 권한 확인 함수
create or replace function public.all_perms() returns text[] language sql immutable as $$
  select array['post','sessions','attendance','training_log','edit_all','members','settings','foreign','admin_drive']
$$;

create or replace function public.perms_of(p_role text) returns text[]
language sql stable security definer set search_path = public as $$
  select case when p_role = 'admin' then public.all_perms()
              else coalesce((select perms from roles where key = p_role), '{}') end
$$;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and status = 'approved'
$$;

create or replace function public.my_perms() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(public.perms_of(public.my_role()), '{}')
$$;

create or replace function public.has_perm(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select p = any(public.my_perms())
$$;

-- 예전 함수는 새 권한 기준으로 맞춰 둠
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$ select public.my_role() = 'admin' $$;
create or replace function public.is_trainer() returns boolean
language sql stable security definer set search_path = public as $$ select public.has_perm('sessions') $$;

alter table public.roles enable row level security;
drop policy if exists roles_select on public.roles;
drop policy if exists roles_insert on public.roles;
drop policy if exists roles_update on public.roles;
drop policy if exists roles_delete on public.roles;
create policy roles_select on public.roles for select using (public.is_approved());
create policy roles_insert on public.roles for insert with check (public.has_perm('settings') and not system and key <> 'admin');
create policy roles_update on public.roles for update
  using (public.has_perm('settings') and key <> 'admin') with check (public.has_perm('settings') and key <> 'admin');
create policy roles_delete on public.roles for delete using (public.has_perm('settings') and not system);
grant select, insert, update, delete on public.roles to authenticated;

-- 4) 회원 관리: 'members' 권한. 자기보다 권한이 많은 직급은 주거나 건드릴 수 없음
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare mine text[];
begin
  if auth.uid() is not null then
    mine := public.my_perms();
    if not ('members' = any(mine)) then
      new.role             := old.role;
      new.status           := old.status;
      new.track_attendance := old.track_attendance;
      new.approved_at      := old.approved_at;
      new.approved_by      := old.approved_by;
      new.email            := old.email;
      if old.status = 'approved' and old.display_name is not null then
        new.display_name := old.display_name;
        new.name_type    := old.name_type;
      end if;
      if old.status = 'rejected' and new.display_name is distinct from old.display_name then
        new.status := 'pending';
      end if;
    elsif old.id <> auth.uid() or new.role is distinct from old.role then
      if not (public.perms_of(old.role) <@ mine and public.perms_of(new.role) <@ mine) then
        raise exception 'forbidden_role' using hint = '자신보다 권한이 많은 직급은 지정하거나 변경할 수 없습니다';
      end if;
    end if;
  end if;

  if new.status = 'approved' and old.status <> 'approved' then
    new.approved_at := now();
    new.approved_by := auth.uid();
  end if;

  if old.role = 'admin' and old.status = 'approved'
     and (new.role <> 'admin' or new.status <> 'approved')
     and not exists (select 1 from profiles where role = 'admin' and status = 'approved' and id <> old.id) then
    raise exception 'last_admin' using hint = '관리자가 최소 1명은 있어야 합니다';
  end if;
  return new;
end $$;

drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_delete on public.profiles;
create policy profiles_update on public.profiles for update
  using (id = auth.uid() or public.has_perm('members'))
  with check (id = auth.uid() or public.has_perm('members'));
create policy profiles_delete on public.profiles for delete
  using (public.has_perm('members') and id <> auth.uid() and public.perms_of(role) <@ public.my_perms());

-- 5) 일정: 공개 범위(볼 수 있는 직급). 비어 있으면 전체 공개.
--    등록자와 '남이 올린 글 수정' 권한이 있는 직급(관리자 등)은 항상 볼 수 있음
alter table public.events add column if not exists visible_roles text[];

drop policy if exists events_select on public.events;
drop policy if exists events_insert on public.events;
drop policy if exists events_update on public.events;
drop policy if exists events_delete on public.events;
create policy events_select on public.events for select
  using (public.is_approved() and (visible_roles is null or created_by = auth.uid()
         or public.has_perm('edit_all') or public.my_role() = any(visible_roles)));
create policy events_insert on public.events for insert
  with check (public.has_perm('post') and created_by = auth.uid()
              and (not public.type_has_attendance(type) or public.has_perm('sessions')));
create policy events_update on public.events for update
  using (public.has_perm('edit_all') or (created_by = auth.uid() and public.is_approved()))
  with check (public.has_perm('edit_all') or (created_by = auth.uid() and (not public.type_has_attendance(type) or public.has_perm('sessions'))));
create policy events_delete on public.events for delete
  using (public.has_perm('edit_all') or (created_by = auth.uid() and public.is_approved()));

-- 6) 출석
drop policy if exists attendance_select on public.attendance;
drop policy if exists attendance_insert on public.attendance;
drop policy if exists attendance_update on public.attendance;
drop policy if exists attendance_delete on public.attendance;
create policy attendance_select on public.attendance for select
  using (public.is_approved() and exists (select 1 from public.events e where e.id = event_id));
create policy attendance_insert on public.attendance for insert
  with check ((user_id = auth.uid() and public.is_approved() and public.can_self_checkin(event_id))
              or (public.has_perm('attendance') and public.is_attendance_event(event_id)));
create policy attendance_update on public.attendance for update
  using (public.has_perm('attendance')) with check (public.has_perm('attendance'));
create policy attendance_delete on public.attendance for delete using (public.has_perm('attendance'));

create function public.attendance_report(p_from date, p_to date)
returns table (user_id uuid, display_name text, role text, total int, present int, late int, absent int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_perm('attendance') then
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
   -- 그 회원이 볼 수 있는 일정만 근태 대상
   and (e.visible_roles is null or p.role = any(e.visible_roles) or 'edit_all' = any(public.perms_of(p.role)) or e.created_by = p.id)
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
grant execute on function public.attendance_report(date, date) to authenticated;

-- 7) 투표 (일정에 딸린 투표는 그 일정을 볼 수 있는 사람에게만)
drop policy if exists polls_select on public.polls;
drop policy if exists polls_insert on public.polls;
drop policy if exists polls_update on public.polls;
drop policy if exists polls_delete on public.polls;
create policy polls_select on public.polls for select
  using (public.is_approved() and (event_id is null or exists (select 1 from public.events e where e.id = event_id)));
create policy polls_insert on public.polls for insert with check (public.has_perm('post') and created_by = auth.uid());
create policy polls_update on public.polls for update
  using (public.has_perm('edit_all') or (created_by = auth.uid() and public.is_approved()))
  with check (public.has_perm('edit_all') or created_by = auth.uid());
create policy polls_delete on public.polls for delete
  using (public.has_perm('edit_all') or (created_by = auth.uid() and public.is_approved()));

drop policy if exists poll_options_select on public.poll_options;
drop policy if exists poll_options_write on public.poll_options;
create policy poll_options_select on public.poll_options for select
  using (public.is_approved() and exists (select 1 from public.polls p where p.id = poll_id));
create policy poll_options_write on public.poll_options for all
  using (public.has_perm('edit_all') or (public.is_approved() and public.owns_poll(poll_id)))
  with check (public.has_perm('edit_all') or (public.is_approved() and public.owns_poll(poll_id)));
drop policy if exists poll_votes_select on public.poll_votes;
create policy poll_votes_select on public.poll_votes for select
  using (public.is_approved() and exists (select 1 from public.polls p where p.id = poll_id));

-- 8) 훈련 기록
drop policy if exists tcat_insert on public.training_categories;
drop policy if exists tcat_update on public.training_categories;
drop policy if exists tcat_delete on public.training_categories;
create policy tcat_insert on public.training_categories for insert with check (public.has_perm('training_log') and created_by = auth.uid());
create policy tcat_update on public.training_categories for update
  using (public.has_perm('edit_all') or (public.has_perm('training_log') and created_by = auth.uid()))
  with check (public.has_perm('edit_all') or created_by = auth.uid());
create policy tcat_delete on public.training_categories for delete
  using (public.has_perm('edit_all') or (public.has_perm('training_log') and created_by = auth.uid()));

drop policy if exists tlog_insert on public.training_logs;
drop policy if exists tlog_update on public.training_logs;
drop policy if exists tlog_delete on public.training_logs;
create policy tlog_insert on public.training_logs for insert with check (public.has_perm('training_log') and created_by = auth.uid());
create policy tlog_update on public.training_logs for update
  using (public.has_perm('edit_all') or (public.has_perm('training_log') and created_by = auth.uid()))
  with check (public.has_perm('edit_all') or created_by = auth.uid());
create policy tlog_delete on public.training_logs for delete
  using (public.has_perm('edit_all') or (public.has_perm('training_log') and created_by = auth.uid()));
drop policy if exists titem_write on public.training_log_items;
create policy titem_write on public.training_log_items for all
  using (public.has_perm('edit_all') or (public.has_perm('training_log') and public.owns_log(log_id)))
  with check (public.has_perm('edit_all') or (public.has_perm('training_log') and public.owns_log(log_id)));

drop policy if exists tslots_write on public.training_slots;
drop policy if exists tset_update on public.training_settings;
create policy tslots_write on public.training_slots for all using (public.has_perm('sessions')) with check (public.has_perm('sessions'));
create policy tset_update on public.training_settings for update using (public.has_perm('sessions')) with check (public.has_perm('sessions'));

drop policy if exists tvotes_select on public.training_votes;
create policy tvotes_select on public.training_votes for select
  using (public.is_approved() and exists (select 1 from public.events e where e.id = event_id));

-- 9) 드라이브 파일 목록: 관리자 드라이브 구분
alter table public.shared_files add column if not exists admin_only boolean not null default false;
drop policy if exists files_select on public.shared_files;
drop policy if exists files_insert on public.shared_files;
drop policy if exists files_update on public.shared_files;
drop policy if exists files_delete on public.shared_files;
create policy files_select on public.shared_files for select
  using (public.is_approved() and (not admin_only or public.has_perm('admin_drive'))
         and (event_id is null or exists (select 1 from public.events e where e.id = event_id)));
create policy files_insert on public.shared_files for insert
  with check (public.has_perm('post') and uploaded_by = auth.uid() and (not admin_only or public.has_perm('admin_drive')));
create policy files_update on public.shared_files for update
  using (public.has_perm('edit_all') or (uploaded_by = auth.uid() and public.is_approved()))
  with check ((public.has_perm('edit_all') or uploaded_by = auth.uid()) and (not admin_only or public.has_perm('admin_drive')));
create policy files_delete on public.shared_files for delete
  using (public.has_perm('edit_all') or (uploaded_by = auth.uid() and public.is_approved()));

-- 10) 해외선수 · 기본 목록
drop policy if exists fv_admin on public.foreign_visits;
create policy fv_admin on public.foreign_visits for all using (public.has_perm('foreign')) with check (public.has_perm('foreign'));

drop policy if exists locations_admin on public.locations;
create policy locations_admin on public.locations for all using (public.has_perm('settings')) with check (public.has_perm('settings'));
drop policy if exists match_kinds_admin on public.match_kinds;
create policy match_kinds_admin on public.match_kinds for all using (public.has_perm('settings')) with check (public.has_perm('settings'));
drop policy if exists event_types_insert on public.event_types;
drop policy if exists event_types_update on public.event_types;
drop policy if exists event_types_delete on public.event_types;
create policy event_types_insert on public.event_types for insert with check (public.has_perm('settings') and not system);
create policy event_types_update on public.event_types for update using (public.has_perm('settings')) with check (public.has_perm('settings'));
create policy event_types_delete on public.event_types for delete using (public.has_perm('settings') and not system);

-- 11) 캘린더 구독: 그 회원이 볼 수 있는 일정만
drop function if exists public.calendar_feed(uuid);
create function public.calendar_feed(p_token uuid)
returns table (id uuid, title text, description text, type text, type_name text, match_kind text, status text,
               starts_at timestamptz, ends_at timestamptz, location text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, e.title, e.description, e.type, et.name, e.match_kind, e.status, e.starts_at, e.ends_at, e.location, e.updated_at
  from calendar_tokens t
  join profiles p on p.id = t.user_id and p.status = 'approved'
  join events e on (e.visible_roles is null or p.role = any(e.visible_roles) or 'edit_all' = any(public.perms_of(p.role)) or e.created_by = p.id)
  left join event_types et on et.key = e.type
  where t.token = p_token and e.starts_at > now() - interval '90 days'
  order by e.starts_at
$$;
grant execute on function public.calendar_feed(uuid) to anon, authenticated;
grant execute on function public.has_perm(text), public.my_role(), public.my_perms(), public.perms_of(text), public.all_perms() to authenticated;
