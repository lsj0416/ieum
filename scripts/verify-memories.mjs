// S2-01 기억 등록 검증.
//
// 정책과 검증을 읽어서 판단하지 않고 실제 요청을 보낸다.
// 임시 사용자 둘을 만들어 남의 기억에 닿지 못하는 것까지 확인한다.
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

// Prefer: return=representation이 없으면 insert가 빈 본문을 돌려준다.
const admin = (m, p, b) => fetch(U + p, {
  method: m,
  headers: {
    apikey: SEC, Authorization: `Bearer ${SEC}`, "Content-Type": "application/json",
    Prefer: "return=representation",
  },
  body: b ? JSON.stringify(b) : undefined,
}).then(async (r) => (r.status === 204 ? {} : r.json().catch(() => ({}))));

const cookieFor = (session) =>
  `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;

const results = [];
function check(label, expect, actual, extra = "") {
  const ok = JSON.stringify(expect) === JSON.stringify(actual);
  results.push(ok);
  console.log(`  [${ok ? "OK" : "실패"}] ${label.padEnd(40)} ${JSON.stringify(actual)}${extra ? " · " + extra : ""}`);
}

const password = "Mem-" + randomUUID().slice(0, 12);
const ownerEmail = process.env.TEST_EMAIL;
const owner = await admin("POST", "/auth/v1/admin/users", { email: ownerEmail, password, email_confirm: true });
const other = await admin("POST", "/auth/v1/admin/users", { email: `mem-other-${Date.now()}@example.com`, password, email_confirm: true });

try {
  const login = (email) => fetch(`${U}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: PUB, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then((r) => r.json());

  const cookie = cookieFor(await login(ownerEmail));
  const post = (body, c = cookie) => fetch(`${APP}/api/memories`, {
    method: "POST", redirect: "manual",
    headers: { "Content-Type": "application/json", ...(c ? { cookie: c } : {}) },
    body: JSON.stringify(body),
  });

  console.log("\n== 인증과 입력 검증 ==");
  check("비로그인 등록", 401, (await post({ kind: "FACT", content: "a", quote: "b" }, null)).status);
  check("근거 없는 기억", 400, (await post({ kind: "FACT", content: "내용만 있다", quote: "" })).status);
  check("내용 없는 기억", 400, (await post({ kind: "FACT", content: "  ", quote: "근거" })).status);
  check("알 수 없는 kind", 400, (await post({ kind: "HABIT", content: "x", quote: "y" })).status);

  console.log("\n== 정상 등록 ==");
  const created = await post({ kind: "GOAL", content: "Java 백엔드 취업을 준비한다", quote: "현재 목표는 Spring 백엔드 취업 준비야" });
  const body = await created.json();
  check("등록", 201, created.status);
  check("id 반환", true, typeof body.id === "string");

  const listed = await (await fetch(`${APP}/api/memories`, { headers: { cookie } })).json();
  check("목록에 1건", 1, listed.memories.length);
  check("종류 보존", "GOAL", listed.memories[0].kind);
  check("출처는 USER", "USER", listed.memories[0].source);
  check("상태는 ACTIVE", "ACTIVE", listed.memories[0].status);
  check("근거가 함께 저장됨", 1, listed.memories[0].evidence.length);
  check("근거 종류 MANUAL", "MANUAL", listed.memories[0].evidence[0].sourceKind);

  console.log("\n== 다른 사용자 격리 ==");
  // allowlist가 앱 단계에서 먼저 막으므로 API로는 RLS를 확인할 수 없다.
  // DB에 직접 요청해 정책 자체를 시험한다.
  const otherToken = (await login(other.email)).access_token;
  const asOther = (path, init = {}) =>
    fetch(U + path, { ...init, headers: { apikey: PUB, Authorization: `Bearer ${otherToken}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });

  const otherRead = await (await asOther("/rest/v1/memories?select=id")).json();
  check("남의 기억 조회 0건", 0, Array.isArray(otherRead) ? otherRead.length : -1);
  const otherEvidence = await (await asOther("/rest/v1/memory_evidence?select=id")).json();
  check("남의 근거 조회 0건", 0, Array.isArray(otherEvidence) ? otherEvidence.length : -1);

  const forged = await asOther("/rest/v1/memories", {
    method: "POST",
    body: JSON.stringify({ owner_id: owner.id, kind: "FACT", content: "위조", source: "USER" }),
  });
  check("owner_id 위조 생성 거절", 403, forged.status);

  const anon = await fetch(U + "/rest/v1/memories?select=id", { headers: { apikey: PUB } });
  const anonRows = await anon.json();
  check("비인증 조회 0건", 0, Array.isArray(anonRows) ? anonRows.length : -1);

  console.log("\n== 정정 ==");
  const memId = body.id;
  const before = (await (await fetch(`${APP}/api/memories`, { headers: { cookie } })).json()).memories[0];
  check("초기 버전은 1", 1, before.version);

  const patch = (payload) => fetch(`${APP}/api/memories/${memId}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify(payload),
  });

  const stale = await patch({ kind: "GOAL", content: "낡은 버전으로 고친다", quote: "근거", expectedVersion: 99 });
  check("낡은 버전으로 정정 시도", 409, stale.status, (await stale.json()).code);

  const revised = await patch({ kind: "GOAL", content: "Kafka 운영 역량을 키운다", quote: "취업했고 이제 Kafka를 하고 싶어", expectedVersion: before.version });
  check("정정", 200, revised.status);

  const afterRevise = (await (await fetch(`${APP}/api/memories`, { headers: { cookie } })).json()).memories;
  check("활성 기억은 여전히 1건", 1, afterRevise.length);
  check("새 내용이 보인다", "Kafka 운영 역량을 키운다", afterRevise[0].content);
  check("이전 버전으로 이어진다", memId, afterRevise[0].supersedesId);

  const all = await admin("GET", `/rest/v1/memories?owner_id=eq.${owner.id}&select=id,status,content&order=created_at`);
  check("DB에는 두 행이 남는다", 2, all.length);
  check("이전 행은 SUPERSEDED", "SUPERSEDED", all.find((r) => r.id === memId).status);
  check("이전 내용도 남아 있다", "Java 백엔드 취업을 준비한다", all.find((r) => r.id === memId).content);

  console.log("\n== 삭제 ==");
  // 대화 메시지를 만들어 출처로 붙인다. 출처 제외가 실제로 반영되는지 보려면 필요하다.
  const conv = (await admin("POST", "/rest/v1/conversations", { owner_id: owner.id, title: "삭제 검증" }))[0];
  const msg = (await admin("POST", "/rest/v1/messages", { conversation_id: conv.id, role: "user", content: "나는 매운 음식을 못 먹어" }))[0];
  const target = (await admin("POST", "/rest/v1/memories", { owner_id: owner.id, kind: "FACT", content: "매운 음식을 못 먹는다", source: "USER" }))[0];
  await admin("POST", "/rest/v1/memory_evidence", { memory_id: target.id, source_message_id: msg.id, quote: "나는 매운 음식을 못 먹어", source_kind: "CHAT" });

  const del = await fetch(`${APP}/api/memories/${target.id}?mode=with_source`, { method: "DELETE", headers: { cookie } });
  check("출처까지 삭제", 200, del.status);

  const deleted = await admin("GET", `/rest/v1/memories?id=eq.${target.id}&select=status`);
  check("기억은 DELETED (행은 남음)", "DELETED", deleted[0].status);
  const excluded = await admin("GET", `/rest/v1/messages?id=eq.${msg.id}&select=excluded_from_context`);
  check("출처 메시지가 Context에서 제외됨", true, excluded[0].excluded_from_context);

  const visible = (await (await fetch(`${APP}/api/memories`, { headers: { cookie } })).json()).memories;
  check("목록에서 사라짐", 1, visible.length);

  const badMode = await fetch(`${APP}/api/memories/${target.id}?mode=nuke`, { method: "DELETE", headers: { cookie } });
  check("알 수 없는 삭제 방식", 400, badMode.status);

  console.log("\n== DB 직접 확인 (RLS 우회) ==");
  const rows = await admin("GET", `/rest/v1/memories?owner_id=eq.${owner.id}&select=id,status,source,supersedes_id`);
  check("DB에 3행 (원본·정정본·삭제본)", 3, rows.length);
  check("모두 출처는 USER", true, rows.every((r) => r.source === "USER"));
  const ev = await admin("GET", `/rest/v1/memory_evidence?memory_id=eq.${memId}&select=quote,source_kind`);
  check("원본 근거 1행", 1, ev.length);
} finally {
  await admin("DELETE", `/auth/v1/admin/users/${owner.id}`);
  await admin("DELETE", `/auth/v1/admin/users/${other.id}`);
  const left = await admin("GET", "/rest/v1/memories?select=id");
  console.log(`\n임시 계정 삭제. 남은 기억 행: ${Array.isArray(left) ? left.length : "?"}건`);
}

const failed = results.filter((r) => !r).length;
console.log(`\n총 ${results.length}건 중 ${results.length - failed}건 통과`);
process.exit(failed ? 1 : 0);
