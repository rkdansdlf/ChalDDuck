import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * `prisma/migrations` 의 **모든 파일이 커밋되었는지** 확인한다. 아니면 **1 로 끝난다.**
 *
 * 왜 이게 필요한가 — 실제로 있었던 일:
 *
 *   1. 읽기 순화 표를 만들며 `prisma migrate dev` 를 돌렸다. 마이그레이션 파일은 생겼고,
 *      로컬 DB 에도, 실수로 **운영 DB 에도** 적용됐다. 그런데 그 파일은 **커밋되지 않았다.**
 *   2. 그대로 푸시했다. `migrate deploy` 는 커밋된 것만 본다 — 적용할 것이 없다고 정상 종료한다.
 *   3. 그래서 `ReadCushion` 의 `"on"` 컬럼을 지우는 마이그레이션이 **저장소에 없어서** 실행되지
 *      않았다. 운영 DB 에는 그 컬럼이 남았다.
 *   4. `npm run db:check` 가 그 차이를 잡아 빌드는 실패했다. 즉 **증상은 잡혔고 원인은
 *      남아 있었다** — 다음에 스키마가 달라지면 같은 일이 조용히 지나간다.
 *
 * `db:check` 는 **DB 와 스키마**만 본다. "파일이 있는데 커밋이 없다"는 그 둘 어디에도 없다 —
 * 그래서 마이그레이션이 **적용은 됐는데 코드는 모르는** 상태가 생길 수 있다.
 *
 * ## `git ls-files` 가 아니라 `git ls-tree HEAD` 인 이유
 *
 * 스테이징한 파일은 `ls-files` 에 보인다. 그런데 **스테이징은 커밋이 아니다** — 그 상태로 푸시하면
 * 마이그레이션은 가지 않는다. 그래서 이 검사는 **커밋된 것(`HEAD`)** 과 디스크를 비교한다.
 * `git add` 만 하고 커밋을 안 한 그 상태를 여기서 잡는다.
 *
 * ## 왜 로컬에서만 도는가
 *
 * Vercel 은 저장소를 커밋 그대로 클론한다. 거기서는 디스크와 `HEAD` 가 **항상 같으므로** 이 검사는
 * 아무것도 못 잡고, 잡을 수 있는 시점도 이미 지나간 뒤다. 이 사고를 만들 수 있는 것은
 * **푸시하기 전의 로컬**이므로, 여기서만 돌린다(`npm run verify` 의 첫 단계).
 */

const DIR = "prisma/migrations";

/** 마이그레이션 한 개의 파일 이름. Prisma 가 요구하는 그 이름 하나뿐이다. */
const FILE = "migration.sql";

/**
 * `HEAD` 에 커밋된 파일 경로 목록.
 *
 * 저장소가 아니거나 아직 커밋이 없으면 `null` — "커밋과 비교할 대상이 없다"는 뜻이므로 검사를
 * 건너뛴다. 반대로 `HEAD` 가 있는데 조회가 실패하면 **비교가 불가능한 상태**이므로 조용히
 * 통과시키지 않는다(아래에서 다시 확인한다).
 */
function committedPaths() {
  const result = spawnSync("git", ["ls-tree", "-r", "--name-only", "HEAD", DIR], {
    encoding: "utf8",
  });
  if (result.status === 0) {
    return new Set(result.stdout.split("\n").filter(Boolean));
  }
  const stderr = result.stderr ?? "";
  if (stderr.includes("not a git repository")) return null;
  if (stderr.includes("ambiguous argument 'HEAD'") || stderr.includes("bad revision")) {
    return new Set(); // 커밋이 하나도 없는 저장소 — 전부 "아직 커밋 안 됨"으로 잡힌다.
  }
  throw new Error(`\`git ls-tree HEAD ${DIR}\` 가 실패했습니다.\n${stderr}`);
}

function diskPaths() {
  if (!existsSync(DIR)) return [];
  const out = [];
  for (const entry of readdirSync(DIR, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    out.push(join(DIR, entry.name, FILE));
  }
  return out;
}

const committed = committedPaths();
if (committed === null) {
  console.log("[migrations] 저장소가 아니라 비교할 수 없습니다 — 건너뜁니다.");
  process.exit(0);
}

const onDisk = diskPaths();

/** 마이그레이션 폴더가 있는데 그 안에 `migration.sql` 이 없다. */
const empty = onDisk.filter((path) => !existsSync(path)).map((path) => path.replace(`/${FILE}`, ""));
/** 디스크에는 있는데 `HEAD` 에는 없다 — 이게 사고의 모양이다. */
const uncommitted = onDisk.filter((path) => existsSync(path) && !committed.has(path));
/** `HEAD` 에는 있는데 디스크에서 사라졌다 — 지워진 migration 은 배포를 멈춘다. */
const vanished = [...committed]
  .filter((path) => path.endsWith(`/${FILE}`) && !existsSync(path))
  .map((path) => path.replace(`/${FILE}`, ""));

if (empty.length === 0 && uncommitted.length === 0 && vanished.length === 0) {
  console.log(`[migrations] ${onDisk.length}개 모두 커밋되어 있습니다.`);
  process.exit(0);
}

const show = (paths) => paths.map((path) => `       ${path}`).join("\n");

if (uncommitted.length > 0) {
  console.error(
    [
      "",
      "아직 커밋되지 않은 마이그레이션이 있습니다.",
      "이대로 푸시하면 저장소에 없으므로 **운영 DB 에도 적용되지 않습니다.**",
      "그런데 이미 로컬(또는 운영) DB 에 적용된 것이라면, 배포는 조용히 성공하고 읽는 순간",
      "P2022 로 죽습니다 — 화면은 'React error #441' 로만 보입니다.",
      "",
      show(uncommitted),
      "",
      "  git add prisma/migrations && git commit",
      "  (`git add` 만으로는 부족합니다 — 커밋해야 HEAD 에 들어갑니다.)",
    ].join("\n"),
  );
}

if (vanished.length > 0) {
  console.error(
    [
      "",
      "커밋되어 있는 마이그레이션이 디스크에 없습니다.",
      "`migrate deploy` 가 이걸 만나면 실패합니다 — 되돌리세요(`git restore`).",
      "",
      show(vanished),
    ].join("\n"),
  );
}

if (empty.length > 0) {
  console.error(
    [
      "",
      "마이그레이션 폴더가 있는데 `migration.sql` 이 없습니다.",
      "Prisma 는 이 이름 하나만 읽습니다 — 다른 이름의 파일은 조용히 무시됩니다.",
      "",
      show(empty),
    ].join("\n"),
  );
}

process.exit(1);
