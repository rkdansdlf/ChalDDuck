#!/bin/sh
# 푸시 전에 같은 검사를 돌린다 — `vercel.json` 이 하는 것을 로컬에서 먼저 한다.
#
# ## 왜 있는가
#
# 2026-09-28: 화면만 먼저 반영하고 `src/data/api.ts` 반영을 빼서 **타입 에러 57건**인 커밋이
# push 됐다. Vercel 빌드가 실패했고(2회), 그 사실을 알게 된 건 배포 목록을 봤을 때였다.
#
# 이 훅이 막는 것은 정확히 그 사건이다. `vercel.json` 의
# `prisma migrate deploy && npm run db:check && next build` 와 **같은 순서**로 돌린다 —
# 로컬에서 통과하고 Vercel 에서 실패하면 그건 이 훅의 목록에 없는 무언가다.
#
# ## 왜 저장소 안에 있는가
#
# `.git/hooks/` 는 커밋되지 않는다 — 여기 적어도 두면 아무도 모른다. 그래서 규칙은 이 파일에
# 두고, `.git/hooks/pre-push` 는 이 파일을 부르는 것만 한다.
#
# 다른 사람이 이 저장소를 쓰한다면:
#
#     mkdir -p .git/hooks
#     cp scripts/pre-push.sh .git/hooks/pre-push && chmod +x .git/hooks/pre-push
#
# ## 검사를 빼고 싶은 경우
#
# `--no-verify` 로 부를 수 있다. 다만 Vercel 빌드가 빨개질 거라는 것을 알고 하자 — 오늘
# 그렇게 알 수 있었던 건 배포 목록을 봤을 때뿐이었다.

set -e

cd "$(git rev-parse --show-toplevel)"

echo ""
echo "── 푸시 전 검사 (npm run verify) ──────────────────────────"
echo "   깨진 커밋이 Vercel 빌드까지 가지 않도록 여기서 막습니다."
echo "   시간이 걸리면 --no-verify 로 부르되, 그 뒤 배포가 빨개질 수 있습니다."
echo ""

npm run verify

echo ""
echo "── 검사 통과. 푸시합니다. ──────────────────────────────────"
echo ""
