-- =====================================================================
--  PWS 포털 — 업데이트 8: 해외선수 권한을 "일정 관리"와 "비용 보기"로 분리
--  ★ SQL Editor 에서 "새 탭"을 열고 이 파일 내용만 붙여넣어 실행하세요.
--    (07_roles.sql 까지 실행한 상태여야 합니다. 여러 번 실행해도 안전합니다)
-- =====================================================================
--    foreign       해외선수 일정 보기와 관리 (이름·기간·출전 일정·숙소 종류·항공 제공 여부)
--    foreign_cost  해외선수 비용 보기와 입력 (숙박비·항공권·개런티·기타 비용)
--  비용은 별도 표로 옮겨서, 비용 권한이 없는 직급은 서버에서도 금액을 읽을 수 없습니다.

create or replace function public.all_perms() returns text[] language sql immutable as $$
  select array['post','sessions','attendance','training_log','edit_all','members','settings','foreign','foreign_cost','admin_drive']
$$;

do $$
begin
  if to_regclass('public.foreign_visit_costs') is null then
    create table public.foreign_visit_costs (
      visit_id    uuid primary key references public.foreign_visits(id) on delete cascade,
      stay_cost   numeric(14, 2) not null default 0,
      flight_cost numeric(14, 2) not null default 0,
      guarantee   numeric(14, 2) not null default 0,
      other_cost  numeric(14, 2) not null default 0,
      currency    text not null default 'KRW',
      updated_at  timestamptz not null default now()
    );
    -- 기존에 입력한 금액을 새 표로 옮김
    insert into public.foreign_visit_costs (visit_id, stay_cost, flight_cost, guarantee, other_cost, currency)
    select id, stay_cost, flight_cost, guarantee, other_cost, currency from public.foreign_visits;
    -- 지금 해외선수 권한이 있는 직급은 비용 권한도 그대로 유지 (처음 한 번만)
    update public.roles set perms = array_append(perms, 'foreign_cost')
    where 'foreign' = any(perms) and not ('foreign_cost' = any(perms));
    update public.roles set perms = public.all_perms() where key = 'admin';
  end if;
end $$;

-- 일정 표에서는 금액 칸을 제거
alter table public.foreign_visits
  drop column if exists stay_cost, drop column if exists flight_cost,
  drop column if exists guarantee, drop column if exists other_cost, drop column if exists currency;

alter table public.foreign_visit_costs enable row level security;
drop policy if exists fvc_all on public.foreign_visit_costs;
create policy fvc_all on public.foreign_visit_costs for all
  using (public.has_perm('foreign_cost')) with check (public.has_perm('foreign_cost'));
grant select, insert, update, delete on public.foreign_visit_costs to authenticated;
