// S3-03 연속성 평가. 문서 02의 12절 E01~E10과 S4-0에서 추가한 E11~E12를 돌린다.
//
// 이 평가는 앞선 검증 스크립트와 성격이 다르다. 서버가 무엇을 전달했는지가
// 아니라 모델이 실제로 어떻게 답했는지를 본다. 그래서 결과가 흔들릴 수
// 있다. 자동 판정은 참고용이고 답변 원문을 함께 남겨 사람이 읽게 한다.
import { readFileSync, writeFileSync } from "node:fs";
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

const report = [];
function record(id, situation, expected, observed, verdict, note = "") {
  report.push({ id, situation, expected, observed, verdict, note });
  const mark = verdict === "통과" ? "통과" : verdict === "실패" ? "실패" : "확인필요";
  console.log(`\n[${id}] ${mark} — ${situation}`);
  console.log(`  기대: ${expected}`);
  console.log(`  관측: ${observed.replace(/\n/g, " ").slice(0, 150)}`);
  if (note) console.log(`  비고: ${note}`);
}

const password = "Ev-" + randomUUID().slice(0, 12);
const email = process.env.TEST_EMAIL;
const list = await admin("GET", "/auth/v1/admin/users");
for (const u of list.users ?? []) if (u.email.startsWith("ev-")) await admin("DELETE", `/auth/v1/admin/users/${u.id}`);
const owner = await admin("POST", "/auth/v1/admin/users", { email, password, email_confirm: true });

const session = await (await fetch(`${U}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: PUB, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
})).json();
const cookie = `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
const api = (path, init = {}) => fetch(`${APP}${path}`, {
  ...init, headers: { "Content-Type": "application/json", cookie, ...(init.headers ?? {}) },
});

/** 한 턴을 보내고 답변과 전달 내역을 모은다. */
async function ask(content, conversationId) {
  const res = await api("/api/chat", {
    method: "POST", body: JSON.stringify({ content, clientRequestId: randomUUID(), conversationId }),
  });
  const reader = res.body.getReader(); const dec = new TextDecoder();
  let buf = "", answer = "", start = null, done = null, error = null;
  for (;;) {
    const { done: d, value } = await reader.read(); if (d) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const raw = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!raw) continue;
      const e = JSON.parse(raw);
      if (e.type === "delta") answer += e.text;
      if (e.type === "start") start = e;
      if (e.type === "done") done = e.status;
      if (e.type === "error") error = e;
    }
  }
  return { answer: answer.trim(), start, done, error, status: res.status };
}

const addMemory = (kind, content) => api("/api/memories", {
  method: "POST", body: JSON.stringify({ kind, content, quote: `근거: ${content}`, sourceMessageId: null }),
}).then((r) => r.json());

