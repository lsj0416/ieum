// S2-03 기억 Context 반영 검증.
//
// 핵심은 "지운 기억이 되살아나지 않는가"다. 모델 답변의 내용으로 판정하면
// 모델의 기분에 결과가 흔들린다. 그래서 서버가 무엇을 전달했는지를 본다.
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
  console.log(`  [${ok ? "OK" : "실패"}] ${label.padEnd(42)} ${JSON.stringify(actual)}${extra ? " · " + extra : ""}`);
}

const password = "Ctx-" + randomUUID().slice(0, 12);
const email = process.env.TEST_EMAIL;
const owner = await admin("POST", "/auth/v1/admin/users", { email, password, email_confirm: true });

try {
  const session = await (await fetch(`${U}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: PUB, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })).json();
  const cookie = `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;

  // 답변 내용은 보지 않는다. start 사건의 usedMemories만 본다.
  async function ask(content, conversationId) {
    const res = await fetch(`${APP}/api/chat`, {
      method: "POST", headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ content, clientRequestId: randomUUID(), conversationId }),
    });
    const reader = res.body.getReader(); const dec = new TextDecoder();
    let buf = "", start = null, done = null;
    for (;;) {
      const { done: d, value } = await reader.read(); if (d) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const raw = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!raw) continue;
        const e = JSON.parse(raw);
        if (e.type === "start") start = e;
        if (e.type === "done") done = e.status;
      }
    }
    return { start, done };
  }

  const addMemory = (kind, content) =>
    fetch(`${APP}/api/memories`, {
      method: "POST", headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ kind, content, quote: `근거: ${content}`, sourceMessageId: null }),
    }).then((r) => r.json());

  console.log("\n== 기억 없이 대화 ==");
  const first = await ask("안녕");
  check("기억 0개 전달", 0, first.start.usedMemories.length);
  const convId = first.start.conversationId;

  console.log("\n== 기억 등록 후 ==");
  const memA = await addMemory("FACT", "매운 음식을 못 먹는다");
  const memB = await addMemory("GOAL", "Java 백엔드 취업을 준비한다");
  const second = await ask("점심 추천", convId);
  check("기억 2개 전달", 2, second.start.usedMemories.length);
  check("내용이 그대로 전달됨", true,
    second.start.usedMemories.some((m) => m.content === "매운 음식을 못 먹는다"));
  check("종류도 함께 전달됨", true, second.start.usedMemories.every((m) => typeof m.kind === "string"));

  console.log("\n== 삭제한 기억은 전달되지 않는다 ==");
  await fetch(`${APP}/api/memories/${memA.id}?mode=forget`, { method: "DELETE", headers: { cookie } });
  const third = await ask("점심 다시 추천", convId);
  check("기억 1개만 전달", 1, third.start.usedMemories.length);
  check("지운 기억은 빠짐", false,
    third.start.usedMemories.some((m) => m.content === "매운 음식을 못 먹는다"));

  console.log("\n== 정정한 기억은 새 내용만 전달된다 ==");
  const listed = await (await fetch(`${APP}/api/memories`, { headers: { cookie } })).json();
  const target = listed.memories.find((m) => m.id === memB.id);
  await fetch(`${APP}/api/memories/${memB.id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ kind: "GOAL", content: "Kafka 운영 역량을 키운다", quote: "취업했다", expectedVersion: target.version }),
  });
  const fourth = await ask("공부 뭐부터 할까", convId);
  check("여전히 1개", 1, fourth.start.usedMemories.length);
  check("새 내용만 전달", "Kafka 운영 역량을 키운다", fourth.start.usedMemories[0].content);

  console.log("\n== 제외된 출처 메시지는 최근 대화에서 빠진다 ==");
  const msgs = await admin("GET", `/rest/v1/messages?conversation_id=eq.${convId}&select=id,role,content&order=seq`);
  const victim = msgs.find((m) => m.role === "user" && m.content === "점심 추천");
  await admin("PATCH", `/rest/v1/messages?id=eq.${victim.id}`, { excluded_from_context: true });
  const excluded = await admin("GET", `/rest/v1/messages?id=eq.${victim.id}&select=excluded_from_context`);
  check("제외 표시됨", true, excluded[0].excluded_from_context);
  const fifth = await ask("계속 이야기하자", convId);
  check("제외 후에도 정상 응답", "completed", fifth.done);
} finally {
  await admin("DELETE", `/auth/v1/admin/users/${owner.id}`);
  console.log("\n임시 계정 삭제 완료");
}

const failed = results.filter((r) => !r).length;
console.log(`\n총 ${results.length}건 중 ${results.length - failed}건 통과`);
process.exit(failed ? 1 : 0);
