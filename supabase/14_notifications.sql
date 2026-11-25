-- =====================================================================
--  PWS 포털 — 업데이트 14: 웹 알림 (기숙사를 쓰는 해외선수 방문 일정 → 기숙사 알림 받는 직급)
--  ★ SQL Editor 에서 "새 탭"을 열고 이 파일 내용만 붙여넣어 실행하세요.
--    (13_attendance_targets.sql 까지 실행한 상태여야 합니다. 여러 번 실행해도 안전합니다)
-- =====================================================================

-- 직급: "기숙사 알림 받는 직급" 표시 / 방문 일정: "기숙사 사용" 표시
alter table public.roles         add column if not exists dorm_notify boolean not null default false;
alter table public.talent_visits add column if not exists uses_dorm   boolean not null default false;

-- 알림함 (받는 사람별 한 줄)
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null,          -- dorm_new / dorm_changed / dorm_cancelled / dorm_reminder
  data       jsonb not null default '{}',
  visit_id   uuid,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create unique index if not exists notifications_reminder_once on public.notifications (user_id, visit_id) where kind = 'dorm_reminder';

alter table public.notifications enable row level security;
drop policy if exists notif_select on public.notifications;
drop policy if exists notif_update on public.notifications;
drop policy if exists notif_delete on public.notifications;
create policy notif_select on public.notifications for select using (user_id = auth.uid());
create policy notif_update on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notif_delete on public.notifications for delete using (user_id = auth.uid());
grant select, update, delete on public.notifications to authenticated;   -- 만들기는 아래 함수로만

-- 알림에 담을 내용 (알림만 보고도 준비할 수 있게 입출국 정보를 함께 담음)
create or replace function public.visit_notice_data(v public.talent_visits) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', (select coalesce(nullif(btrim(ring_name), ''), name) from foreign_talents where id = v.talent_id),
    'arrive_at', v.arrive_at, 'arrive_flight', v.arrive_flight, 'arrive_airport', v.arrive_airport, 'arrive_terminal', v.arrive_terminal,
    'depart_at', v.depart_at, 'depart_flight', v.depart_flight, 'stay_name', v.stay_name)
$$;

create or replace function public.send_dorm_notice(p_kind text, v public.talent_visits, p_skip uuid) returns void
language sql security definer set search_path = public as $$
  insert into notifications (user_id, kind, data, visit_id)
  select p.id, p_kind, public.visit_notice_data(v), v.id
  from profiles p join roles r on r.key = p.role
  where p.status = 'approved' and r.dorm_notify and p.id is distinct from p_skip   -- 일정을 고친 본인에게는 보내지 않음
  on conflict do nothing
$$;

-- 방문 일정 등록·변경·삭제 시 알림
create or replace function public.notify_dorm_visit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.uses_dorm then perform public.send_dorm_notice('dorm_new', new, auth.uid()); end if;
  elsif tg_op = 'UPDATE' then
    if new.uses_dorm and not old.uses_dorm then
      perform public.send_dorm_notice('dorm_new', new, auth.uid());
    elsif old.uses_dorm and not new.uses_dorm then
      perform public.send_dorm_notice('dorm_cancelled', old, auth.uid());
    elsif new.uses_dorm and (new.arrive_at, new.depart_at, new.arrive_flight, new.arrive_airport, new.arrive_terminal, new.depart_flight, new.talent_id)
                 is distinct from (old.arrive_at, old.depart_at, old.arrive_flight, old.arrive_airport, old.arrive_terminal, old.depart_flight, old.talent_id) then
      perform public.send_dorm_notice('dorm_changed', new, auth.uid());
    end if;
  elsif tg_op = 'DELETE' then
    -- 이미 끝난 방문을 지우는 것은 알리지 않음
    if old.uses_dorm and coalesce(old.depart_at, old.arrive_at, now()) >= now() - interval '1 day' then
      perform public.send_dorm_notice('dorm_cancelled', old, auth.uid());
    end if;
    return old;
  end if;
  return new;
end $$;
drop trigger if exists talent_visits_notify on public.talent_visits;
drop trigger if exists talent_visits_notify_del on public.talent_visits;
create trigger talent_visits_notify after insert or update on public.talent_visits
  for each row execute function public.notify_dorm_visit();
-- 삭제 알림은 선수 정보가 지워지기 전에 만들어야 이름이 남음
create trigger talent_visits_notify_del before delete on public.talent_visits
  for each row execute function public.notify_dorm_visit();

-- 입국 전날(늦어도 당일) 알림. 사이트를 열 때마다 호출되며, 방문 일정마다 한 번만 만들어짐
create or replace function public.make_due_notifications() returns int
language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Seoul')::date;
  v     talent_visits;
  made  int := 0;
  n     int;
begin
  if not public.is_approved() then return 0; end if;
  for v in select * from talent_visits
           where uses_dorm and arrive_at > now()
             and (arrive_at at time zone 'Asia/Seoul')::date between today and today + 1 loop
    insert into notifications (user_id, kind, data, visit_id)
    select p.id, 'dorm_reminder', public.visit_notice_data(v), v.id
    from profiles p join roles r on r.key = p.role
    where p.status = 'approved' and r.dorm_notify
    on conflict do nothing;
    get diagnostics n = row_count;
    made := made + n;
  end loop;
  return made;
end $$;
revoke all on function public.make_due_notifications() from public, anon;
revoke all on function public.send_dorm_notice(text, public.talent_visits, uuid) from public, anon, authenticated;
grant execute on function public.make_due_notifications() to authenticated;
