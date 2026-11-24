-- =====================================================================
--  PWS 포털 — 업데이트 9: 해외선수 명단(선수별 조건) · 주말 훈련 자동 등록
--  ★ SQL Editor 에서 "새 탭"을 열고 이 파일 내용만 붙여넣어 실행하세요.
--    (08_foreign_costs.sql 까지 실행한 상태여야 합니다. 여러 번 실행해도 안전합니다)
-- =====================================================================

-- ---------------------------------------------------------------------
--  A. 해외선수 명단: 선수 한 명에 한 줄. 비용 조건은 별도 표(비용 권한 필요)
-- ---------------------------------------------------------------------
do $$
declare first_time boolean := to_regclass('public.foreign_talents') is null;
begin
  create table if not exists public.foreign_talents (
    id          uuid primary key default gen_random_uuid(),
    name        text not null check (char_length(btrim(name)) between 1 and 80),
    ring_name   text,
    nationality text,
    birth_date  date,
    contact     text,
    notes       text,
    created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
  );
  create table if not exists public.foreign_talent_terms (
    talent_id       uuid primary key references public.foreign_talents(id) on delete cascade,
    stay_included   boolean not null default false,  -- 숙소 제공
    dorm_ok         boolean not null default false,  -- 숙소 제공 시 기숙사 사용 가능
    flight_included boolean not null default false,  -- 항공권 제공
    guarantee       numeric(14, 2),
    currency        text not null default 'KRW',
    memo            text,
    updated_at      timestamptz not null default now()
  );
  -- 예전 "일정별 기록"에 있던 선수를 명단으로 옮김 (처음 한 번만. 예전 기록 자체는 지우지 않음)
  if first_time and to_regclass('public.foreign_visits') is not null and to_regclass('public.foreign_visit_costs') is not null then
    with latest as (
      select distinct on (lower(btrim(v.player_name))) v.*, c.guarantee, c.currency
      from public.foreign_visits v left join public.foreign_visit_costs c on c.visit_id = v.id
      order by lower(btrim(v.player_name)), v.created_at desc
    ), ins as (
      insert into public.foreign_talents (id, name, ring_name, nationality, contact, notes, created_by)
      select id, player_name, ring_name, country, contact, notes, created_by from latest
      returning id
    )
    insert into public.foreign_talent_terms (talent_id, stay_included, dorm_ok, flight_included, guarantee, currency)
    select l.id, l.stay <> 'none', l.stay = 'dorm', l.flight_provided, nullif(l.guarantee, 0), coalesce(l.currency, 'KRW')
    from latest l join ins on ins.id = l.id;
  end if;
end $$;

drop trigger if exists foreign_talents_touch on public.foreign_talents;
create trigger foreign_talents_touch before update on public.foreign_talents
  for each row execute function public.touch_updated_at();

alter table public.foreign_talents      enable row level security;
alter table public.foreign_talent_terms enable row level security;
drop policy if exists ft_all on public.foreign_talents;
drop policy if exists ftt_all on public.foreign_talent_terms;
create policy ft_all on public.foreign_talents for all using (public.has_perm('foreign')) with check (public.has_perm('foreign'));
create policy ftt_all on public.foreign_talent_terms for all using (public.has_perm('foreign_cost')) with check (public.has_perm('foreign_cost'));
grant select, insert, update, delete on public.foreign_talents, public.foreign_talent_terms to authenticated;

-- ---------------------------------------------------------------------
--  B. 주말 훈련 자동 등록: 앞으로 N주치 주말 훈련이 항상 일정에 올라가 있도록
-- ---------------------------------------------------------------------
alter table public.training_settings add column if not exists auto_weeks   int not null default 8 check (auto_weeks between 0 and 26); -- 0 = 끔
alter table public.training_settings add column if not exists sat_on       boolean not null default true;
alter table public.training_settings add column if not exists sun_on       boolean not null default true;
alter table public.training_settings add column if not exists sat_location text;
alter table public.training_settings add column if not exists sun_location text;

-- 취소한 날짜 기록: 자동 등록이 그 날을 다시 만들지 않도록
create table if not exists public.training_cancellations (
  day        date primary key,
  created_at timestamptz not null default now()
);
alter table public.training_cancellations enable row level security;
drop policy if exists tcancel_select on public.training_cancellations;
create policy tcancel_select on public.training_cancellations for select using (public.is_approved());
grant select on public.training_cancellations to authenticated;

