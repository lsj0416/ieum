-- S4-0 · 초기 사용자 맥락 가져오기
--
-- 기억이 0건인 상태에서는 비서가 사용자를 모른다. 기존에 쓰던 AI에게
-- 자기 정보를 정리하게 해서 붙여넣으면, 그것을 기억 후보로 나눠 사용자가
-- 고르게 한다.
--
-- 이 migration의 핵심은 "가져온 것"과 "확인된 것"을 섞지 않는 것이다.
-- 붙여넣은 원문(memory_imports)과 후보(memory_candidates)는 기억이 아니다.
-- 사용자가 승인한 후보만 memories로 넘어간다. 06 문서 8절의 요구다.

-- ---------------------------------------------------------------------------
-- memory_imports · 한 번의 가져오기
-- ---------------------------------------------------------------------------

create table public.memory_imports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,

  -- 어디서 가져왔는가. 사용자가 직접 적는다("ChatGPT", "Claude" 등).
  -- 출처를 남기지 않으면 나중에 이 내용을 어디까지 믿을지 판단할 수 없다.
  source_label text not null,

  -- 붙여넣은 원문. 후보의 근거(quote)가 실제로 이 안에 있는지 대조하는 데
  -- 쓴다. 모델이 지어낸 인용을 근거로 받아들이지 않기 위해서다.
  raw_text text not null,

  -- 가져온 날짜. 06 8절이 출처와 함께 요구하는 값이다. 이 시점 이후에
  -- 사실이 바뀌었을 수 있으므로 Context에서 함께 밝힌다.
  imported_at timestamptz not null default now(),

  -- PENDING: 아직 결정하지 않은 후보가 남아 있다
  -- REVIEWED: 모든 후보를 승인하거나 제외했다
  status text not null default 'PENDING' check (status in ('PENDING', 'REVIEWED')),

  -- 후보를 뽑은 모델. 모델을 바꾼 뒤 품질이 달라지면 여기로 구분한다.
  model text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index memory_imports_owner_idx
  on public.memory_imports (owner_id, created_at desc);

create trigger memory_imports_set_updated_at
  before update on public.memory_imports
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- memory_candidates · 아직 기억이 아닌 것
-- ---------------------------------------------------------------------------

create table public.memory_candidates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  import_id uuid not null references public.memory_imports (id) on delete cascade,

  -- memories와 같은 분류를 쓴다. 승인하면 그대로 넘어간다.
  kind text not null check (kind in ('FACT', 'PREFERENCE', 'GOAL', 'EPISODE')),

  content text not null,

  -- 사용자가 한 말인가, 외부 AI가 추정한 것인가.
  -- USER_STATEMENT: 원문에 사용자의 발언으로 적혀 있다
  -- AI_INFERENCE: 외부 AI가 정리하며 덧붙인 판단이다
  -- 06 8절이 "사용자 발언과 AI의 추정을 구분한다"고 요구한다. 승인 시
  -- 각각 memories.source의 USER와 MODEL로 이어진다.
  attribution text not null check (attribution in ('USER_STATEMENT', 'AI_INFERENCE')),

  -- 원문에서 이 후보가 나온 대목.
  quote text not null,

  -- 그 인용이 실제로 raw_text 안에 있었는가. 모델이 원문에 없는 문장을
  -- 근거로 대는 일이 있다. 서버가 대조해서 채운다. false면 화면에서
  -- 경고하고 기본 선택에서 뺀다.
  quote_verified boolean not null default false,

  -- 민감 정보로 판정됐는가. 06 8절은 "민감 정보는 기본적으로 제외한다"고
  -- 정한다. 행을 지우지 않고 표시만 해서 사용자가 보고 결정하게 한다.
  sensitive boolean not null default false,

  -- PENDING: 검토 전
  -- ACCEPTED: 사용자가 승인해 기억이 됐다
  -- REJECTED: 사용자가 제외했다
  status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'REJECTED')),

  -- 승인해서 만들어진 기억. 어떤 후보가 어떤 기억이 됐는지 잇는다.
  memory_id uuid references public.memories (id) on delete set null,

  decided_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index memory_candidates_import_idx
  on public.memory_candidates (import_id, created_at);

create trigger memory_candidates_set_updated_at
  before update on public.memory_candidates
  for each row execute function public.set_updated_at();

-- 후보와 가져오기의 소유자가 같은지 DB가 확인한다. 남의 가져오기에 자기
-- 후보를 붙이는 것도 막아야 한다. topic_segments에 쓴 것과 같은 방식이다(D51).
create or replace function public.check_candidate_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  import_owner uuid;
begin
  select owner_id into import_owner
    from public.memory_imports where id = new.import_id;

  if import_owner is null or import_owner <> new.owner_id then
    raise exception '후보와 가져오기의 소유자가 다르다';
  end if;

  return new;
end;
$$;

create trigger memory_candidates_check_owner
  before insert or update on public.memory_candidates
  for each row execute function public.check_candidate_owner();

-- ---------------------------------------------------------------------------
-- memories · 어디서 온 기억인지
-- ---------------------------------------------------------------------------

-- 가져오기에서 온 기억은 사용자가 대화 중 직접 밝힌 사실과 다르다.
-- 정리된 시점이 있고 그 뒤로 바뀌었을 수 있다. Context에서 그 사실을
-- 함께 전달하려면 어느 가져오기에서 왔는지 알아야 한다.
alter table public.memories
  add column origin_import_id uuid references public.memory_imports (id) on delete set null;

-- 근거의 출처 종류에 IMPORT를 더한다. CHAT(대화 중 저장)·MANUAL(직접 입력)과
-- 구분해야 "이건 외부 AI가 정리한 것"임을 나중에도 알 수 있다.
alter table public.memory_evidence
  drop constraint memory_evidence_source_kind_check;

alter table public.memory_evidence
  add constraint memory_evidence_source_kind_check
  check (source_kind in ('CHAT', 'MANUAL', 'IMPORT'));

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.memory_imports enable row level security;
alter table public.memory_candidates enable row level security;

create policy "본인 가져오기만 조회"
  on public.memory_imports for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "본인 가져오기만 생성"
  on public.memory_imports for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "본인 가져오기만 수정"
  on public.memory_imports for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "본인 후보만 조회"
  on public.memory_candidates for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "본인 후보만 생성"
  on public.memory_candidates for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "본인 후보만 수정"
  on public.memory_candidates for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- 삭제 정책은 두지 않는다. 제외한 후보도 REJECTED로 남긴다. 무엇을 안
-- 받아들였는지가 기록으로 남아야 나중에 같은 것을 다시 권하지 않는다.
