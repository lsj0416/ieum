-- S4-0 보완 · 잘린 추출 표시
--
-- 실사용에서 긴 글을 가져오다 실패했다(2026-09-18). 모델 답변이 출력
-- 상한에 걸려 JSON이 중간에 끊겼고, 그것을 파싱하지 못해 뽑은 것을 전부
-- 버렸다. 호출 비용은 나갔는데 사용자에게는 오류 한 줄만 남았다.
--
-- 이제는 끊긴 답변에서도 온전한 항목까지는 살린다. 그런데 살렸다는 사실을
-- 알리지 않으면 사용자는 그것이 전부인 줄 안다. 일부만 뽑혔다는 표시를
-- 남겨 검토 화면에서 밝힌다.

alter table public.memory_imports
  add column truncated boolean not null default false;

comment on column public.memory_imports.truncated is
  '모델 답변이 출력 상한에 걸려 잘렸고, 온전한 항목까지만 후보로 만들었다는 표시';
