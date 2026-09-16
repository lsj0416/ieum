// S3-C 작업 연속성 검증.
//
// 모델 답변의 문장으로 판정하지 않는다. 서버가 무엇을 Context에 넣었는지를
// 본다. 답변 내용으로 채점하면 모델의 기분에 결과가 흔들린다.
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

const results = [];
function check(label, expect, actual, extra = "") {
  const ok = JSON.stringify(expect) === JSON.stringify(actual);
  results.push(ok);
  console.log(`  [${ok ? "OK" : "실패"}] ${label.padEnd(44)} ${JSON.stringify(actual)}${extra ? " · " + extra : ""}`);
}

const password = "Wk-" + randomUUID().slice(0, 12);
const owner = await admin("POST", "/auth/v1/admin/users", { email: process.env.TEST_EMAIL, password, email_confirm: true });
const other = await admin("POST", "/auth/v1/admin/users", { email: `wk-other-${Date.now()}@example.com`, password, email_confirm: true });

try {
  const session = await (await fetch(`${U}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: PUB, "Content-Type": "application/json" },
    body: JSON.stringify({ email: process.env.TEST_EMAIL, password }),
  })).json();
  const cookie = `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  const api = (path, init = {}) => fetch(`${APP}${path}`, {
    ...init, headers: { "Content-Type": "application/json", cookie, ...(init.headers ?? {}) },
  });

  // 대화를 보내 start 사건의 usedWork를 읽는다. 답변 내용은 보지 않는다.
  async function ask(content, conversationId) {
    const res = await api("/api/chat", {
      method: "POST", body: JSON.stringify({ content, clientRequestId: randomUUID(), conversationId }),
    });
    const reader = res.body.getReader(); const dec = new TextDecoder();
    let buf = "", start = null;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const raw = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!raw) continue;
        const e = JSON.parse(raw);
        if (e.type === "start") start = e;
      }
    }
    return start;
  }

  console.log("\n== 일 만들기 ==");
  check("비로그인", 401, (await fetch(`${APP}/api/work`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "x" }) })).status);
  check("빈 제목", 400, (await api("/api/work", { method: "POST", body: JSON.stringify({ title: " " }) })).status);

  const a = await (await api("/api/work", { method: "POST", body: JSON.stringify({ title: "ieum 개발", nextAction: "S3-C 구현" }) })).json();
  const b = await (await api("/api/work", { method: "POST", body: JSON.stringify({ title: "Kafka 공부", nextAction: "파티션 정리" }) })).json();
  check("일 2개", 2, (await (await api("/api/work")).json()).items.length);

  console.log("\n== E02 진행 중인 일이 Context에 들어간다 ==");
  const first = await ask("다음은 뭐 하면 되지?");
  const conv = first.conversationId;
  check("일 2개 전달", 2, first.usedWork.length);
  check("제목이 전달됨", true, first.usedWork.some((w) => w.title === "ieum 개발"));

  console.log("\n== 결정 기록 ==");
  const d1 = await (await api(`/api/work/${a.id}/decisions`, {
    method: "POST", body: JSON.stringify({ decision: "대화 목록을 주제보다 먼저 만든다", reason: "검증 범위를 좁히려고" }),
  })).json();
  check("결정 기록", true, typeof d1.id === "string");

  const d2 = await (await api(`/api/work/${a.id}/decisions`, {
    method: "POST", body: JSON.stringify({ decision: "주제는 구간에 연결한다", supersedesId: d1.id }),
  })).json();
  check("대체 결정 기록", true, typeof d2.id === "string");
  const decisions = await admin("GET", `/rest/v1/work_decisions?work_item_id=eq.${a.id}&select=decision,status&order=created_at`);
  check("두 결정이 모두 남음", 2, decisions.length);
  check("이전 결정은 SUPERSEDED", "SUPERSEDED", decisions[0].status);
  check("이전 내용도 보존", "대화 목록을 주제보다 먼저 만든다", decisions[0].decision);

  console.log("\n== E03 완료한 일은 다시 권하지 않는다 ==");
  check("완료 처리", 200, (await api(`/api/work/${b.id}`, { method: "PATCH", body: JSON.stringify({ status: "DONE" }) })).status);
  const done = await admin("GET", `/rest/v1/work_items?id=eq.${b.id}&select=status,next_action,completed_at`);
  check("상태 DONE", "DONE", done[0].status);
  check("다음 행동이 비워짐", null, done[0].next_action, "끝난 일을 다시 권하지 않기 위함");

  const after = await ask("다음은?", conv);
  check("Context에 1개만 전달", 1, after.usedWork.length);
  check("완료한 일은 빠짐", false, after.usedWork.some((w) => w.title === "Kafka 공부"));
  check("목록에서도 빠짐", 1, (await (await api("/api/work")).json()).items.length);
  check("완료 포함 조회하면 2개", 2, (await (await api("/api/work?done=1")).json()).items.length);

  console.log("\n== E09 오래된 상태 ==");
  // 마지막 확인이 한 달 전인 일을 만든다. Context에 확인 시점이 붙어야 한다.
  const stale = (await admin("POST", "/rest/v1/work_items", {
    owner_id: owner.id, title: "오래된 일", next_action: "확인 필요",
    last_confirmed_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
  }))[0];
  check("오래된 일 준비", true, typeof stale.id === "string");
  const withStale = await ask("상황 정리해줘", conv);
  check("오래된 일도 전달", true, withStale.usedWork.some((w) => w.title === "오래된 일"));

  console.log("\n== 소유권 ==");
  const otherTopic = (await admin("POST", "/rest/v1/topics", { owner_id: other.id, title: "남의 주제" }))[0];
  const forged = await admin("POST", "/rest/v1/work_items", { owner_id: owner.id, title: "위조", topic_id: otherTopic.id });
  check("남의 주제 연결 거절", true, typeof forged?.message === "string" && forged.message.includes("소유자"), forged?.message?.slice(0, 24));
  check("없는 일 수정", 404, (await api(`/api/work/${randomUUID()}`, { method: "PATCH", body: JSON.stringify({ status: "DONE" }) })).status);
  check("잘못된 상태 값", 400, (await api(`/api/work/${a.id}`, { method: "PATCH", body: JSON.stringify({ status: "취소" }) })).status);
} finally {
  await admin("DELETE", `/auth/v1/admin/users/${owner.id}`);
  await admin("DELETE", `/auth/v1/admin/users/${other.id}`);
  console.log("\n임시 계정 삭제 완료");
}

const failed = results.filter((r) => !r).length;
console.log(`\n총 ${results.length}건 중 ${results.length - failed}건 통과`);
process.exit(failed ? 1 : 0);
