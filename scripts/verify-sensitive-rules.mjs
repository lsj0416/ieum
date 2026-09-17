// S4-0 · 민감 정보 판정 규칙 회귀 시험.
//
// 다른 검증과 달리 서버도 모델도 DB도 필요 없다. 규칙만 직접 불러 시험한다.
// 규칙은 앞으로도 계속 손보게 되는데, 그때마다 모델을 부르면 느리고 결과가
// 흔들린다.
//
// 실사용에서 오탐 네 건을 만났다(2026-09-18). 날짜 2026-02-21이 계좌번호로,
// "회원 서비스 장애"가 건강 정보로 걸렸다. 민감으로 찍히면 화면의 기본
// 선택에서 빠지므로 멀쩡한 경력과 프로젝트 기억이 조용히 제외됐다.
//
// 그래서 못 잡는 것(누락)만 보지 않고 잘못 잡는 것(오탐)도 같은 무게로 본다.
//
//   node scripts/verify-sensitive-rules.mjs
import { looksSensitive, sensitiveLabel } from "../src/server/memory/sensitive.ts";

const results = [];
function check(label, expect, actual, extra = "") {
  const ok = expect === actual;
  results.push(ok);
  console.log(`  [${ok ? "OK" : "실패"}] ${label.padEnd(52)} ${actual}${extra ? " · " + extra : ""}`);
}

// 잡아야 하는 것.
const SENSITIVE = [
  ["주민등록번호", "제 주민등록번호는 900101-1234567 이에요"],
  ["주민등록번호(공백)", "주민번호 900101 - 2345678 입니다"],
  ["카드번호", "카드 번호는 1234-5678-9012-3456 입니다"],
  ["계좌번호", "국민은행 123-456-789012 로 보내주세요"],
  ["전화번호", "연락처는 010-1234-5678 입니다"],
  ["여권번호", "여권번호 M12345678 로 발급받았다"],
  ["비밀번호", "계정 비밀번호는 hunter2 입니다"],
  ["건강", "작년에 허리 수술을 받고 한동안 통원 진료를 했다"],
  ["우울증", "우울증으로 약을 복용한 적이 있다"],
  ["신념", "매주 교회에 나가고 종교 활동을 한다"],
];

// 잡으면 안 되는 것. 전부 실제 후보에서 가져온 문장이거나 그와 같은 형태다.
const SAFE = [
  ["수료 날짜", "goorm Deep Dive Fullstack 과정을 2026-02-21에 수료했다"],
  ["근무 기간", "2024-06-01부터 2025-02-28까지 계약직으로 근무했다"],
  ["점 표기 날짜", "2026.01.02 부터 2026.02.04 까지 팀 프로젝트를 진행했다"],
  ["짧은 날짜", "1-02부터 2-04까지 진행한 프로젝트다"],
  ["한글 날짜", "2026년 9월 하반기 공채 시즌에 집중했다"],
  ["서비스 장애", "회원 서비스 장애나 지연이 과거 주문 조회에 영향을 주지 않게 했다"],
  ["장애 조치", "장애 대응 훈련을 하고 복구 절차를 문서로 남겼다"],
  ["로그 진단", "느린 쿼리를 진단해 인덱스를 추가했다"],
  ["성능 수치", "재사용 연결 기준 p95가 3.26초에서 0.886초로 개선됐다"],
  ["버전 표기", "Next 16.3.5 / React 19.2.8 조합으로 올렸다"],
  ["기간 범위", "경력 1~3년 공고도 함께 검토한다"],
  ["포트폴리오", "취업용 포트폴리오는 약 12페이지 PDF로 관리한다"],
  ["복무", "ROTC 59기 통신장교로 약 28개월 복무하고 중위로 전역했다"],
];

// 오탐인 줄 알면서 두는 것.
//
// 숫자 세 토막은 계좌번호와 구분되지 않는다. 더 조이면 농협 352-1234-5678-93
// 같은 실제 계좌 형식을 놓친다. 후보는 어차피 전부 화면에 보이고 민감 표시는
// 기본 선택만 끄므로, 이쪽 오탐은 감수한다. 통과 수에 넣지 않고 눈에만 남긴다.
const KNOWN_FALSE_POSITIVES = [
  ["숫자 세 토막 설정값", "Access Token 3600-1800-900 초 조합을 검토했다가 접었다"],
];

console.log("\n== 민감한 것은 잡는다 ==");
for (const [label, text] of SENSITIVE) {
  check(label, true, looksSensitive(text), sensitiveLabel(text) ?? "못 잡음");
}

console.log("\n== 멀쩡한 것은 잡지 않는다 ==");
for (const [label, text] of SAFE) {
  check(label, false, looksSensitive(text), sensitiveLabel(text) ?? "");
}

console.log("\n== 알면서 두는 오탐 (통과 수에 넣지 않는다) ==");
for (const [label, text] of KNOWN_FALSE_POSITIVES) {
  console.log(`  [알고 있음] ${label.padEnd(48)} ${sensitiveLabel(text) ?? "잡지 않음"}`);
}

const failed = results.filter((r) => !r).length;
console.log(`\n총 ${results.length}건 중 ${results.length - failed}건 통과`);
process.exit(failed ? 1 : 0);
