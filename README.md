# ieum · 이음

함께한 시간을 기억하고, 다음 이야기를 이어가는 개인 AI 비서.

## 프로젝트 목표

사용자의 장기 기억, 진행 중인 일, 마지막 결정과 다음 행동을 연결해 새 대화에서도 맥락을 이어갑니다. 저비용 모바일 웹으로 직접 사용하며 단계적으로 확장합니다.

## 구현 방향

Next.js · TypeScript · Supabase · Vercel · AI SDK

현재 단계는 **S0 배포 기반**입니다. Next.js 골격까지 만들었고 DB·배포·모델 연동은 아직 없습니다.

## 개발

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
npm run lint
```

Node 24 · Next.js 16 (App Router) · Tailwind CSS v4

처음 받았다면 `.env.example`을 `.env.local`로 복사해 값을 채웁니다. 값은 Supabase 대시보드의 Settings > API Keys에 있습니다.

## 배포

운영 주소: https://ieum-theta.vercel.app

Vercel에 배포합니다. 환경 변수 네 개를 Production과 Preview 양쪽에 등록해야 합니다.

| 변수 | 비고 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 브라우저 노출 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 브라우저 노출 |
| `SUPABASE_SECRET_KEY` | 서버 전용 |
| `OWNER_EMAILS` | 비우면 아무도 로그인하지 못합니다 |
| `OPENAI_API_KEY` | 서버 전용. `sk-`로 시작 |

Vercel에서 변수 타입을 고를 때 `NEXT_PUBLIC_`으로 시작하는 둘은 **Config**, `SUPABASE_SECRET_KEY`는 **Secret**으로 만듭니다. publishable 키는 어차피 브라우저 번들에 들어가므로 Secret으로 두면 Vercel이 경고합니다. 저장된 Secret은 Config로 바꿀 수 없으니, 잘못 만들었다면 지우고 다시 만들어야 합니다.

`NEXT_PUBLIC_` 변수는 **빌드 시점에 코드에 박힙니다.** 배포 후에 변수를 추가했다면 반드시 빌드 캐시를 끄고 Redeploy해야 합니다. 변수만 등록하고 재배포하지 않으면 이전 빌드 결과물이 그대로 서빙되어 계속 실패합니다.

변수가 빠진 채로 빌드하면 빌드가 실패합니다(`next.config.ts`). 값 없이 빌드된 결과물이 배포되면 모든 요청이 `Internal Server Error` 한 줄만 내놓아 원인을 알 수 없기 때문입니다.

비밀번호 로그인만 쓰므로 Supabase의 Redirect URL 설정은 필요하지 않습니다.

## 비용 통제

모델 호출은 월 상한(`src/server/models/catalog.ts`의 `MONTHLY_BUDGET_USD`)을 넘으면 코드가 막습니다. **이것만 믿지 않습니다.** 코드에 버그가 있어 호출이 폭주하면 애플리케이션 검사로는 막지 못하므로, OpenAI 대시보드의 Settings > Billing > Limits에도 같은 금액의 한도를 겁니다. 그쪽이 진짜 안전장치입니다.

호출마다 `model_calls`에 사용량과 호출 시점 단가로 계산한 비용이 남습니다. 실패한 호출도 기록합니다. 매직링크나 OAuth를 추가하면 그때 등록합니다.

## 문서

- [프로젝트 방향](docs/01-project-direction.md)
- [로드맵과 시스템 설계](docs/02-roadmap-and-architecture.md)
- [결정 기록](docs/03-decisions.md)
- [현재 상태와 새 세션 인계](docs/04-status-and-handoff.md)
- [보존된 Spring 초기 설계](docs/archive/personal-ai-mvp-design.md)

새 세션에서는 상태 문서 → 방향 → 결정 기록 → 로드맵 순서로 읽습니다.

## 첫 체크포인트

휴대폰에서 본인 계정으로 로그인 가능한 배포 기반을 만듭니다. 이후 대화 저장 → 명시적 기억 → 작업 연속성을 구현합니다. 개발 Task와 완료 기준은 로드맵을 따릅니다.

## 문서 관리

완료 근거와 다음 작업을 상태 문서에 갱신하고, 중요한 선택의 이유는 결정 기록에 남깁니다. 실제 API 키·토큰·개인 대화 데이터는 저장소에 추가하지 않습니다.
