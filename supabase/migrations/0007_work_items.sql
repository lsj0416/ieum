-- S3-C · 진행 중인 일과 결정
--
-- 문서 01이 정한 첫 실사용 목표의 마지막 조각이다.
--   "다음 날 새 대화에서 마지막 결정과 다음 행동을 이어서 안내한다"
--
-- Work Item은 Topic이 아니다. Kafka는 주제이고 Kafka 면접 정리는 완료
-- 가능한 일이다(D42). 주제 연결은 선택이며 없어도 된다.

create table public.work_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,

  title text not null,
  goal text,

  -- 진행/보류/완료를 구분한다. 완료한 일을 다시 권하지 않기 위한 값이다.
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'PAUSED', 'DONE')),

  -- 다음에 할 일. 이 값이 비어 있으면 "다음은?"에 답할 수 없다.
  next_action text,

  -- 주제는 선택이다. 주제 없이도 일은 존재한다(05 8절의 nullable topic_id).
  topic_id uuid references public.topics (id) on delete set null,

  -- 마지막으로 상태를 확인한 시각. 오래된 상태임을 밝히는 데 쓴다(E09).
  last_confirmed_at timestamptz not null default now(),
  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index work_items_owner_status_idx
  on public.work_items (owner_id, status, updated_at desc);

create trigger work_items_set_updated_at
  before update on public.work_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- work_decisions
-- ---------------------------------------------------------------------------

-- 결정은 덮어쓰지 않는다. 새 결정이 이전 결정을 대체하면 supersedes_id로
-- 잇는다. 기억(D33)과 같은 규칙이다. 지난 결정을 지우면 왜 그렇게 정했는지
-- 되짚을 수 없다.
create table public.work_decisions (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_items (id) on delete cascade,

  decision text not null,
  reason text,

  -- 어느 대화에서 정했는지. 원문이 지워져도 결정은 남아야 하므로 set null이다.
  source_message_id uuid references public.messages (id) on delete set null,

  supersedes_id uuid references public.work_decisions (id) on delete set null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUPERSEDED')),

  created_at timestamptz not null default now()
);

create index work_decisions_item_idx
  on public.work_decisions (work_item_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 소유권 검증
-- ---------------------------------------------------------------------------

-- 본인 일에 타인의 주제를 붙이지 못하게 한다(05 8절).
create or replace function public.assert_work_item_topic_same_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  topic_owner uuid;
begin
  if new.topic_id is null then
    return new;
  end if;

  select owner_id into topic_owner from public.topics where id = new.topic_id;

  if topic_owner is null or topic_owner <> new.owner_id then
    raise exception '일과 주제의 소유자가 다르다';
  end if;

  return new;
end;
$$;

create trigger work_items_topic_same_owner
  before insert or update on public.work_items
  for each row execute function public.assert_work_item_topic_same_owner();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.work_items enable row level security;
alter table public.work_decisions enable row level security;

create policy "본인 일만 조회" on public.work_items
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "본인 일만 생성" on public.work_items
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "본인 일만 수정" on public.work_items
  for update to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- 결정의 소유권은 일을 통해 판단한다.
create policy "본인 일의 결정만 조회" on public.work_decisions
  for select to authenticated using (
    exists (select 1 from public.work_items w
            where w.id = work_item_id and w.owner_id = (select auth.uid()))
  );
create policy "본인 일의 결정만 생성" on public.work_decisions
  for insert to authenticated with check (
    exists (select 1 from public.work_items w
            where w.id = work_item_id and w.owner_id = (select auth.uid()))
  );
create policy "본인 일의 결정만 수정" on public.work_decisions
  for update to authenticated using (
    exists (select 1 from public.work_items w
            where w.id = work_item_id and w.owner_id = (select auth.uid()))
  ) with check (
    exists (select 1 from public.work_items w
            where w.id = work_item_id and w.owner_id = (select auth.uid()))
  );
