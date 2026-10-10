#!/bin/sh
# 새 Vercel 프로젝트로 **환경변수만** 옮긴다 — 2026-10-09.
#
# ## 왜 이 스크립트가 있는가
#
# 기존 프로젝트(`chalddeok`)가 `Resource provisioning failed` 로 **빌드를 시작조차 못 한다.**
# 코드 문제가 아니다 — 빌드가 0.5초에 죽고 `builds: 0` 이며, 배포 한도도 남아 있고(하루 3건/
# 한도 100) Vercel 상태 페이지도 정상이다. 프로젝트 쪽 provision 문제라 코드로 풀 수 없다.
#
# 그래서 새 프로젝트로 옮겨 우회한다. 옮길 것은 **환경변수 11개**이고, 값은 전부 저장소 밖
# `.env` 에 이미 있다(운영 설정이 그대로 들어 있다). 대시보드에서 손으로 옮기면 11번 복사·붙여
# 넣기를 하게 되고 **한 번 틀리면 조용히 다르게 동작한다** — 그래서 스크립트로 옮긴다.
#
# ## 값은 화면에 찍지 않는다
#
# 이 스크립트는 값을 **한 번도 출력하지 않는다.** 무엇을 넣었는지(이름과 종류)만 말한다.
# 파이프로 바로 넘기므로 셸 히스토리에도, 터미널 스크롤백에도 남지 않는다.
#
# ## 쓰는 법
#
#     sh scripts/move-vercel-project.sh <새-프로젝트-이름>              # 미리 보기
#     sh scripts/move-vercel-project.sh <새-프로젝트-이름> --apply       # 실제로 넣기
#
# 그 뒤 `docs/vercel-project-move.md` 의 나머지 단계를 따른다.

set -e

NEW="${1:-}"
APPLY="${2:-}"

if [ -z "$NEW" ]; then
  echo "새 프로젝트 이름을 인자로 주세요." >&2
  echo "  sh scripts/move-vercel-project.sh chalddeok-2 --apply" >&2
  exit 2
fi

cd "$(git rev-parse --show-toplevel)"

if [ ! -f .env ]; then
  echo ".env 가 없습니다. 값을 옮길 수 없습니다 — 이 스크립트는 저장소 밖 파일에서 읽습니다." >&2
  exit 1
fi

# 운영에 필요한 **전부**. 하나라도 없으면 시작하지 않는다 — 절반만 옮긴 프로젝트는
# "배포는 됐는데 메일이 안 간다" 같은 모양이 되고, 그 원인을 찾는 데 훨씬 오래 걸린다.
NEEDED="CRON_SECRET DATABASE_URL DIRECT_URL GMAIL_APP_PASSWORD GMAIL_USER NEXT_PUBLIC_VAPID_PUBLIC_KEY OPENROUTER_KEY SUPABASE_SECRET_KEY SUPABASE_URL VAPID_PRIVATE_KEY VAPID_SUBJECT"

# 값에 따옴표가 있으면 벗겨낸다. 값 안의 `=` 는 그대로 둔다(키가 base64 라 `=` 로 끝난다).
value_of() {
  sed -n "s/^$1=//p" .env | head -1 | sed 's/^"//; s/"$//; s/^'"'"'//; s/'"'"'$//'
}

missing=""
for k in $NEEDED; do
  [ -z "$(value_of "$k")" ] && missing="$missing $k"
done
if [ -n "$missing" ]; then
  echo "이 키들의 값이 .env 에 없습니다:$missing" >&2
  exit 1
fi

echo "새 프로젝트: $NEW"
echo "옮길 환경변수: 11개 (값은 찍지 않습니다)"
echo

if [ "$APPLY" != "--apply" ]; then
  # **미리 보기에서는 아무것도 만들지 않는다.** 무엇이 어느 종류로 들어가는지만 보여 준다.
  echo "── 미리 보기 (실제로 넣으려면 --apply) ──"
  echo "  vercel project create $NEW"
  for k in $NEEDED; do
    case "$k" in
      # **클라이언트로 인라인되는 값만 Config 다.** `NEXT_PUBLIC_` 접두사는 빌드 시점에 코드에
      # 박히므로 Secret 으로 두면 빌드가 값을 못 읽는다 — 그러면 화면에서 푸시를 켤 수 없다.
      NEXT_PUBLIC_*) echo "  vercel env add $k production --type config    (브라우저로 나가는 값이라 Config)" ;;
      *) echo "  vercel env add $k production --type secret" ;;
    esac
  done
  echo
  echo "그다음: docs/vercel-project-move.md 의 2~4단계"
  exit 0
fi

echo "── 1. 프로젝트 ──"
# 이미 있으면 만들지 않는다(`project create` 는 중복 이름에 실패한다).
if vercel project inspect "$NEW" >/dev/null 2>&1; then
  echo "  $NEW — 이미 있습니다"
else
  vercel project create "$NEW" >/dev/null
  echo "  $NEW — 만들었습니다"
fi

echo
echo "── 2. 환경변수 ──"
for k in $NEEDED; do
  case "$k" in
    NEXT_PUBLIC_*) TYPE=config ;;
    *) TYPE=secret ;;
  esac
  # `--force` 로 다시 돌려도 같은 결과가 되게 한다. 값은 파이프로만 지나간다.
  value_of "$k" | vercel env add "$k" production --project "$NEW" --force --type "$TYPE" >/dev/null
  echo "  $k ($TYPE)"
done

echo
echo "── 3. 확인 ──"
vercel env ls --project "$NEW" 2>&1 | grep -c production | xargs echo "  production 환경변수"
echo
echo "다음: docs/vercel-project-move.md 의 3단계(git 연결)와 4단계(검증). **대시보드에서 해야 하는"
echo "것이 하나 있습니다** — 기존 프로젝트의 git 연결을 끊어야 push 가 두 곳으로 가지 않습니다."
