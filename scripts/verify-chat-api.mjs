// S1-03 대화 API 검증.
//
// 브라우저 대신 세션 쿠키를 직접 만들어 curl과 같은 조건으로 요청한다.
// 쿠키 형식은 @supabase/ssr이 쓰는 것과 같다: base64- + base64url(세션 JSON).
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n")
    .map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SEC = env.SUPABASE_SECRET_KEY;
const APP = process.env.APP_URL ?? "http://localhost:3000";
const ref = new URL(URL_).hostname.split(".")[0];
const MAX_CHUNK = 3180;

const admin = (m, p, b) => fetch(URL_ + p, {
  method: m, headers: { apikey: SEC, Authorization: `Bearer ${SEC}`, "Content-Type": "application/json" },
  body: b ? JSON.stringify(b) : undefined,
}).then(async (r) => (r.status === 204 ? {} : r.json().catch(() => ({}))));

function cookieHeader(session) {
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const name = `sb-${ref}-auth-token`;
  if (value.length <= MAX_CHUNK) return `${name}=${value}`;
  const parts = [];
  for (let i = 0, n = 0; i < value.length; i += MAX_CHUNK, n++) {
    parts.push(`${name}.${n}=${value.slice(i, i + MAX_CHUNK)}`);
  }
  return parts.join("; ");
}

const results = [];
function check(label, expect, actual, extra = "") {
  const ok = expect === actual;
  results.push(ok);
  console.log(`  [${ok ? "OK" : "실패"}] ${label.padEnd(44)} ${actual}${extra ? " · " + extra : ""}`);
}

const email = process.env.TEST_EMAIL ?? `s1-03-${Date.now()}@example.com`;
const password = "Chat-" + randomUUID().slice(0, 12);
const user = await admin("POST", "/auth/v1/admin/users", { email, password, email_confirm: true });

try {
  const session = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: PUB, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then((r) => r.json());

  const cookie = cookieHeader(session);
  const post = (body, useCookie = true) => fetch(`${APP}/api/chat`, {
    method: "POST", redirect: "manual",
    headers: { "Content-Type": "application/json", ...(useCookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });

  console.log("\n== 인증과 입력 검증 ==");
  check("비로그인 요청", 401, (await post({ content: "안녕", clientRequestId: randomUUID() }, false)).status);
  check("빈 메시지", 400, (await post({ content: "   ", clientRequestId: randomUUID() })).status);
  check("clientRequestId 없음", 400, (await post({ content: "안녕" })).status);
  check("conversationId 형식 오류", 400,
    (await post({ content: "안녕", clientRequestId: randomUUID(), conversationId: "not-a-uuid" })).status);

  console.log("\n== 정상 대화 (스트리밍) ==");

  // NDJSON 스트림을 읽어 사건 목록과 최종 답변을 만든다.
  async function readStream(res) {
    const events = [];
    let answer = "";
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const raw = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!raw) continue;
        const e = JSON.parse(raw);
        events.push(e);
        if (e.type === "delta") answer += e.text;
        if (e.type === "replay") answer = e.answer;
      }
    }
    return { events, answer };
  }

  const reqId = randomUUID();
  const first = await post({ content: "한 문장으로만 답해라: 3 곱하기 4는?", clientRequestId: reqId });
  const { events, answer } = await readStream(first);
  check("첫 요청", 200, first.status);
  check("start 사건 수신", 1, events.filter((e) => e.type === "start").length);
  check("delta 사건이 2개 이상", true, events.filter((e) => e.type === "delta").length >= 2,
    `delta ${events.filter((e) => e.type === "delta").length}개`);
  check("done status", "completed", events.find((e) => e.type === "done")?.status);
  console.log(`         답변: ${JSON.stringify(answer).slice(0, 70)}`);
  const convId = events.find((e) => e.type === "start")?.conversationId;

  console.log("\n== 중복 방지 ==");
  const retry = await post({ content: "한 문장으로만 답해라: 3 곱하기 4는?", clientRequestId: reqId, conversationId: convId });
  const replay = await readStream(retry);
  check("같은 ID·같은 내용 재시도", 200, retry.status);
  check("replay 사건으로 응답", true, replay.events.some((e) => e.type === "replay"));
  check("재시도가 같은 답변 반환", true, replay.answer === answer);

  const conflict = await post({ content: "다른 내용이다", clientRequestId: reqId, conversationId: convId });
  check("같은 ID·다른 내용", 409, conflict.status, (await conflict.json()).code);

  console.log("\n== 끊긴 pending 복구 ==");
  // 프로세스가 죽어 pending이 남은 상황을 만든다.
  //
  // updated_at은 UPDATE 트리거가 now()로 덮으므로 나중에 과거로 돌릴 수 없다.
  // INSERT 시점에 직접 넣는다. 이 트리거 덕분에 스트리밍 중 주기적으로
  // 내용을 저장하는 살아 있는 생성은 stale로 오판되지 않는다.
  await admin("POST", "/rest/v1/messages", {
    conversation_id: convId, role: "assistant", content: "", status: "pending",
    updated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  });
  const afterStale = await post({ content: "복구 후 첫 메시지", clientRequestId: randomUUID(), conversationId: convId });
  const recovered = await readStream(afterStale);
  check("오래된 pending을 지나 진행됨", 200, afterStale.status);
  check("복구 후 정상 응답", "completed", recovered.events.find((e) => e.type === "done")?.status);
  const cleaned = await admin("GET", `/rest/v1/messages?conversation_id=eq.${convId}&status=eq.failed&select=id`);
  check("끊긴 pending이 failed로 정리됨", true, Array.isArray(cleaned) && cleaned.length >= 1);

  console.log("\n== 저장 상태 ==");
  const rows = await admin("GET", `/rest/v1/messages?conversation_id=eq.${convId}&select=role,status,content&order=seq`);
  const rowList = Array.isArray(rows) ? rows : [];
  check("저장된 메시지 상태", true, rowList.filter((r) => r.status === "completed").length === 4,
    rowList.map((r) => `${r.role}:${r.status}`).join(", "));
  const convs = await admin("GET", `/rest/v1/conversations?owner_id=eq.${user.id}&select=id`);
  check("대화 수 (중복 생성 없음)", 1, Array.isArray(convs) ? convs.length : -1);
  const calls = await admin("GET", `/rest/v1/model_calls?owner_id=eq.${user.id}&select=status`);
  check("모델 호출 기록 (재시도로 늘지 않음)", 2, Array.isArray(calls) ? calls.length : -1);
} finally {
  await admin("DELETE", `/auth/v1/admin/users/${user.id}`);
  console.log("\n임시 계정 삭제 완료");
}

const failed = results.filter((r) => !r).length;
console.log(`\n총 ${results.length}건 중 ${results.length - failed}건 통과`);
process.exit(failed ? 1 : 0);
