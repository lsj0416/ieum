-- S1-02 · 모델 호출 기록
--
-- 호출마다 무엇을 얼마나 썼는지 남긴다. 비용은 나중에 합산하는 것이 아니라
-- 호출 시점의 단가로 계산해 저장한다. 단가는 바뀌고, 지난 호출의 비용은
-- 그때의 단가로 남아야 한다.

create table public.model_calls (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,

  -- 어떤 용도의 호출인가. 모델 ID가 아니라 작업 이름을 남긴다.
  -- 모델을 바꿔도 "대화 응답에 얼마 썼는지"를 이어서 볼 수 있다.
  task text not null,
  model text not null,

  -- 실패한 호출도 기록한다. 생성 도중 끊긴 호출에도 과금될 수 있으므로
  -- 실패를 비용 0원으로 취급하지 않는다.
  status text not null check (status in ('completed', 'failed', 'timeout')),
  error_kind text,

  -- 입력은 캐시 여부에 따라 단가가 달라 나눠 기록한다.
  -- input_tokens는 세 종류를 합한 전체 입력 토큰 수다.
  input_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  output_tokens integer not null default 0,

  -- 호출 시점 단가로 계산한 값. 소수점이 중요하므로 numeric을 쓴다.
  -- double precision은 금액 합산에서 오차가 쌓인다.
  estimated_cost_usd numeric(12, 6) not null default 0,

  latency_ms integer,
  created_at timestamptz not null default now()
);

-- 월 예산을 확인할 때 "내 호출을 기간으로" 읽는다.
create index model_calls_owner_created_idx
  on public.model_calls (owner_id, created_at desc);

alter table public.model_calls enable row level security;

-- 읽기만 허용한다. 쓰기는 서버 코드가 사용자 토큰으로 수행하되,
-- 사용자가 자기 사용량 기록을 지우거나 고칠 수 있으면 예산 통제가 무의미하다.
create policy "본인 호출 기록만 조회"
  on public.model_calls for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "본인 호출 기록만 생성"
  on public.model_calls for insert to authenticated
  with check (owner_id = (select auth.uid()));
