-- S3-B · 주제와 구간
--
-- Conversation은 시간순 원문이고 Topic은 여러 흐름의 관련 구간을 모으는
-- 공간이다(D41). 대화를 나눠도 주제는 여러 대화에 걸쳐 모이므로 대화
-- 분리가 맥락 단절을 뜻하지 않는다.
--
-- Topic은 Work Item이 아니다. Kafka는 주제이고 Kafka 면접 정리는 완료
-- 가능한 작업이다(D42). work_items는 S3-C에서 만든다.

-- ---------------------------------------------------------------------------
-- topics
-- ---------------------------------------------------------------------------

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null,

  -- 사람이 직접 만든 것과 모델이 제안한 것을 구분한다. 자동 발견은 S4-A이며
  -- 지금은 MANUAL만 쓴다. 모델이 만들었다고 사용자 관심이 확정되지 않는다(D44).
  source text not null default 'MANUAL' check (source in ('MANUAL', 'AUTO')),

  -- CANDIDATE: 모델이 제안했으나 아직 노출하지 않는다
  -- ACTIVE: 목록과 지도에 보인다
  -- ARCHIVED: 감춘다. 삭제가 아니다
  status text not null default 'ACTIVE' check (status in ('CANDIDATE', 'ACTIVE', 'ARCHIVED')),

  hidden_at timestamptz,
  last_activity_at timestamptz not null default now(),
  version integer not null default 1,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 같은 이름의 주제를 두 번 만들지 않는다. 대소문자와 앞뒤 공백은 무시한다.
create unique index topics_owner_title_idx
  on public.topics (owner_id, lower(btrim(title)));

create index topics_owner_status_idx
  on public.topics (owner_id, status, last_activity_at desc);

create trigger topics_set_updated_at
  before update on public.topics
  for each row execute function public.set_updated_at();

create trigger topics_bump_version
  before update on public.topics
  for each row execute function public.bump_memory_version();

-- ---------------------------------------------------------------------------
-- conversation_segments
-- ---------------------------------------------------------------------------

-- 한 대화 안에서 특정 주제가 이어진 메시지 구간.
--
-- 구간을 두는 이유는 대화 전체를 한 주제로 묶지 않기 위해서다. 하나의
-- 대화에 두 주제가 섞여도 각 구간만 연결된다(05 T05).
create table public.conversation_segments (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,

  -- 구간의 양끝. seq는 전역 시퀀스이므로 범위를 읽을 때 반드시
  -- conversation_id 조건을 함께 쓴다(05 8절).
  start_seq bigint not null,
  end_seq bigint not null,

  -- 어떤 버전의 규칙으로 만든 구간인지. 규칙이 바뀌면 재계산 대상을 고른다.
  source_version integer not null default 1,

  created_at timestamptz not null default now(),

  -- 시작이 끝보다 뒤면 구간이 아니다. 앱이 실수해도 DB가 막는다.
  constraint conversation_segments_range check (start_seq <= end_seq)
);

create index conversation_segments_conversation_idx
  on public.conversation_segments (conversation_id, start_seq);

-- ---------------------------------------------------------------------------
-- topic_segments
-- ---------------------------------------------------------------------------

create table public.topic_segments (
  topic_id uuid not null references public.topics (id) on delete cascade,
  segment_id uuid not null references public.conversation_segments (id) on delete cascade,

  source text not null default 'MANUAL' check (source in ('MANUAL', 'AUTO')),

  -- EXCLUDE는 "이 구간은 이 주제가 아니다"라는 사용자 판단이다. 자동 분류가
  -- 나중에 같은 구간을 다시 붙이지 못하게 막는 override 기록이다(05 4.3절).
  decision text not null default 'INCLUDE' check (decision in ('INCLUDE', 'EXCLUDE')),

  reason text,
  created_at timestamptz not null default now(),

  primary key (topic_id, segment_id)
);

-- ---------------------------------------------------------------------------
-- conversation의 선택 주제
-- ---------------------------------------------------------------------------

-- 이 대화의 기본 범위일 뿐 분류의 진실이 아니다. 대화 전체가 항상 그
-- 주제라고 취급하지 않는다(05 3절).
alter table public.conversations
  add column topic_id uuid references public.topics (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 소유권 검증
-- ---------------------------------------------------------------------------

-- 본인 Topic에 타인의 대화 구간을 붙이는 것도 막아야 한다(05 8절).
-- RLS만으로는 "양쪽 다 내 것인가"를 표현하기 번거로워 트리거로 확인한다.
create or replace function public.assert_topic_segment_same_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  topic_owner uuid;
  segment_owner uuid;
begin
  select owner_id into topic_owner from public.topics where id = new.topic_id;

  select c.owner_id into segment_owner
  from public.conversation_segments s
  join public.conversations c on c.id = s.conversation_id
  where s.id = new.segment_id;

  if topic_owner is null or segment_owner is null or topic_owner <> segment_owner then
    raise exception '주제와 구간의 소유자가 다르다';
  end if;

  return new;
end;
$$;

create trigger topic_segments_same_owner
  before insert or update on public.topic_segments
  for each row execute function public.assert_topic_segment_same_owner();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.topics enable row level security;
alter table public.conversation_segments enable row level security;
alter table public.topic_segments enable row level security;

create policy "본인 주제만 조회" on public.topics
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "본인 주제만 생성" on public.topics
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "본인 주제만 수정" on public.topics
  for update to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- 구간의 소유권은 대화를 통해 판단한다. owner_id를 복제하면 어긋날 수 있다.
create policy "본인 대화의 구간만 조회" on public.conversation_segments
  for select to authenticated using (
    exists (select 1 from public.conversations c
            where c.id = conversation_id and c.owner_id = (select auth.uid()))
  );
create policy "본인 대화의 구간만 생성" on public.conversation_segments
  for insert to authenticated with check (
    exists (select 1 from public.conversations c
            where c.id = conversation_id and c.owner_id = (select auth.uid()))
  );
create policy "본인 대화의 구간만 삭제" on public.conversation_segments
  for delete to authenticated using (
    exists (select 1 from public.conversations c
            where c.id = conversation_id and c.owner_id = (select auth.uid()))
  );

create policy "본인 주제의 연결만 조회" on public.topic_segments
  for select to authenticated using (
    exists (select 1 from public.topics t
            where t.id = topic_id and t.owner_id = (select auth.uid()))
  );
create policy "본인 주제의 연결만 생성" on public.topic_segments
  for insert to authenticated with check (
    exists (select 1 from public.topics t
            where t.id = topic_id and t.owner_id = (select auth.uid()))
  );
create policy "본인 주제의 연결만 수정" on public.topic_segments
  for update to authenticated using (
    exists (select 1 from public.topics t
            where t.id = topic_id and t.owner_id = (select auth.uid()))
  ) with check (
    exists (select 1 from public.topics t
            where t.id = topic_id and t.owner_id = (select auth.uid()))
  );
create policy "본인 주제의 연결만 삭제" on public.topic_segments
  for delete to authenticated using (
    exists (select 1 from public.topics t
            where t.id = topic_id and t.owner_id = (select auth.uid()))
  );