-- 주간 훈련(타임이 있는 확정 일정)을 지우면 그 날짜를 '취소'로 기록, 다시 열면 기록 삭제
create or replace function public.track_training_cancel() returns trigger
language plpgsql security definer set search_path = public as $$
declare d date;
begin
  if tg_op = 'DELETE' then
    d := (old.starts_at at time zone 'Asia/Seoul')::date;
    if old.slots is not null and old.status = 'confirmed' and d >= (now() at time zone 'Asia/Seoul')::date then
      insert into training_cancellations (day) values (d) on conflict do nothing;
    end if;
    return old;
  end if;
  if new.slots is not null then
    delete from training_cancellations where day = (new.starts_at at time zone 'Asia/Seoul')::date;
  end if;
  return new;
end $$;
drop trigger if exists events_training_cancel_del on public.events;
drop trigger if exists events_training_cancel_ins on public.events;
create trigger events_training_cancel_del after delete on public.events for each row execute function public.track_training_cancel();
create trigger events_training_cancel_ins after insert on public.events for each row execute function public.track_training_cancel();

-- 빠진 주말 훈련을 채워 넣음. 사이트를 열 때마다 호출됨 (이미 있으면 아무 일도 하지 않음)
--  건너뛰는 날: 이미 주간 훈련이 있는 날 · 취소한 날 · 경기가 있는 날
create or replace function public.ensure_weekly_trainings() returns int
language plpgsql security definer set search_path = public as $$
declare
  s        training_settings;
  snap     jsonb;
  first_t  text;
  last_t   text;
  owner_id uuid;
  d        date;
  today    date := (now() at time zone 'Asia/Seoul')::date;
  made     int := 0;
  loc      text;
begin
  if not public.is_approved() then return 0; end if;
  select * into s from training_settings where id;
  if s is null or s.auto_weeks = 0 or not (s.sat_on or s.sun_on) then return 0; end if;

  select jsonb_agg(jsonb_build_object('id', id::text, 'name', name, 'start', start_time, 'end', end_time) order by position, created_at),
         min(start_time), case when bool_and(end_time is not null) then max(end_time) end
    into snap, first_t, last_t from training_slots;
  if snap is null then return 0; end if;

  select id into owner_id from profiles where status = 'approved' and role = 'admin' order by created_at limit 1;
  if owner_id is null then return 0; end if;

  perform pg_advisory_xact_lock(770124);
  for d in select generate_series(today, today + s.auto_weeks * 7, interval '1 day')::date loop
    if (extract(dow from d) = 6 and s.sat_on) or (extract(dow from d) = 0 and s.sun_on) then
      if not exists (select 1 from training_cancellations where day = d)
         and not exists (select 1 from events e where (e.starts_at at time zone 'Asia/Seoul')::date = d
                         and (e.slots is not null or e.type = 'match')) then
        loc := case when extract(dow from d) = 6 then s.sat_location else s.sun_location end;
        insert into events (title, type, status, location, slots, created_by, starts_at, ends_at)
        values ('주말 훈련', 'training', 'confirmed', nullif(btrim(loc), ''), snap, owner_id,
                (d::text || ' ' || first_t)::timestamp at time zone 'Asia/Seoul',
                case when last_t is not null then (d::text || ' ' || last_t)::timestamp at time zone 'Asia/Seoul' end);
        made := made + 1;
      end if;
    end if;
  end loop;
  return made;
end $$;
grant execute on function public.ensure_weekly_trainings() to authenticated;

-- 자동으로 올라간 훈련도 트레이너(출석 일정 권한)가 수정·취소할 수 있게
drop policy if exists events_update on public.events;
drop policy if exists events_delete on public.events;
create policy events_update on public.events for update
  using (public.has_perm('edit_all') or (created_by = auth.uid() and public.is_approved())
         or (slots is not null and public.has_perm('sessions')))
  with check (public.has_perm('edit_all')
              or (created_by = auth.uid() and (not public.type_has_attendance(type) or public.has_perm('sessions')))
              or (slots is not null and public.has_perm('sessions')));
create policy events_delete on public.events for delete
  using (public.has_perm('edit_all') or (created_by = auth.uid() and public.is_approved())
         or (slots is not null and public.has_perm('sessions')));
