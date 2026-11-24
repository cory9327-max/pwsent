-- =====================================================================
--  PWS 포털 — 업데이트 10: 해외선수 방문 일정 (항공편·공항·숙소) → 일정 탭 자동 반영
--  ★ SQL Editor 에서 "새 탭"을 열고 이 파일 내용만 붙여넣어 실행하세요.
--    (09_roster_auto_training.sql 까지 실행한 상태여야 합니다. 여러 번 실행해도 안전합니다)
-- =====================================================================

-- 일정 종류에 '해외선수' 추가 (이름을 비워 두면 언어별 번역 이름으로 표시)
insert into public.event_types (key, color, attendance, system, position)
values ('visit', '#0c8599', false, false, 8) on conflict (key) do nothing;

create table if not exists public.talent_visits (
  id               uuid primary key default gen_random_uuid(),
  talent_id        uuid not null references public.foreign_talents(id) on delete cascade,
  arrive_at        timestamptz,
  arrive_flight    text,
  arrive_airport   text,
  arrive_terminal  text,
  depart_at        timestamptz,
  depart_flight    text,
  depart_airport   text,
  depart_terminal  text,
  stay_name        text,
  stay_address     text,
  notes            text,
  visible_roles    text[],          -- 일정 탭에 보일 직급. 비어 있으면 전체 공개
  arrive_event_id  uuid,            -- 일정 탭에 만들어진 [입국] 일정
  depart_event_id  uuid,            -- 일정 탭에 만들어진 [출국] 일정
  created_by       uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint tv_dates check (depart_at is null or arrive_at is null or depart_at >= arrive_at)
);
alter table public.talent_visits drop constraint if exists talent_visits_arrive_event_id_fkey;
alter table public.talent_visits drop constraint if exists talent_visits_depart_event_id_fkey;
create index if not exists talent_visits_arrive_idx on public.talent_visits (arrive_at);

alter table public.talent_visits enable row level security;
drop policy if exists tv_all on public.talent_visits;
create policy tv_all on public.talent_visits for all using (public.has_perm('foreign')) with check (public.has_perm('foreign'));
grant select, insert, update, delete on public.talent_visits to authenticated;

-- 방문 일정을 저장하면 일정 탭에 [입국] / [출국] 일정을 자동으로 만들고 맞춰 줌
create or replace function public.sync_talent_visit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  nm    text;
  owner uuid;
  stay  text;
  loc   text;
  descr text;
begin
  new.updated_at := now();
  select coalesce(nullif(btrim(ring_name), ''), name) into nm from foreign_talents where id = new.talent_id;
  owner := coalesce(new.created_by, auth.uid(),
                    (select id from profiles where status = 'approved' and role = 'admin' order by created_at limit 1));
  stay := nullif(concat_ws(' · ', nullif(btrim(new.stay_name), ''), nullif(btrim(new.stay_address), '')), '');

  -- 입국
  if new.arrive_at is not null then
    loc   := nullif(concat_ws(' ', nullif(btrim(new.arrive_airport), ''), nullif(btrim(new.arrive_terminal), '')), '');
    descr := nullif(concat_ws(E'\n',
               case when nullif(btrim(new.arrive_flight), '') is not null then '항공편: ' || btrim(new.arrive_flight) end,
               case when stay is not null then '숙소: ' || stay end,
               nullif(btrim(new.notes), '')), '');
    if new.arrive_event_id is not null and exists (select 1 from events where id = new.arrive_event_id) then
      update events set title = '[입국] ' || nm, starts_at = new.arrive_at, ends_at = null, location = loc,
                        description = descr, visible_roles = new.visible_roles
      where id = new.arrive_event_id;
    else
      insert into events (title, type, starts_at, location, description, visible_roles, created_by)
      values ('[입국] ' || nm, 'visit', new.arrive_at, loc, descr, new.visible_roles, owner)
      returning id into new.arrive_event_id;
    end if;
  elsif new.arrive_event_id is not null then
    delete from events where id = new.arrive_event_id;
    new.arrive_event_id := null;
  end if;

  -- 출국
  if new.depart_at is not null then
    loc   := nullif(concat_ws(' ', nullif(btrim(new.depart_airport), ''), nullif(btrim(new.depart_terminal), '')), '');
    descr := nullif(concat_ws(E'\n',
               case when nullif(btrim(new.depart_flight), '') is not null then '항공편: ' || btrim(new.depart_flight) end,
               case when stay is not null then '숙소: ' || stay end), '');
    if new.depart_event_id is not null and exists (select 1 from events where id = new.depart_event_id) then
      update events set title = '[출국] ' || nm, starts_at = new.depart_at, ends_at = null, location = loc,
                        description = descr, visible_roles = new.visible_roles
      where id = new.depart_event_id;
    else
      insert into events (title, type, starts_at, location, description, visible_roles, created_by)
      values ('[출국] ' || nm, 'visit', new.depart_at, loc, descr, new.visible_roles, owner)
      returning id into new.depart_event_id;
    end if;
  elsif new.depart_event_id is not null then
    delete from events where id = new.depart_event_id;
    new.depart_event_id := null;
  end if;
  return new;
end $$;

create or replace function public.unsync_talent_visit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from events where id in (old.arrive_event_id, old.depart_event_id);
  return old;
end $$;

drop trigger if exists talent_visits_sync on public.talent_visits;
drop trigger if exists talent_visits_unsync on public.talent_visits;
create trigger talent_visits_sync before insert or update on public.talent_visits
  for each row execute function public.sync_talent_visit();
create trigger talent_visits_unsync after delete on public.talent_visits
  for each row execute function public.unsync_talent_visit();
