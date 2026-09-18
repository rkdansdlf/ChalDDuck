# 찰떡 (ChalDduck)

대학생 팀 프로젝트(팀플)를 위한 협업 앱. 가입·로그인 없이 **초대 코드 + 이름**으로 들어와서
역할을 조율하고, 회의 시간을 잡고, 자료를 모으고, 기여 기록을 남깁니다.

디자인 핸드오프(33화면 프로토타입)를 실제 코드베이스로 옮기는 중입니다.

## 스택

| | |
|---|---|
| 프레임워크 | Next.js 16 (App Router) · React 19 · TypeScript |
| 스타일 | Tailwind CSS v4 + CSS 변수 디자인 토큰 |
| 아이콘 | lucide-react (직접 등록한 것만 번들에 들어감) |
| 서체 | Pretendard Variable (저장소에 포함, `next/font/local`) |
| 데이터 | 아직 서버 없음 — `src/data/` 의 목 구현 |

```bash
npm install && npm run dev
```

## 지금까지 구현된 것

- **디자인 토큰** — 색·타이포·치수 ([`src/styles/tokens/`](src/styles/tokens))
- **공통 컴포넌트 17종** — [`src/components/ui/`](src/components/ui)
- **온보딩 00~06** — 팀 만들기 → 초대 입장 → 이름 → MBTI(또는 30초 컷) → 캐릭터 → 희망 역할·Veto
- **탭 셸 5탭** — 홈 / 채팅 / 일정 / 드라이브 / 팀 (온보딩 외 화면은 "예정 화면" 목록만)

나머지 27개 화면은 각 탭에 들어갈 목록이 화면 안에 적혀 있습니다.

## 구조

```
src/
  app/                  라우트
    join/               01 초대 링크 입장, 00 팀 만들기(/join/new-team)
    onboarding/         02~06
    (tabs)/             하단 5탭이 붙는 화면들
  components/ui/        공통 컴포넌트 (핸드오프 ui.jsx 대응)
  features/onboarding/  온보딩 화면 + 상태
  data/                 목 데이터와 API 시임 ← 서버 붙일 때 여기만 교체
  lib/                  도메인 타입·MBTI·유틸
  styles/tokens/        디자인 토큰 (색·타이포)
docs/handoff/           디자인 핸드오프 원본 (참고 자료, 빌드에 포함되지 않음)
```

## 검토 모드

기획안에 규칙이 없어 임시로 정한 지점은 화면 안에 `[검토]` 점선 박스로 표시돼 있고,
**평소에는 보이지 않습니다.** 확인하려면 URL 에 `?review=1` 을 붙이거나 콘솔에서 `__CD_REVIEW__()`.

확정이 필요한 정책 10건은 [`docs/handoff/HANDOFF.md`](docs/handoff/HANDOFF.md) 의
"확정되지 않은 정책" 표에 정리돼 있습니다. **서버를 붙이기 전에 팀이 확정해야 합니다.**

## 검사

```bash
npm run build && npx tsc --noEmit && npm run lint
```
