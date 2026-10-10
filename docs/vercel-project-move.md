# Vercel 프로젝트를 옮긴다 — `Resource provisioning failed` 우회

기존 프로젝트에서 **빌드가 시작조차 되지 않을 때** 새 프로젝트로 옮겨 우회하는 절차다.
2026-10-09 에 실제로 겪어서 적는다.

## 먼저 — 정말 코드 문제가 아닌지 확인한다

```bash
npx vercel ls                                  # 최근이 전부 Error 인가
npx vercel inspect chalddeok-rkdansdlfs-projects.vercel.app   # 별칭이 어디를 가리키나
```

`errorCode: BUILD_FAILED` + `Resource provisioning failed` + **빌드 시간이 0초대**(`builds: 0`)면
**코드가 아니다.** 코드가 실행되지도 않았다. 이때 확인할 것:

| 확인 | 왜 |
|---|---|
| `npx vercel ls` 의 하루 배포 수 | Hobby 는 하루 100회다. 3~6건이면 한도가 아니다 |
| `curl -s https://www.vercel-status.com/api/v2/status.json` | 플랫폼 전체 장애인가 |
| 최근 배포의 `integrations.status` | `"error"` 면 provision 단계에서 죽은 것이다 |

셋 다 정상인데 계속 `provisioning failed` 면 **이 프로젝트 쪽 문제**이고, 재시도는 Quota 만
태운다(`CLAUDE.md` 의 배포 규칙). 여기서부터 이 문서다.

## 저장소가 이미 들고 가는 것 — 손으로 옮기지 않는다

| | 어디에 있나 |
|---|---|
| `buildCommand` | `vercel.json` — `prisma migrate deploy && db:check && storage:check:gate && build` |
| cron | `vercel.json` — `/api/cron/meetings`, 하루 한 번 |
| 프레임워크 | Next.js 로 자동 감지 |
| 도메인 뒤의 주소 | `appBaseUrl()` 이 `VERCEL_PROJECT_PRODUCTION_URL` 을 읽으므로 **메일 링크는 자동으로 맞는다** |

즉 **환경변수만 옮기면 된다.** 그리고 그 값은 전부 저장소 밖 `.env` 에 이미 있다.

## 1단계 — 환경변수 (스크립트)

```bash
sh scripts/move-vercel-project.sh <새-이름>            # 미리 보기 (아무것도 만들지 않는다)
sh scripts/move-vercel-project.sh <새-이름> --apply     # 프로젝트 생성 + 환경변수 11개
```

값은 파이프로만 지나가고 **화면에 찍히지 않는다.** `NEXT_PUBLIC_VAPID_PUBLIC_KEY` 만
`Config` 로 들어간다 — 그 접두사는 빌드 시점에 클라이언트 번들에 인라인되므로 Secret 으로
두면 **화면에서 푸시를 켤 수 없다.**

## 2단계 — Node 버전

**2026-10-09 확인: 이 팀에서 새로 만든 프로젝트의 기본값이 이미 `24.x`** 였다(임시 프로젝트를
만들어 `vercel project ls` 의 Node 열로 확인했다). 그래서 보통은 할 것이 없다.

그래도 **저장소에 적어 두는 편이 낫다** — 기본값은 팀 설정이 바뀌면 따라 바뀌고, 그때 조용히
다른 버전으로 빌드된다:

```json
"engines": { "node": "24.x" }
```

버전이 저장소에 있으면 다음 사람이 새 프로젝트를 만들어도 같은 버전으로 돈다.

## 3단계 — git 연결, 그리고 **기존 것을 끊는다**

```bash
vercel git connect https://github.com/rkdansdlf/ChalDDuck.git --project <새-이름> -y
```

⚠️ **기존 프로젝트의 연결을 끊지 않으면 push 마다 두 곳으로 배포된다.** 하나는 계속 실패하고,
실패한 쪽이 GitHub 커밋 상태에 `failure` 를 남겨 **저장소가 빨간불로 보인다**(성공한 쪽이
가려진다).

```bash
# 기존 프로젝트에서 (대시보드 Settings → Git → Disconnect, 또는)
npx vercel git disconnect --project chalddeok -y
```

지우려면 — **되돌릴 수 없다.** 도메인과 배포 기록이 함께 사라진다.

```bash
printf 'y\n' | npx vercel project remove chalddeok
```

`project remove` 에는 `-y`/`--yes` 가 없다(`--non-interactive` 도 확인 프롬프트를 넘기지
못한다). 그래서 `y` 를 파이프로 넣는다 — 2026-10-09 에 임시 프로젝트로 확인했다.

**지우기 전에** 확인한다 — 기존 프로젝트의 운영 별칭이 아직 살아 있다. 새 프로젝트가 검증될
때까지는 지우지 않는 편이 안전하다.

## 4단계 — 검증 (순서대로)

```bash
git commit --allow-empty -m "chore: 새 프로젝트로 첫 배포" && git push
npx vercel ls                                   # 새 프로젝트가 Ready 인가
gh api "repos/rkdansdlf/ChalDDuck/commits/$(git rev-parse --short HEAD)/status" --jq .state
```

그다음 **발송 경로**를 확인한다 — 배포가 됐다고 알림이 가는 것은 아니다:

```bash
DIRECT_URL=<운영 주소> npm run notify:check     # 키·메일·링크 주소
DIRECT_URL=<운영 주소> npm run push:subs        # 구독 표
```

`notify:check` 는 이 순서로 본다:
- VAPID 공개·비밀키가 **짝인가** (짝이 아니면 구독은 저장되는데 발송이 조용히 실패한다)
- 메일 발신 수단이 잡히는가 (`gmail` / `resend` / 없음)
- 메일 링크가 `localhost` 가 아닌가

**운영 Secret 은 Vercel 이 주지 않으므로 이 셋은 「확인하지 못했다」로 나올 수 있다.** 그때는
기기에서 직접 시험한다(`docs/device-verification.md`).

## 옮긴 뒤 조용히 달라지는 것

- **주소가 바뀐다.** 새 프로젝트는 `<이름>-<해시>.vercel.app` 이다. 메일 링크는 자동으로
  맞지만(`VERCEL_PROJECT_PRODUCTION_URL`), **사람에게 공유한 옛 주소**는 그대로 남는다 —
  커스텀 도메인을 쓰지 않는다면 이 점을 알려야 한다.
- **cron 이 두 번 돈다** — 기존 프로젝트의 배포가 살아 있는 동안. `confirmDueMeetings` 와
  `sweepExpiredRejoins` 는 **둘 다 두 번 돌아도 안전하게** 만들어져 있다(검사가 있다:
  "두 번 돌려도 알림이 늘지 않는다" · "돌아도 같은 것을 다시 끝내지 않는다"). 그래서 급하지
  않지만, 기존 프로젝트를 정리하면 사라진다.
- **`PushSubscription` 은 DB 에 있으므로 그대로 살아 있다.** 프로젝트를 옮긴다고 기기들이 다시
  켜야 하는 것은 아니다 — 같은 `DATABASE_URL` 을 쓰기 때문이다. 다만 **VAPID 키가 같아야**
  기존 구독이 계속 유효하다(스크립트가 같은 값을 옮기므로 유지된다).

## 되돌리기

새 프로젝트가 실패하면 기존 프로젝트의 배포가 그대로 살아 있으므로 **아무것도 잃지 않는다.**
git 연결만 되돌리면 된다.

```bash
vercel git connect https://github.com/rkdansdlf/ChalDDuck.git --project chalddeok -y
```
