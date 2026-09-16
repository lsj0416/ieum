-- S1-01 · 대화와 메시지 스키마
--
-- 이 프로젝트는 브라우저가 Supabase DB API를 직접 호출할 수 있는 구조다.
-- publishable 키는 번들에 그대로 들어가므로, 접근을 막는 것은 애플리케이션
-- 코드가 아니라 아래 RLS 정책이다. 정책 없이 테이블만 만들면 누구나 읽는다.

-- ---------------------------------------------------------------------------
-- updated_at 자동 갱신
-- ---------------------------------------------------------------------------

-- search_path를 비워 함수가 호출자의 스키마 설정에 휘둘리지 않게 한다.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- conversations
-- ---------------------------------------------------------------------------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  -- 계정이 지워지면 대화도 함께 사라진다.
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 목록 화면은 "내 대화를 최근 갱신순"으로 읽는다.
create index conversations_owner_updated_idx
  on public.conversations (owner_id, updated_at desc);

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,

  -- 순서는 전역 시퀀스로 매긴다. 대화별 번호를 직접 계산하면 동시 삽입에서
  -- 같은 번호가 나올 수 있다. 전역 증가값은 대화 안에서도 순서가 보장된다.
  seq bigint generated always as identity,

  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,

  -- 생성 상태를 명시한다. 실패한 답변을 완료로 취급하지 않기 위한 것이다.
  status text not null default 'completed'
    check (status in ('pending', 'completed', 'failed', 'partial')),

  -- 같은 요청이 두 번 도착해도 한 번만 저장되게 하는 키.
  client_request_id text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index messages_conversation_seq_idx
  on public.messages (conversation_id, seq);

-- 같은 대화 안에서 같은 요청 ID는 한 번만 허용한다.
-- 값이 없는 행은 제약 대상이 아니다.
create unique index messages_dedupe_idx
  on public.messages (conversation_id, client_request_id)
  where client_request_id is not null;

create trigger messages_set_updated_at
  before update on public.messages
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- 정책 대상을 authenticated로 못박는다. 로그인하지 않은 anon 역할은
-- 어떤 정책에도 해당하지 않으므로 아무것도 읽거나 쓰지 못한다.
create policy "본인 대화만 조회"
  on public.conversations for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "본인 대화만 생성"
  on public.conversations for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "본인 대화만 수정"
  on public.conversations for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "본인 대화만 삭제"
  on public.conversations for delete to authenticated
  using (owner_id = (select auth.uid()));

-- 메시지의 소유권은 대화를 통해 판단한다. owner_id를 메시지에 복제하면
-- 두 값이 어긋날 수 있고, 어긋나는 순간 정책이 거짓말을 한다.
create policy "본인 대화의 메시지만 조회"
  on public.messages for select to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.owner_id = (select auth.uid())
    )
  );

create policy "본인 대화의 메시지만 생성"
  on public.messages for insert to authenticated
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.owner_id = (select auth.uid())
    )
  );

create policy "본인 대화의 메시지만 수정"
  on public.messages for update to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.owner_id = (select auth.uid())
    )
  );

create policy "본인 대화의 메시지만 삭제"
  on public.messages for delete to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.owner_id = (select auth.uid())
    )
  );
