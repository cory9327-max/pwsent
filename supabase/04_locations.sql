-- =====================================================================
--  PWS 포털 — 업데이트 4: 기본 장소 목록 (관리자가 추가·삭제)
--  SQL Editor 에 전체를 붙여넣고 한 번 실행하세요. (여러 번 실행해도 안전합니다)
-- =====================================================================
create table if not exists public.locations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (char_length(btrim(name)) between 1 and 80),
  position   int not null default 0,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.locations enable row level security;
drop policy if exists locations_select on public.locations;
drop policy if exists locations_admin on public.locations;
create policy locations_select on public.locations for select using (public.is_approved());
create policy locations_admin on public.locations for all
  using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.locations to authenticated;

-- 처음 한 번만 기본 장소 4곳을 넣음
insert into public.locations (name, position)
select v.name, v.position
from (values ('평택스튜디오', 1), ('중구 구민회관', 2), ('KBS 아레나', 3), ('시흥훈련장', 4)) as v(name, position)
where not exists (select 1 from public.locations);
