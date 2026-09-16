-- S3-A · 대화 제목과 보관
--
-- 제목은 첫 메시지에서 자동으로 만든다. 사용자가 직접 바꾸면 그 뒤로는
-- 자동 생성이 덮어쓰지 않아야 한다. 어느 쪽이 붙인 이름인지 구분이 없으면
-- 사용자가 지은 이름이 조용히 사라진다.

alter table public.conversations
  add column title_source text not null default 'AUTO'
    check (title_source in ('AUTO', 'USER'));

-- 목록에서 감추는 것과 원문을 지우는 것은 다르다. 이번 단계에서는 감추기만
-- 만든다. 삭제 기능은 억지로 붙이지 않는다(05 4.1절).
alter table public.conversations
  add column archived_at timestamptz;

-- 목록은 "보관하지 않은 내 대화를 최근순"으로 읽는다.
create index conversations_owner_active_idx
  on public.conversations (owner_id, updated_at desc)
  where archived_at is null;
