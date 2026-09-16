// S3-B 주제·구간 검증. 05의 T05·T07과 8절 소유권 규칙을 본다.
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const U = env.NEXT_PUBLIC_SUPABASE_URL, PUB = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SEC = env.SUPABASE_SECRET_KEY;
const APP = process.env.APP_URL ?? "http://localhost:3000";
const ref = new URL(U).hostname.split(".")[0];

const admin = (m, p, b) => fetch(U + p, {
  method: m,
  headers: { apikey: SEC, Authorization: `Bearer ${SEC}`, "Content-Type": "application/json", Prefer: "return=representation" },
  body: b ? JSON.stringify(b) : undefined,
}).then(async (r) => (r.status === 204 ? {} : r.json().catch(() => ({}))));

const cookieFor = (s) => `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(s)).toString("base64url")}`;
const results = [];
function check(label, expect, actual, extra = "") {
  const ok = JSON.stringify(expect) === JSON.stringify(actual);
  results.push(ok);
  console.log(`  [${ok ? "OK" : "실패"}] ${label.padEnd(44)} ${JSON.stringify(actual)}${extra ? " · " + extra : ""}`);
}

const password = "Tp-" + randomUUID().slice(0, 12);
const owner = await admin("POST", "/auth/v1/admin/users", { email: process.env.TEST_EMAIL, password, email_confirm: true });
const other = await admin("POST", "/auth/v1/admin/users", { email: `tp-other-${Date.now()}@example.com`, password, email_confirm: true });

