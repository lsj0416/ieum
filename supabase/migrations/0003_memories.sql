-- S2-01 · 명시적 기억과 근거
--
-- 저장 자체보다 출처와 정정과 삭제가 핵심이다. 근거 없는 기억은 나중에
-- "왜 이걸 알고 있지"를 답할 수 없고, 정정 이력이 없으면 옛 사실이
-- 언제 어떻게 바뀌었는지 알 수 없다.

-- ---------------------------------------------------------------------------
-- memories
-- ---------------------------------------------------------------------------

create table public.memories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,

  -- 기억의 종류. 모두 '장기 기억' 하나로 취급하지 않는다.
  -- FACT: 바뀌기 전까지 유효한 사실
  -- PREFERENCE: 응답 방식에 대한 선호
  -- GOAL: 사용자가 이루려는 것. 여러 개가 동시에 살아 있을 수 있다
  -- EPISODE: 특정 시점의 사건
  kind text not null check (kind in ('FACT', 'PREFERENCE', 'GOAL', 'EPISODE')),

  content text not null,

  -- 이 기억이 어디서 왔는가. 사용자가 직접 밝힌 것과 모델이 추론한 것을
  -- 구분한다. 지금은 USER만 쓰지만, S4 자동 추출이 생기면 MODEL이 붙는다.
  -- 모델 추론을 사용자가 직접 밝힌 사실로 승격하지 않기 위한 구분이다.
  source text not null default 'USER' check (source in ('USER', 'MODEL')),

  -- ACTIVE: 지금 유효하다
  -- SUPERSEDED: 더 새로운 버전이 생겨 닫혔다
  -- DELETED: 사용자가 지웠다. 행은 남기고 상태만 바꾼다
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUPERSEDED', 'DELETED')),

  -- 정정 이력. 새 버전이 생기면 이전 버전을 SUPERSEDED로 닫고 여기로 잇는다.
  -- 과거 질문에 답할 때 "그때는 무엇이 사실이었는지"를 볼 수 있어야 한다.
  supersedes_id uuid references public.memories (id) on delete set null,

  -- 유효 시점. 사용자가 언제부터의 사실인지 밝히면 채운다.
  valid_from timestamptz not null default now(),
  valid_until timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Context를 만들 때 "내 활성 기억"을 읽는다.
create index memories_owner_status_idx
  on public.memories (owner_id, status, updated_at desc);

create trigger memories_set_updated_at
  before update on public.memories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- memory_evidence
-- ---------------------------------------------------------------------------

-- 기억이 어느 발화에서 나왔는지 남긴다.
--
-- 출처 메시지가 지워져도 기억은 남아야 하므로 on delete set null이다.
-- 다만 그때는 근거를 확인할 수 없다는 사실이 quote로 남는다.
create table public.memory_evidence (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.memories (id) on delete cascade,
  source_message_id uuid references public.messages (id) on delete set null,

  -- 근거가 된 최소한의 인용. 원문이 사라져도 무엇을 보고 저장했는지 남는다.
  quote text not null,

  -- CHAT: 대화 중 저장
  -- MANUAL: 기억함에서 직접 입력
  source_kind text not null default 'CHAT' check (source_kind in ('CHAT', 'MANUAL')),

  created_at timestamptz not null default now()
);

create index memory_evidence_memory_idx
  on public.memory_evidence (memory_id);

-- ---------------------------------------------------------------------------
-- messages 제외 상태
-- ---------------------------------------------------------------------------

-- 기억을 지웠는데 그 출처 메시지를 Context에서 계속 읽으면, 모델이 같은
-- 사실을 다시 말한다. 삭제가 의미를 잃는다.
--
-- 그래서 메시지에 제외 표시를 둔다. 대화 기록에는 남지만 Context에는
-- 넣지 않는다. 문서 7절이 요구하는 처리다.
alter table public.messages
  add column excluded_from_context boolean not null default false;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.memories enable row level security;
alter table public.memory_evidence enable row level security;

create policy "본인 기억만 조회"
  on public.memories for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "본인 기억만 생성"
  on public.memories for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "본인 기억만 수정"
  on public.memories for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- 삭제 정책을 두지 않는다. 기억은 행을 지우지 않고 status를 DELETED로
-- 바꾼다. 근거와 정정 이력이 함께 사라지면 "왜 지웠는지"도 사라진다.

-- 근거의 소유권은 기억을 통해 판단한다. owner_id를 복제하면 어긋날 수 있다.
create policy "본인 기억의 근거만 조회"
  on public.memory_evidence for select to authenticated
  using (
    exists (
      select 1 from public.memories m
      where m.id = memory_id and m.owner_id = (select auth.uid())
    )
  );

create policy "본인 기억의 근거만 생성"
  on public.memory_evidence for insert to authenticated
  with check (
    exists (
      select 1 from public.memories m
      where m.id = memory_id and m.owner_id = (select auth.uid())
    )
  );
