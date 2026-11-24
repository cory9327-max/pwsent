-- =====================================================================
--  PWS 포털 — 업데이트 13: 출석 대상 = 선수·연습생 직급 + 따로 표시한 회원
--  ★ SQL Editor 에서 "새 탭"을 열고 이 파일 내용만 붙여넣어 실행하세요.
--    (12_vote_attendance.sql 까지 실행한 상태여야 합니다. 여러 번 실행해도 안전합니다)
-- =====================================================================
--  · 직급에 "출석 대상 직급" 표시 (선수, 연습생 등). 그 직급의 회원은 모두 출석 명단에 나옵니다.
--  · 다른 직급(관리자·트레이너·기숙사 관리자 등)인데 선수이기도 한 회원은 회원별 "선수 겸임" 표시로 포함합니다.
--  · 둘 다 아니면(스탭 등) 출석 명단과 근태 집계에서 빠집니다.

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'roles' and column_name = 'attendance') then
    alter table public.roles add column attendance boolean not null default false;
    update public.roles set attendance = true where key = 'player';
    -- 회원별 표시는 이제 "선수 겸임"의 뜻. 처음 한 번만 모두 끔 (선수 직급은 직급 표시로 포함되므로)
    update public.profiles set track_attendance = false;
    alter table public.profiles alter column track_attendance set default false;
  end if;
end $$;

create or replace function public.is_attendance_target(p_role text, p_marked boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_marked, false) or coalesce((select attendance from roles where key = p_role), false)
$$;
grant execute on function public.is_attendance_target(text, boolean) to authenticated;

-- 투표자 자동 '참여' 처리: 출석 대상인 회원만
create or replace function public.apply_vote_attendance() returns int
language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Seoul')::date;
  made  int;
begin
  if not public.is_approved() then return 0; end if;
  insert into attendance (event_id, user_id, status, marked_by)
  select distinct e.id, v.user_id, 'present'::attend_status, null::uuid
  from events e
  join training_votes v on v.event_id = e.id
  join profiles p on p.id = v.user_id and p.status = 'approved'
                 and public.is_attendance_target(p.role, p.track_attendance)
  where e.slots is not null and e.status = 'confirmed'
    and (e.starts_at at time zone 'Asia/Seoul')::date between today - 7 and today
    and exists (select 1 from jsonb_array_elements(e.slots) s where s->>'id' = v.slot_key)
  on conflict (event_id, user_id) do nothing;
  get diagnostics made = row_count;
  return made;
end $$;

-- 근태 집계: 출석 대상인 회원만
create or replace function public.attendance_report(p_from date, p_to date)
returns table (user_id uuid, display_name text, role text, total int, present int, late int, absent int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_perm('attendance') then
    raise exception 'forbidden';
  end if;
  return query
  select p.id, p.display_name, p.role,
         count(e.id)::int,
         count(*) filter (where a.status::text = 'present')::int,
         count(*) filter (where a.status::text = 'late')::int,
         (count(e.id) - count(*) filter (where a.status::text in ('present', 'late')))::int
  from profiles p
  join events e
    on e.status = 'confirmed' and public.type_has_attendance(e.type)
   and (e.visible_roles is null or p.role = any(e.visible_roles) or 'edit_all' = any(public.perms_of(p.role)) or e.created_by = p.id)
   and (e.starts_at at time zone 'Asia/Seoul')::date between p_from and p_to
   and (e.starts_at at time zone 'Asia/Seoul')::date
         >= (coalesce(p.approved_at, p.created_at) at time zone 'Asia/Seoul')::date
  left join attendance a on a.event_id = e.id and a.user_id = p.id
  where p.status = 'approved' and public.is_attendance_target(p.role, p.track_attendance)
    and ((e.starts_at at time zone 'Asia/Seoul')::date < (now() at time zone 'Asia/Seoul')::date
         or a.user_id is not null)
  group by p.id, p.display_name, p.role
  order by p.display_name;
end $$;