try {
  const login = (email) => fetch(`${U}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: PUB, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then((r) => r.json());
  const cookie = cookieFor(await login(process.env.TEST_EMAIL));
  const api = (path, init = {}) => fetch(`${APP}${path}`, {
    ...init, headers: { "Content-Type": "application/json", cookie, ...(init.headers ?? {}) },
  });

  // 대화 하나에 두 주제가 섞인 상황을 만든다(T05).
  const conv = (await admin("POST", "/rest/v1/conversations", { owner_id: owner.id, title: "섞인 대화" }))[0];
  const msgs = [];
  for (const content of ["Kafka 공부 얘기", "Kafka 파티션 질문", "점심 뭐 먹지", "국밥 어때"]) {
    msgs.push((await admin("POST", "/rest/v1/messages", { conversation_id: conv.id, role: "user", content }))[0]);
  }

  console.log("\n== 주제 만들기 ==");
  check("비로그인", 401, (await fetch(`${APP}/api/topics`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "x" }) })).status);
  check("빈 이름", 400, (await api("/api/topics", { method: "POST", body: JSON.stringify({ title: "  " }) })).status);

  const kafka = await (await api("/api/topics", { method: "POST", body: JSON.stringify({ title: "Kafka" }) })).json();
  const lunch = await (await api("/api/topics", { method: "POST", body: JSON.stringify({ title: "점심" }) })).json();
  check("주제 2개 생성", 2, (await (await api("/api/topics")).json()).topics.length);
  check("같은 이름 거절", 409, (await api("/api/topics", { method: "POST", body: JSON.stringify({ title: " kafka " }) })).status);

  console.log("\n== T05 한 대화에 두 주제 ==");
  const link = (topicId, from, to) => api(`/api/topics/${topicId}/segments`, {
    method: "POST", body: JSON.stringify({ conversationId: conv.id, startSeq: msgs[from].seq, endSeq: msgs[to].seq }),
  });
  check("앞 구간을 Kafka에", 201, (await link(kafka.id, 0, 1)).status);
  check("뒤 구간을 점심에", 201, (await link(lunch.id, 2, 3)).status);

  const kafkaDetail = await (await api(`/api/topics`)).json();
  check("두 주제 모두 활성", 2, kafkaDetail.topics.length);

  const segs = await admin("GET", `/rest/v1/conversation_segments?conversation_id=eq.${conv.id}&select=start_seq,end_seq&order=start_seq`);
  check("구간 2개", 2, segs.length);
  check("구간이 겹치지 않음", true, segs[0].end_seq < segs[1].start_seq);

  const stillThere = await admin("GET", `/rest/v1/messages?conversation_id=eq.${conv.id}&select=id`);
  check("원문은 그대로 4건", 4, stillThere.length);

  console.log("\n== 잘못된 구간 ==");
  check("시작이 끝보다 뒤", 400, (await api(`/api/topics/${kafka.id}/segments`, {
    method: "POST", body: JSON.stringify({ conversationId: conv.id, startSeq: 999, endSeq: 1 }),
  })).status);
  check("메시지 없는 범위", 404, (await api(`/api/topics/${kafka.id}/segments`, {
    method: "POST", body: JSON.stringify({ conversationId: conv.id, startSeq: 999999, endSeq: 999999 }),
  })).status);
  check("없는 주제", 404, (await api(`/api/topics/${randomUUID()}/segments`, {
    method: "POST", body: JSON.stringify({ conversationId: conv.id, startSeq: msgs[0].seq, endSeq: msgs[0].seq }),
  })).status);

  console.log("\n== T07 이름 변경과 연결 해제 ==");
  const renamed = await api(`/api/topics/${kafka.id}`, { method: "PATCH", body: JSON.stringify({ title: "Kafka 운영" }) });
  check("이름 변경", 200, renamed.status);
  const afterRename = await admin("GET", `/rest/v1/topic_segments?topic_id=eq.${kafka.id}&select=segment_id`);
  check("이름을 바꿔도 연결 유지", 1, afterRename.length, "Topic ID 보존");

  const segId = afterRename[0].segment_id;
  check("연결 해제", 200, (await api(`/api/topics/${kafka.id}/segments?segmentId=${segId}`, { method: "DELETE" })).status);
  const excluded = await admin("GET", `/rest/v1/topic_segments?topic_id=eq.${kafka.id}&select=decision,reason`);
  check("행은 남고 EXCLUDE로 기록", "EXCLUDE", excluded[0].decision, "자동 재연결 금지 근거");
  check("원문은 여전히 남음", 4, (await admin("GET", `/rest/v1/messages?conversation_id=eq.${conv.id}&select=id`)).length);

  console.log("\n== 주제 감추기는 삭제가 아니다 ==");
  check("감추기", 200, (await api(`/api/topics/${lunch.id}`, { method: "DELETE" })).status);
  check("목록에서 빠짐", 1, (await (await api("/api/topics")).json()).topics.length);
  const archived = await admin("GET", `/rest/v1/topics?id=eq.${lunch.id}&select=status,hidden_at`);
  check("행은 남고 ARCHIVED", "ARCHIVED", archived[0].status);
  check("연결도 남아 있음", 1, (await admin("GET", `/rest/v1/topic_segments?topic_id=eq.${lunch.id}&select=segment_id`)).length);

  console.log("\n== 소유권 (05 8절) ==");
  const otherToken = (await login(other.email)).access_token;
  const asOther = (path, init = {}) => fetch(U + path, {
    ...init, headers: { apikey: PUB, Authorization: `Bearer ${otherToken}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers ?? {}) },
  });
  check("남의 주제 조회 0건", 0, (await (await asOther("/rest/v1/topics?select=id")).json()).length);
  check("남의 구간 조회 0건", 0, (await (await asOther("/rest/v1/conversation_segments?select=id")).json()).length);

  // 남의 대화 구간을 자기 주제에 붙이려는 시도. 트리거가 막아야 한다.
  const otherTopic = (await admin("POST", "/rest/v1/topics", { owner_id: other.id, title: "침입자 주제" }))[0];
  const forged = await admin("POST", "/rest/v1/topic_segments", { topic_id: otherTopic.id, segment_id: segs[0] ? (await admin("GET", `/rest/v1/conversation_segments?conversation_id=eq.${conv.id}&select=id`))[0].id : null });
  check("소유자 다른 연결 거절", true, typeof forged?.message === "string" && forged.message.includes("소유자"), forged?.message?.slice(0, 30));
} finally {
  await admin("DELETE", `/auth/v1/admin/users/${owner.id}`);
  await admin("DELETE", `/auth/v1/admin/users/${other.id}`);
  console.log("\n임시 계정 삭제 완료");
}

const failed = results.filter((r) => !r).length;
console.log(`\n총 ${results.length}건 중 ${results.length - failed}건 통과`);
process.exit(failed ? 1 : 0);
