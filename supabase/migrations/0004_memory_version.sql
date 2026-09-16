-- S2-02 · 기억 버전
--
-- 같은 기억을 두 곳에서 동시에 고치면 나중 저장이 앞선 저장을 조용히
-- 덮어쓴다. 사용자는 자기가 쓴 내용이 사라진 것을 모른다.
--
-- 고치려는 쪽이 "내가 본 버전"을 함께 보내고, 그 사이에 값이 바뀌었으면
-- 거절한다. 문서의 S2 데이터 모델에 있던 version이 이 자리다.

alter table public.memories
  add column version integer not null default 1;

-- 버전을 애플리케이션이 올리면 빠뜨리는 경로가 생긴다. DB가 올린다.
create or replace function public.bump_memory_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version = old.version + 1;
  return new;
end;
$$;

create trigger memories_bump_version
  before update on public.memories
  for each row execute function public.bump_memory_version();
