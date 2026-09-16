// S3-A 대화 목록 검증. 05 문서의 T01~T04를 중심으로 본다.
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

const password = "Cv-" + randomUUID().slice(0, 12);
const owner = await admin("POST", "/auth/v1/admin/users", { email: process.env.TEST_EMAIL, password, email_confirm: true });
const other = await admin("POST", "/auth/v1/admin/users", { email: `cv-other-${Date.now()}@example.com`, password, email_confirm: true });

try {
  const login = (email) => fetch(`${U}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: PUB, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then((r) => r.json());
  const cookie = cookieFor(await login(process.env.TEST_EMAIL));

  const send = (content, conversationId) => fetch(`${APP}/api/chat`, {
    method: "POST", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ content, clientRequestId: randomUUID(), conversationId }),
  });

  async function drain(res) {
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

  const list = () => fetch(`${APP}/api/conversations`, { headers: { cookie } }).then((r) => r.json());

  console.log("\n== 새 대화 생성 ==");
  check("처음엔 대화 0개", 0, (await list()).conversations.length);
  const a = await drain(await send("첫 번째 대화다"));
  const convA = a.start.conversationId;
  check("첫 메시지로 대화 생성", 1, (await list()).conversations.length);

  const b = await drain(await send("두 번째 대화다"));
  const convB = b.start.conversationId;
  check("conversationId 없이 보내면 새 대화", true, convA !== convB);
  check("대화 2개", 2, (await list()).conversations.length);

  console.log("\n== T02 대화가 분리되는가 ==");
  const msgsA = await admin("GET", `/rest/v1/messages?conversation_id=eq.${convA}&select=content&order=seq`);
  const msgsB = await admin("GET", `/rest/v1/messages?conversation_id=eq.${convB}&select=content&order=seq`);
  check("A에 A의 메시지만", true, msgsA.some((m) => m.content === "첫 번째 대화다") && !msgsA.some((m) => m.content === "두 번째 대화다"));
  check("B에 B의 메시지만", true, msgsB.some((m) => m.content === "두 번째 대화다") && !msgsB.some((m) => m.content === "첫 번째 대화다"));

  console.log("\n== T03 생성 중 전환해도 원래 대화에만 저장 ==");
  // A에 보내는 중에 B로도 보낸다. 각자 자기 대화에만 쌓여야 한다.
  const beforeA = (await admin("GET", `/rest/v1/messages?conversation_id=eq.${convA}&select=id`)).length;
  const [ra, rb] = await Promise.all([send("A로 보낸다", convA), send("B로 보낸다", convB)]);
  await Promise.all([drain(ra), drain(rb)]);
  const afterA = await admin("GET", `/rest/v1/messages?conversation_id=eq.${convA}&select=content`);
  const afterB = await admin("GET", `/rest/v1/messages?conversation_id=eq.${convB}&select=content`);
  check("A에 2건 늘어남", beforeA + 2, afterA.length);
  check("A에 B의 입력이 섞이지 않음", false, afterA.some((m) => m.content === "B로 보낸다"));
  check("B에 A의 입력이 섞이지 않음", false, afterB.some((m) => m.content === "A로 보낸다"));

  console.log("\n== 제목 ==");
  const listed = (await list()).conversations;
  check("자동 제목이 첫 메시지", "두 번째 대화다", listed.find((c) => c.id === convB).title);
  check("자동 제목 표시", "AUTO", listed.find((c) => c.id === convB).titleSource);

  const renamed = await fetch(`${APP}/api/conversations/${convB}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ title: "내가 붙인 이름" }),
  });
  check("제목 변경", 200, renamed.status);
  const afterRename = (await list()).conversations.find((c) => c.id === convB);
  check("제목 반영", "내가 붙인 이름", afterRename.title);
  check("사용자 제목으로 표시", "USER", afterRename.titleSource);

  // 이 대화에 다시 보내도 제목이 덮이지 않아야 한다.
  await drain(await send("추가 메시지", convB));
  check("자동 생성이 덮지 않음", "내가 붙인 이름", (await list()).conversations.find((c) => c.id === convB).title);

  const empty = await fetch(`${APP}/api/conversations/${convB}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ title: "   " }),
  });
  check("빈 제목 거절", 400, empty.status);

  console.log("\n== 숨김은 삭제가 아니다 ==");
  const archived = await fetch(`${APP}/api/conversations/${convA}`, { method: "DELETE", headers: { cookie } });
  check("숨김", 200, archived.status);
  check("목록에서 빠짐", 1, (await list()).conversations.length);
  const stillThere = await admin("GET", `/rest/v1/conversations?id=eq.${convA}&select=id,archived_at`);
  check("행은 남아 있음", 1, stillThere.length);
  check("archived_at 채워짐", true, stillThere[0].archived_at !== null);
  const msgsKept = await admin("GET", `/rest/v1/messages?conversation_id=eq.${convA}&select=id`);
  check("메시지도 남아 있음", true, msgsKept.length > 0);

  console.log("\n== 마지막 선택 복원 ==");
  // /chat이 쿠키에 적힌 대화를 여는지 본다. 최신 대화가 아니라 기억된
  // 대화가 나와야 한다. 상수를 잘못 공유해 쿠키를 못 읽은 적이 있다.
  const shownFor = async (remembered) => {
    const html = await (await fetch(`${APP}/chat`, {
      headers: { cookie: remembered ? `${cookie}; ieum_last_conversation=${remembered}` : cookie },
    })).text();
    return html.includes("첫 번째 대화다") ? "A" : html.includes("내가 붙인 이름") || html.includes("추가 메시지") ? "B" : "?";
  };
  check("기억된 대화(B)를 연다", "B", await shownFor(convB));
  check("쿠키가 없으면 최근 대화", "B", await shownFor(null));
  check("없는 대화 ID면 최근 대화로", "B", await shownFor(randomUUID()));

  console.log("\n== T04 남의 대화 접근 ==");
  const otherCookie = cookieFor(await login(other.email));
  const otherPatch = await fetch(`${APP}/api/conversations/${convB}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", cookie: otherCookie },
    body: JSON.stringify({ title: "탈취" }),
  });
  // allowlist가 먼저 막으므로 401이 정상이다. 앱이 통과시켜도 404여야 한다.
  check("남이 제목 변경 시도", true, otherPatch.status === 401 || otherPatch.status === 404, `HTTP ${otherPatch.status}`);
  const missing = await fetch(`${APP}/api/conversations/${randomUUID()}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ title: "없는 대화" }),
  });
  check("없는 대화도 404", 404, missing.status);
} finally {
  await admin("DELETE", `/auth/v1/admin/users/${owner.id}`);
  await admin("DELETE", `/auth/v1/admin/users/${other.id}`);
  console.log("\n임시 계정 삭제 완료");
}

const failed = results.filter((r) => !r).length;
console.log(`\n총 ${results.length}건 중 ${results.length - failed}건 통과`);
process.exit(failed ? 1 : 0);
