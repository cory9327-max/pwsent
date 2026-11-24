-- =====================================================================
--  PWS 포털 — 업데이트 11: 훈련 완료 확정 (출석 확인 → 훈련 내용 기록 → 완료 확정)
--  ★ SQL Editor 에서 "새 탭"을 열고 이 파일 내용만 붙여넣어 실행하세요.
--    (10_talent_visits.sql 까지 실행한 상태여야 합니다. 여러 번 실행해도 안전합니다)
-- =====================================================================
alter table public.events add column if not exists completed_at timestamptz;
alter table public.events add column if not exists completed_by uuid references public.profiles(id) on delete set null;

-- 훈련 완료 확정 / 확정 취소. 훈련 기록 권한이 있는 직급만, 훈련 기록이 작성된 뒤에만 확정 가능
create or replace function public.set_training_complete(p_event uuid, p_done boolean) returns void
language plpgsql security definer set search_path = public as $$
declare e events;
begin
  if not public.has_perm('training_log') then raise exception 'forbidden'; end if;
  select * into e from events where id = p_event;
  if e is null or e.type <> 'training' or e.status <> 'confirmed' then raise exception 'not_training'; end if;
  if p_done then
    if (e.starts_at at time zone 'Asia/Seoul')::date > (now() at time zone 'Asia/Seoul')::date then raise exception 'too_early'; end if;
    if not exists (select 1 from training_logs where event_id = p_event) then raise exception 'need_log'; end if;
    update events set completed_at = now(), completed_by = auth.uid() where id = p_event;
  else
    update events set completed_at = null, completed_by = null where id = p_event;
  end if;
end $$;
revoke all on function public.set_training_complete(uuid, boolean) from public, anon;
grant execute on function public.set_training_complete(uuid, boolean) to authenticated;
