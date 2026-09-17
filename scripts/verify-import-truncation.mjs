// S4-0 보완 · 잘린 추출 복구 검증.
//
// 실사용에서 겪은 실패를 재현한다(2026-09-18). 긴 글을 가져왔더니 모델
// 답변이 출력 상한에 정확히 걸려 잘렸고, 잘린 JSON을 읽지 못해 뽑은 것을
// 전부 버렸다. 사용자에게는 502와 "정리 결과를 읽지 못했다"만 남았다.
//
// 확인할 것은 셋이다. 잘려도 502가 아닌가, 온전한 항목까지는 살아남는가,
// 살렸다는 사실이 표시로 남는가.
//
// 실행 방법 — 출력 상한을 아주 낮게 건 서버를 띄우고 돌린다.
//
//   pkill -f "next dev"; lsof -ti:3000 | xargs kill -9
//   OWNER_EMAILS="trunc-owner@example.com" IMPORT_MAX_OUTPUT_TOKENS=250 npm run dev &
//   TEST_EMAIL="trunc-owner@example.com" node scripts/verify-import-truncation.mjs
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
  console.log(`  [${ok ? "OK" : "실패"}] ${label.padEnd(40)} ${JSON.stringify(actual)}${extra ? " · " + extra : ""}`);
}

// 후보가 여러 개 나오도록 항목을 넉넉히 넣는다. 낮은 상한에서는 앞의
// 몇 개만 온전히 출력되고 나머지는 잘린다.
const RAW = `아래는 사용자 정보 정리입니다.

[사실] (사용자 발언) 저는 Java와 Spring으로 백엔드를 개발해 왔습니다
[사실] (사용자 발언) 최근에는 TypeScript와 Next.js를 배우고 있습니다
[목표] (사용자 발언) 2026년 상반기 기준으로 백엔드 개발자 취업을 준비하고 있습니다
[목표] (사용자 발언) 개인 프로젝트를 배포해 실제로 사용해 보려 합니다
[선호] (사용자 발언) 설명보다 코드 예시를 먼저 보는 것을 선호합니다
[선호] (사용자 발언) 긴 문서보다 표로 정리된 것을 좋아합니다
[사건] (사용자 발언) 2026년 9월에 첫 배포를 마쳤습니다
[사실] (AI 추정) 사용자는 대규모 트래픽 처리 경험이 부족한 것으로 보입니다
[사실] (AI 추정) 사용자는 문서화를 중요하게 여기는 편으로 보입니다`;

const password = "Trunc-" + randomUUID().slice(0, 12);
const email = process.env.TEST_EMAIL;
const owner = await admin("POST", "/auth/v1/admin/users", { email, password, email_confirm: true });

try {
  const session = await (await fetch(`${U}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: PUB, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })).json();
  const cookie = `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;

  console.log("\n== 출력 상한에 걸려 잘린 답변 ==");
  const created = await fetch(`${APP}/api/imports`, {
    method: "POST", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ sourceLabel: "잘림시험", rawText: RAW }),
  });
  const body = await created.json();

  // 고치기 전에는 여기서 502가 나고 아무것도 남지 않았다.
  check("502가 아니다", 201, created.status, JSON.stringify(body).slice(0, 140));
  check("잘렸다고 표시된다", true, body.truncated === true);
  check("살아남은 후보가 있다", true, (body.candidateCount ?? 0) > 0);

  const call = await admin("GET", `/rest/v1/model_calls?owner_id=eq.${owner.id}&task=eq.import_extract&select=output_tokens`);
  check("출력이 실제로 상한에 걸렸다", 250, call[0]?.output_tokens);

  const detail = await (await fetch(`${APP}/api/imports/${body.importId}`, { headers: { cookie } })).json();
  check("검토 화면이 잘림을 알 수 있다", true, detail.truncated === true);
  check("살린 후보도 근거를 갖는다", true,
    detail.candidates.length > 0 && detail.candidates.every((c) => c.quote.trim().length > 0));
  check("살린 후보의 종류가 모두 유효", true,
    detail.candidates.every((c) => ["FACT", "PREFERENCE", "GOAL", "EPISODE"].includes(c.kind)));
  check("살린 후보도 전부 PENDING", true, detail.candidates.every((c) => c.status === "PENDING"));
  check("잘렸어도 기억은 생기지 않는다", 0,
    (await admin("GET", `/rest/v1/memories?owner_id=eq.${owner.id}&select=id`)).length);
  check("원문은 온전히 보존된다", true, detail.rawText === RAW);

  console.log(`  (참고) 살린 후보 ${detail.candidates.length}건 · 버린 것 ${body.droppedCount}건`);
} finally {
  await admin("DELETE", `/auth/v1/admin/users/${owner.id}`);
  const left = await admin("GET", `/rest/v1/memory_imports?owner_id=eq.${owner.id}&select=id`);
  console.log(`\n임시 계정 삭제. 남은 가져오기: ${left.length ?? "?"}건`);
}

const failed = results.filter((r) => !r).length;
console.log(`\n총 ${results.length}건 중 ${results.length - failed}건 통과`);
process.exit(failed ? 1 : 0);