try {
  // ── E01 ────────────────────────────────────────────────────────────────
  await addMemory("FACT", "이번 프로젝트는 Next.js와 Supabase로 만들기로 했다");
  const e01 = await ask("이번 프로젝트 기술 스택이 뭐였지?");
  record("E01", "새 대화에서 저장한 기술 선택 질문", "Next.js/Supabase 결정 활용",
    e01.answer,
    /Next\.?js/i.test(e01.answer) && /Supabase/i.test(e01.answer) ? "통과" : "실패");

  // ── E02 / E03 ──────────────────────────────────────────────────────────
  const work = await (await api("/api/work", {
    method: "POST", body: JSON.stringify({ title: "ieum 개발", nextAction: "연속성 평가 실행" }),
  })).json();
  await api(`/api/work/${work.id}/decisions`, {
    method: "POST", body: JSON.stringify({ decision: "S3까지 만든 뒤 평가한다" }),
  });

  const e02 = await ask("다음은 뭐 하면 되지?");
  const conv = e02.start.conversationId;
  record("E02", "진행 작업에서 '다음은?' 질문", "마지막 결정과 미완료 다음 행동 안내",
    e02.answer,
    /연속성 평가|평가/.test(e02.answer) ? "통과" : "실패",
    `전달한 일 ${e02.start.usedWork.length}개`);

  await api(`/api/work/${work.id}`, { method: "PATCH", body: JSON.stringify({ status: "DONE" }) });
  const e03 = await ask("이제 뭐 하면 될까?", conv);
  record("E03", "다음 행동 완료 처리 후 재질문", "완료한 작업을 반복 권유하지 않음",
    e03.answer,
    e03.start.usedWork.length === 0 ? "통과" : "실패",
    `Context에 전달한 일 ${e03.start.usedWork.length}개 (0이어야 함)`);

  // ── E04 ────────────────────────────────────────────────────────────────
  const pref = await addMemory("FACT", "커피를 매일 마신다");
  const listed = (await (await api("/api/memories")).json()).memories;
  const target = listed.find((m) => m.id === pref.id);
  await api(`/api/memories/${pref.id}`, {
    method: "PATCH",
    body: JSON.stringify({ kind: "FACT", content: "커피를 끊고 차를 마신다", quote: "카페인 줄이려고 끊었다", expectedVersion: target.version }),
  });
  const e04 = await ask("내가 요즘 뭘 마시지?");
  record("E04", "기억을 명시적으로 정정", "현재 답변에는 새 사실 사용",
    e04.answer,
    /차/.test(e04.answer) && !/커피를 매일|매일 커피/.test(e04.answer) ? "통과" : "확인필요",
    `전달 기억: ${e04.start.usedMemories.map((m) => m.content).join(" / ")}`);

  // ── E05 ────────────────────────────────────────────────────────────────
  const secret = await addMemory("FACT", "고양이 두 마리를 키운다");
  await api(`/api/memories/${secret.id}?mode=with_source`, { method: "DELETE" });
  const e05 = await ask("내가 반려동물 키우나?");
  const leaked = e05.start.usedMemories.some((m) => m.content.includes("고양이"));
  record("E05", "기억 삭제 후 질문", "삭제 기억과 파생 Context 미사용",
    e05.answer,
    !leaked && !/고양이/.test(e05.answer) ? "통과" : "실패",
    `전달 기억에 삭제분 포함 여부: ${leaked}`);

  // ── E06 ────────────────────────────────────────────────────────────────
  const e06 = await ask("내 형제자매가 몇 명이지?");
  record("E06", "저장되지 않은 개인 정보 질문", "추측하지 않고 모름/확인 필요 표시",
    e06.answer,
    /모르|없|알 수 없|기록|저장된|확인/.test(e06.answer) ? "통과" : "실패");

  // ── E07 ────────────────────────────────────────────────────────────────
  const w1 = await (await api("/api/work", { method: "POST", body: JSON.stringify({ title: "이력서 정리", nextAction: "경력 요약 쓰기" }) })).json();
  const w2 = await (await api("/api/work", { method: "POST", body: JSON.stringify({ title: "Kafka 공부", nextAction: "파티션 정리" }) })).json();
  const e07 = await ask("그 일 어떻게 되고 있지?");
  record("E07", "서로 다른 진행 작업 두 개", "임의로 섞지 않음",
    e07.answer,
    /어느|어떤|둘 중|무엇을|말씀|두 가지|모두/.test(e07.answer) ? "통과" : "확인필요",
    `전달한 일 ${e07.start.usedWork.length}개: ${e07.start.usedWork.map((w) => w.title).join(", ")}`);

  // ── E08 ────────────────────────────────────────────────────────────────
  const before08 = (await (await api("/api/memories")).json()).memories.length;
  // 답변 내용이 아니라 기억이 늘었는지를 본다.
  await ask("오늘만 짧게 답해줘. 오늘 뭐 하면 좋을까?");
  const after08 = (await (await api("/api/memories")).json()).memories.length;
  record("E08", "'오늘만 짧게'라는 요청", "영구 선호로 저장하지 않음",
    `기억 수 ${before08} → ${after08}`,
    before08 === after08 ? "통과" : "실패",
    "자동 저장 경로가 없어 지금은 구조적으로 통과한다. S4에서 재확인 필요");

  // ── E09 ────────────────────────────────────────────────────────────────
  await admin("PATCH", `/rest/v1/work_items?id=eq.${w1.id}`, {
    last_confirmed_at: new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString(),
  });
  await admin("PATCH", `/rest/v1/work_items?id=eq.${w2.id}`, { status: "DONE" });
  const e09 = await ask("이력서 정리 어디까지 했지?");
  record("E09", "오래된 상태만 있는 질문", "마지막 확인 시점과 불확실성 표시",
    e09.answer,
    /확인|오래|이후|기준|지금도|최근|업데이트/.test(e09.answer) ? "통과" : "확인필요");

  // ── E11 · 가져온 기억으로 배경을 묻는다 ──────────────────────────────
  //
  // 실사용에서 여기가 무너졌다(2026-09-18). 가져온 기억만 있는 상태에서
  // "내가 지금 뭐 하는지 알아?"라고 물었더니 "과거 정보뿐이고 현재도
  // 그런지는 확인되지 않았습니다"만 답했다. Context 문구가 너무 세서
  // 모델이 아는 것까지 모른다고 말한 것이다.
  //
  // 기대는 "단정하지 않되 아는 것은 말한다"이다. 모르는 척이 안전한
  // 답은 아니다.
  const imp = (await admin("POST", "/rest/v1/memory_imports", {
    owner_id: owner.id, source_label: "ChatGPT", raw_text: "평가용 원문",
  }))[0];
  const impMemory = async (kind, content, source = "USER") => {
    const m = (await admin("POST", "/rest/v1/memories", {
      owner_id: owner.id, kind, content, source, origin_import_id: imp.id,
    }))[0];
    await admin("POST", "/rest/v1/memory_evidence", {
      memory_id: m.id, quote: content, source_kind: "IMPORT",
    });
    return m;
  };
  await impMemory("FACT", "정보보안공학과를 졸업했고 ROTC 통신장교로 28개월 복무했다");
  await impMemory("GOAL", "Java/Spring Boot 백엔드 개발자로 취업하는 것이 주된 커리어 목표다");
  await impMemory("PREFERENCE", "이력서에서 실제 역할보다 크게 보이도록 표현하는 것을 피한다");
  await impMemory("FACT", "대규모 트래픽 처리 경험이 부족한 것으로 보인다", "MODEL");

  const e11 = await ask("나에 대해 아는 걸 말해줘.");
  // 아는 것을 실제로 꺼내 쓰는지 본다. 하나도 못 대면 실패다.
  const usedKnown = /백엔드|Spring|Java|정보보안|통신장교|ROTC|이력서/.test(e11.answer);
  const refusedOnly = /알 수 없|모르겠|확인되지 않/.test(e11.answer) && !usedKnown;
  record("E11", "가져온 기억만 있을 때 배경을 물음", "아는 것을 말한다. 모른다고만 하지 않는다",
    e11.answer, refusedOnly ? "실패" : usedKnown ? "통과" : "확인필요",
    `전달 기억 ${e11.start?.usedMemories.length ?? 0}개`);

  // ── E12 · 가져온 목표의 시점 ────────────────────────────────────────────
  //
  // 목표는 바뀔 수 있다. 그렇다고 말을 못 하면 안 되고, 지금 목표라고
  // 단정해도 안 된다. 언제 기준인지 밝히는 것이 기대다(06 8절).
  const e12 = await ask("내 커리어 목표가 뭐지?");
  const saidGoal = /백엔드|Spring|Java/.test(e12.answer);
  const saidWhen = /기준|가져온|정리|확인|당시|시점|지금도|바뀌|최근/.test(e12.answer);
  record("E12", "가져온 목표를 물음", "목표를 말하되 언제 기준인지 밝힌다",
    e12.answer,
    saidGoal && saidWhen ? "통과" : saidGoal ? "확인필요" : "실패",
    saidGoal ? (saidWhen ? "" : "시점 표시 없음") : "목표를 말하지 못함");

  // ── E10 ────────────────────────────────────────────────────────────────
  // 예산 초과를 주입해 모델 호출을 실패시킨다. 같은 요청 ID로 재시도한다.
  // 이 뒤로는 모든 호출이 차단되므로 모델 답을 보는 평가는 여기 앞에 둔다.
  await admin("POST", "/rest/v1/model_calls", {
    owner_id: owner.id, task: "chat", model: "gpt-5.6-luna", status: "completed", estimated_cost_usd: 99,
  });
  const reqId = randomUUID();
  const fail1 = await api("/api/chat", { method: "POST", body: JSON.stringify({ content: "실패해야 한다", clientRequestId: reqId, conversationId: conv }) });
  await fail1.text();
  const savedAfterFail = await admin("GET", `/rest/v1/messages?conversation_id=eq.${conv}&content=eq.${encodeURIComponent("실패해야 한다")}&select=id`);
  const retry = await api("/api/chat", { method: "POST", body: JSON.stringify({ content: "실패해야 한다", clientRequestId: reqId, conversationId: conv }) });
  const retryBody = await retry.text();
  const savedAfterRetry = await admin("GET", `/rest/v1/messages?conversation_id=eq.${conv}&content=eq.${encodeURIComponent("실패해야 한다")}&select=id`);
  record("E10", "모델 실패 후 같은 ID로 재시도", "사용자 입력 보존·중복 답변 방지",
    `입력 저장 ${savedAfterFail.length}건 → 재시도 후 ${savedAfterRetry.length}건, 재시도 응답 ${retry.status}`,
    savedAfterFail.length === 1 && savedAfterRetry.length === 1 ? "통과" : "실패",
    retryBody.slice(0, 80));
} finally {
  await admin("DELETE", `/auth/v1/admin/users/${owner.id}`);
  console.log("\n임시 계정 삭제 완료");
}

const pass = report.filter((r) => r.verdict === "통과").length;
const fail = report.filter((r) => r.verdict === "실패").length;
const unsure = report.filter((r) => r.verdict === "확인필요").length;
console.log(`\n${"=".repeat(60)}`);
console.log(`통과 ${pass} · 실패 ${fail} · 확인필요 ${unsure} (총 ${report.length})`);

writeFileSync(
  process.env.REPORT_PATH ?? "/tmp/continuity-report.json",
  JSON.stringify(report, null, 2),
);
process.exit(fail > 0 ? 1 : 0);
