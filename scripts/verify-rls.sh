#!/usr/bin/env bash
# S1-01 RLS 검증.
#
# 임시 사용자 두 명을 만들어 실제 요청을 보내본다. 정책을 읽어서 맞다고
# 판단하지 않고, 거절되어야 할 요청이 실제로 거절되는지 확인한다.
# 검증이 끝나면 만든 사용자와 데이터를 지운다.
set -euo pipefail
cd "$(dirname "$0")/.."

eval "$(python3 -c "
import pathlib
for line in pathlib.Path('.env.local').read_text().splitlines():
    s = line.strip()
    if s and not s.startswith('#') and '=' in s:
        k, _, v = s.partition('=')
        if k.strip() in ('NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY'):
            print(f\"export {k.strip()}='{v.strip()}'\")
")"

URL="$NEXT_PUBLIC_SUPABASE_URL"
PUB="$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
SEC="$SUPABASE_SECRET_KEY"
PASS="Rls-$(openssl rand -hex 8)"
declare -a CREATED_IDS=()

cleanup() {
  for id in "${CREATED_IDS[@]:-}"; do
    [ -n "$id" ] && curl -s -X DELETE -H "apikey: $SEC" -H "Authorization: Bearer $SEC" \
      "$URL/auth/v1/admin/users/$id" -o /dev/null
  done
}
trap cleanup EXIT

make_user() {
  local email="$1"
  curl -s -X POST -H "apikey: $SEC" -H "Authorization: Bearer $SEC" -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$PASS\",\"email_confirm\":true}" \
    "$URL/auth/v1/admin/users" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])"
}

token_for() {
  local email="$1"
  curl -s -X POST -H "apikey: $PUB" -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$PASS\"}" \
    "$URL/auth/v1/token?grant_type=password" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])"
}

# $1 라벨, $2 기대(allow|deny), $3.. curl 인자
check() {
  local label="$1" expect="$2"; shift 2
  local code; code=$(curl -s -o /tmp/rls-body.txt -w "%{http_code}" "$@")
  local rows="-"
  if [ "$code" = "200" ]; then
    rows=$(python3 -c "
import json,sys
try:
    d=json.load(open('/tmp/rls-body.txt'))
    print(len(d) if isinstance(d,list) else 1)
except Exception: print('?')
")
  fi
  local ok
  if [ "$expect" = "allow" ]; then
    [ "$code" = "200" ] || [ "$code" = "201" ] && ok="OK" || ok="실패"
  else
    # 거절은 403/401이거나, 200이지만 정책에 걸려 0건인 경우다.
    if [ "$code" = "403" ] || [ "$code" = "401" ] || { [ "$code" = "200" ] && [ "$rows" = "0" ]; }; then
      ok="OK"; else ok="실패"
    fi
  fi
  printf "  [%s] %-46s HTTP %s, 행 %s\n" "$ok" "$label" "$code" "$rows"
}

EMAIL_A="rls-a-$(date +%s)@example.com"
EMAIL_B="rls-b-$(date +%s)@example.com"
ID_A=$(make_user "$EMAIL_A"); CREATED_IDS+=("$ID_A")
ID_B=$(make_user "$EMAIL_B"); CREATED_IDS+=("$ID_B")
TOK_A=$(token_for "$EMAIL_A")
TOK_B=$(token_for "$EMAIL_B")

echo "임시 사용자 2명 생성 완료"
echo

# A가 자기 대화를 만든다
CONV=$(curl -s -X POST -H "apikey: $PUB" -H "Authorization: Bearer $TOK_A" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d "{\"owner_id\":\"$ID_A\",\"title\":\"RLS 검증\"}" \
  "$URL/rest/v1/conversations" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
echo "A의 대화 생성: $CONV"
echo

echo "== 소유자 본인 (허용되어야 함) =="
check "A: 자기 대화 조회" allow -H "apikey: $PUB" -H "Authorization: Bearer $TOK_A" "$URL/rest/v1/conversations?select=id"
check "A: 자기 대화에 메시지 생성" allow -X POST -H "apikey: $PUB" -H "Authorization: Bearer $TOK_A" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d "{\"conversation_id\":\"$CONV\",\"role\":\"user\",\"content\":\"안녕\"}" "$URL/rest/v1/messages"
check "A: 자기 메시지 조회" allow -H "apikey: $PUB" -H "Authorization: Bearer $TOK_A" "$URL/rest/v1/messages?select=id"
echo

echo "== 비인증 anon (거절되어야 함) =="
check "anon: 대화 조회" deny -H "apikey: $PUB" "$URL/rest/v1/conversations?select=id"
check "anon: 메시지 조회" deny -H "apikey: $PUB" "$URL/rest/v1/messages?select=id"
check "anon: 대화 생성" deny -X POST -H "apikey: $PUB" -H "Content-Type: application/json" \
  -d "{\"owner_id\":\"$ID_A\",\"title\":\"침입\"}" "$URL/rest/v1/conversations"
echo

echo "== 다른 로그인 사용자 B (거절되어야 함) =="
check "B: A의 대화 조회" deny -H "apikey: $PUB" -H "Authorization: Bearer $TOK_B" "$URL/rest/v1/conversations?select=id"
check "B: A의 메시지 조회" deny -H "apikey: $PUB" -H "Authorization: Bearer $TOK_B" "$URL/rest/v1/messages?select=id"
check "B: A의 대화에 메시지 삽입" deny -X POST -H "apikey: $PUB" -H "Authorization: Bearer $TOK_B" \
  -H "Content-Type: application/json" \
  -d "{\"conversation_id\":\"$CONV\",\"role\":\"user\",\"content\":\"침입\"}" "$URL/rest/v1/messages"
check "B: 소유자를 A로 위조해 대화 생성" deny -X POST -H "apikey: $PUB" -H "Authorization: Bearer $TOK_B" \
  -H "Content-Type: application/json" \
  -d "{\"owner_id\":\"$ID_A\",\"title\":\"위조\"}" "$URL/rest/v1/conversations"
echo
echo "검증 종료. 임시 사용자와 데이터를 삭제한다."
