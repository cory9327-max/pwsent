-- =====================================================================
--  PWS 포털 — 업데이트 12: 훈련 투표자는 당일 자동으로 '참여' 처리
--  ★ SQL Editor 에서 "새 탭"을 열고 이 파일 내용만 붙여넣어 실행하세요.
--    (11_training_complete.sql 까지 실행한 상태여야 합니다. 여러 번 실행해도 안전합니다)
-- =====================================================================
-- 트레이너가 '불참'으로 바꾼 것을 기록으로 남겨야 자동 처리가 다시 '참여'로 되돌리지 않음
alter type public.attend_status add value if not exists 'absent';

-- 훈련 당일(그리고 지난 7일): 온다고 투표한 사람 중 출석 기록이 없는 사람을 '참여'로 넣음.
-- 사이트를 열 때마다 호출됨. 이미 기록(참여·지각·불참)이 있는 사람은 건드리지 않음
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
  where e.slots is not null and e.status = 'confirmed'
    and (e.starts_at at time zone 'Asia/Seoul')::date between today - 7 and today
    and exists (select 1 from jsonb_array_elements(e.slots) s where s->>'id' = v.slot_key)
  on conflict (event_id, user_id) do nothing;
  get diagnostics made = row_count;
  return made;
end $$;
revoke all on function public.apply_vote_attendance() from public, anon;
grant execute on function public.apply_vote_attendance() to authenticated;

-- 근태 집계: '불참' 기록도 불참으로 셈
drop function if exists public.attendance_report(date, date);
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
  where p.status = 'approved' and p.track_attendance
    and ((e.starts_at at time zone 'Asia/Seoul')::date < (now() at time zone 'Asia/Seoul')::date
         or a.user_id is not null)
  group by p.id, p.display_name, p.role
  order by p.display_name;
end $$;
grant execute on function public.attendance_report(date, date) to authenticated;
