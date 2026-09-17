/**
 * 민감 정보로 보이는 형태를 찾는다.
 *
 * 모델의 판정만 믿지 않는다. 모델이 놓쳐도 여기서 걸리면 기본 제외된다.
 * 반대로 여기 없다고 안전하다는 뜻은 아니므로 모델 판정과 합집합으로 쓴다.
 *
 * 이 파일은 일부러 아무것도 import하지 않는다. 검증 스크립트가 모델이나
 * DB 없이 이 규칙만 직접 불러 시험할 수 있어야 하기 때문이다. 규칙이
 * 바뀔 때마다 모델을 부르면 회귀 시험이 느리고 흔들린다.
 *
 * 오탐의 대가가 크다는 것을 실사용에서 배웠다(2026-09-18). 민감으로
 * 찍히면 화면의 기본 선택에서 빠지므로, 멀쩡한 경력·프로젝트 기억이
 * 조용히 제외된다. 경고가 자꾸 틀리면 진짜 경고도 믿지 않게 된다.
 */

/**
 * 검사 전에 날짜를 지운다.
 *
 * `2026-02-21`은 계좌번호 형태와 구분되지 않는다. 실제로 "goorm 과정을
 * 2026-02-21에 수료했다"가 민감으로 찍혔다. 날짜는 이 글에서 흔하고
 * 계좌번호는 드물다. 흔한 쪽을 먼저 걷어낸다.
 */
function stripDates(text: string): string {
  return text
    // 2026-02-21, 2026.02.21, 2026/02/21
    .replace(/\b\d{4}[-./]\d{1,2}[-./]\d{1,2}\b/g, " ")
    // 02-21 같은 짧은 형태도 뒤따르는 조사와 함께 흔히 쓰인다
    .replace(/\b\d{1,2}[-./]\d{1,2}\b/g, " ")
    // 2026년 2월 21일
    .replace(/\d{4}\s*년\s*\d{1,2}\s*월(\s*\d{1,2}\s*일)?/g, " ");
}

export const SENSITIVE_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "주민등록번호", re: /\b\d{6}\s*-\s*[1-4]\d{6}\b/ },
  { label: "카드번호", re: /\b(?:\d{4}[\s-]){3}\d{4}\b/ },

  // 날짜를 걷어낸 뒤에도 남는 세 토막 숫자만 계좌번호로 본다.
  { label: "계좌번호", re: /\b\d{2,6}-\d{2,6}-\d{2,8}\b/ },

  { label: "전화번호", re: /\b01[016-9][\s-]?\d{3,4}[\s-]?\d{4}\b/ },
  { label: "여권번호", re: /\b[MSRO]\d{8}\b/ },
  { label: "계정정보", re: /비밀번호|패스워드|password/i },

  // "장애"와 "진단"을 뺐다. 개발자가 쓰는 글에서 장애는 서비스 중단이고
  // 진단은 로그 진단이다. 건강을 뜻하는 말만 남긴다.
  { label: "건강", re: /질병|지병|진료|처방|복용|수술|입원|우울증|정신과|병력/ },

  { label: "신념", re: /종교|교회|성당|정치\s*성향|지지\s*정당/ },
];

/** 민감해 보이는 대목이 있으면 그 이름을 돌려준다. 없으면 null. */
export function sensitiveLabel(text: string): string | null {
  const scrubbed = stripDates(text);
  for (const { label, re } of SENSITIVE_PATTERNS) {
    if (re.test(scrubbed)) return label;
  }
  return null;
}

export function looksSensitive(text: string): boolean {
  return sensitiveLabel(text) !== null;
}
