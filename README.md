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
- **07 팀 역할 조율** — 역할별 현황, 협의 → 추첨 → 수락/거절, 팀원별 선호
- **08 내 가능한 시간** — 안 되는 시간만 표시. **목록형이 기본**, 주간 격자는 보조
- **09 / 10 회의 시간** — 후보 제안 → 반대 없으면 자동 확정. 전원 불가한 주는 최다 인원 후보 + 다음 주 이월
- **11 홈** — 내 확인이 필요한 일 → 가까운 일정 → 최근 자료·업무 → AI 도구. 앞 두 구역은 07·09의 실제 상태에서 계산합니다
- **12 / 13 / 22 드라이브** — 역할별 제출함 → 버전 기록 → 열람·복원. 복원은 덮어쓰기가 아니라 새 버전 추가
- **19 / 30 / 31 / 32 채팅** — 통합 목록, 팀 단톡방, DM 목록·대화. 단톡방과 DM 이 같은 말풍선 규격
- **탭 셸 5탭** — 홈 / 채팅 / 일정 / 드라이브 / 팀 (다섯 탭 모두 실제 화면)

남은 화면 15개(AI 도구 6개·기여도 5개·팀 친목 3개·33 PC 채팅)는 목록만 있습니다.

## 구조

```
src/
  app/                  라우트
    join/               01 초대 링크 입장, 00 팀 만들기(/join/new-team)
    onboarding/         02~06
    (tabs)/             하단 5탭이 붙는 화면들
                        (home = 11, chat = 19·30·31·32,
                         schedule = 08·09·10, drive = 12·13·22, team = 07)
  components/ui/        공통 컴포넌트 (핸드오프 ui.jsx 대응)
  features/chat/        19·30·31·32 채팅 화면 + 말풍선·입력줄
  features/drive/       12·13·22 드라이브 화면 + 버전 상태
  features/home/        11 홈 화면
  features/onboarding/  온보딩 화면 + 상태
  features/roles/       07 역할 조율 화면 + 협의 상태
  features/schedule/    08·09·10 회의 시간 화면
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
