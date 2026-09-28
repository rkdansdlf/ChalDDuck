"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import {
  AppBar,
  Body,
  Btn,
  Chip,
  DrawStage,
  Icon,
  Note,
  Toast,
  type IconName,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import type { RandomTool } from "@/lib/types";
import { useAction } from "@/lib/use-action";
import { spinMenu } from "@/server/actions/social";

/**
 * 이 화면이 어디까지 왔는지.
 *
 * 세 단계로 나눈 이유는 **각 단계의 소유자가 다르기 때문**이다. `waiting` 의 끝은 서버가
 * 정하고, `rolling` 의 끝은 연출(=` DrawStage`, 자기 타이머)이 정하고, `done` 은 사람이
 * 다음을 누를 때까지다. 예전처럼 전부 클라이언트 타이머로 굴리면 서버 호출이 실패했을 때
 * 멈출 자리가 사라져, 이름이 무한히 바뀌면서 "정하는 중…" 버튼이 계속 꺼져 있었다.
 */
type Spin =
  /** 서버가 아직 답하지 않았다 — 결과를 알기 전에 연출을 시작할 수는 없다. */
  | { at: "waiting" }
  /** 서버가 정했고, 지금 그 결과를 고른 도구로 보여 주는 중. */
  | { at: "rolling"; tool: RandomTool; pick: string }
  /** 연출이 끝났다. 결과를 내보여도 된다. */
  | { at: "done"; tool: RandomTool; pick: string };

/**
 * 29 친목 · 누가 하지.
 *
 * **결정은 팀에 하나다.** 예전에는 폰마다 `Math.random()` 으로 따로 돌렸고 서버를 부르지도
 * 않았다 — 팀원 네 명이 각자 다른 메뉴를 보고 무엇을 먹을지 합의가 되지 않았고, 새로고침하면
 * 또 다른 값이 나왔다. 이제 서버가 한 번 뽑아 저장하고 모두가 그 값을 본다.
 *
 * **도구도 골라도 된다** — 룰렛·주사위·제비뽑기·사다리타기(`RANDOM_TOOLS` 네 가지). 역할 조율(07)의
 * 추첨이 쓰던 것과 **같은 연출**(`DrawStage`)을 그대로 빌린다. 다만 여기 뽑히는 건 사람이
 * 아니라 밥이라 `Avatar` 붙은 당첨자 카드가 없고, 결과는 이 화면이 그린다.
 *
 * 도구는 고르지만 **결과는 고르지 않는다** — 어떤 도구를 골라도 나오는 값은 `MENU_OPTIONS`
 * 안에서 서버가 뽑는다. 도구를 바꾸고 싶다고 다시 돌리면 팀의 밥도 바뀐다.
 *
 * 결과에 따라 순위를 매기지 않는다 — 친목 기능이 점수가 되면 친목이 아니게 된다.
 */
export function RouletteScreen({
  options,
  tools,
  pick,
  tool,
}: {
  options: string[];
  /** 고를 수 있는 추첨 도구. 역할 조율과 같은 목록이라 키도 같다. */
  tools: RandomTool[];
  /** 팀이 이미 정한 밥. 없으면 아직 아무도 돌리지 않았다. */
  pick: string | null;
  /** 그 밥을 어떤 도구로 정했는지. `pick` 이 있으면 같이 온다. */
  tool: string | null;
}) {
  const router = useRouter();
  const { toast, busy, run } = useAction();

  const [spin, setSpin] = useState<Spin | null>(null);
  /**
   * 이 화면에서 고른 도구. 저장된 값(`tool`)으로 시작해 팀이 마지막으로 쓴 도구가 곧
   * 기본값이다 — 아무도 정하지 않았으면 목록의 첫 도구다.
   */
  const [toolKey, setToolKey] = useState<string>(tool ?? tools[0]?.key ?? "roulette");

  /**
   * 서버에 이미 던졌는가.
   *
   * `disabled` 은 **다음 렌더에서야** 눌린다. 그 틈에 들어온 두 번째 탭은 `useAction.run` 의
   * `running` 집합이 조용히 막는데, 막힌 쪽은 `false` 를 돌려준다(`use-action.ts`). 막힌 것까지
   * "실패한 것"으로 보면 `waiting` 을 되돌려 **남의 굴림을 죽인다.** 그래서 여기로 직접 한 번
   * 더 막고, 이 참이 **실제로** 서버에서 실패했을 때만 되돌린다.
   */
  const fired = useRef(false);

  const chosen = tools.find((t) => t.key === toolKey);
  const spinning = spin !== null && spin.at !== "done";

  /** 지금 화면에 보여 줄 값. 서버가 정한 것이 우선이다. */
  const shown = spin === null || spin.at === "waiting" ? pick : spin.pick;
  /** 그 값이 어떤 도구로 나왔는지. */
  const shownTool = spin === null || spin.at === "waiting" ? tool : spin.tool.name;

  /** 바퀴·제비·사다리는 이름만 읽는다 — `MENU_OPTIONS` 에 MBTI 는 없다. */
  const candidates = useMemo(() => options.map((name) => ({ name })), [options]);

  /** 실패해도 반드시 빠져나갈 수 있는 유일한 자리 — 실제 실패는 `run` 의 `false` 다. */
  const release = (ok: boolean) => {
    if (ok) return;
    fired.current = false;
    setSpin(null);
  };

  const spinMenuPick = () => {
    if (fired.current || !chosen || options.length === 0) return;
    const tool = chosen;
    fired.current = true;
    setSpin({ at: "waiting" });

    // **서버가 먼저 뽑는다.** 여기는 그 결과를 도구별 연출로 천천히 보여 줄 뿐이다 — 예전에는
    // 여기가 뽑아서, 팀원이 몇 명인지에 따라 모두 다른 답이 나왔다.
    void run(
      "spin",
      async () => {
        const picked = await spinMenu(tool.name);
        setSpin({ at: "rolling", tool, pick: picked });
        // 알림은 서버가 팀 전체에 보냈다. 여기서는 다시 말하지 않는다.
        router.refresh();
      },
      "정하지 못했습니다. 잠시 뒤 다시 눌러 주세요.",
    ).then(release);
  };

  /** 연출이 끝나면 결과를 내보인다. 타이머는 `DrawStage` 가 가지고 있다. */
  const onLanded = () => {
    fired.current = false;
    setSpin((prev) => (prev?.at === "rolling" ? { at: "done", tool: prev.tool, pick: prev.pick } : prev));
  };

  return (
    <>
      <AppBar title="누가 하지" sub="오늘 밥 정하기" onBack={() => router.push("/team")} />

      <Body dense className="flex flex-col">
        <p className="text-pretty-keep mt-1 mb-[18px] text-[14.5px] leading-[1.62] text-txt">
          여기서 정한 건 <b>팀에 하나</b>입니다. 정하기 전에는 누구도 볼 수 없고, 정한 뒤에는 모두
          같은 값을 봅니다. 순위는 매기지 않습니다.
        </p>

        <p className="t-note-title keep-all mb-[9px] text-txt-strong">무엇으로 정할까요</p>
        <div className="mb-[18px] grid grid-cols-2 gap-[9px]">
          {tools.map((t) => {
            const on = t.key === toolKey;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setToolKey(t.key)}
                disabled={spinning}
                // 색만으로 "고른 것"을 말하지 않는다(공통 규칙) — 고른 타일에 체크를 함께 둔다.
                aria-pressed={on}
                className={cn(
                  "relative flex min-h-[76px] flex-col items-center justify-center gap-[7px] rounded-2xl border transition-colors duration-150",
                  on ? "border-line-strong bg-yellow-100 text-ink-900" : "border-line bg-card text-txt-strong",
                  spinning ? "cursor-default" : "cursor-pointer active:scale-[0.97]",
                )}
              >
                {on ? (
                  <span className="absolute right-2.5 top-2.5 text-yellow-700">
                    <Icon name="check" size={13} />
                  </span>
                ) : null}
                <Icon name={t.icon as IconName} size={24} />
                <span className="font-bold text-[14px] leading-none">{t.name}</span>
              </button>
            );
          })}
        </div>

        <div
          // 결과가 바뀌면 스크린 리더가 읽어 준다 — 애니메이션만으로는 알 수 없다.
          role="status"
          className="mb-[18px] flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-card bg-yellow-100 px-4 text-center transition-all duration-300"
        >
          {spin === null ? (
            shown ? (
              <div className="animate-pop flex flex-col items-center gap-1">
                <span className="t-cap-strong text-yellow-700" style={{ letterSpacing: ".06em" }}>
                  ✨ 오늘은 이거!
                </span>
                <span className="font-extrabold text-[26px] leading-[1.3] text-ink-900 animate-jelly">
                  {shown}
                </span>
              </div>
            ) : (
              <span className="font-semibold text-[14px] leading-[1.4] text-yellow-700">
                버튼을 눌러 정해요
              </span>
            )
          ) : spin.at === "waiting" ? (
            <div className="flex flex-col items-center gap-2">
              <span className="animate-spin text-yellow-700">
                <Icon name="loader-circle" size={26} />
              </span>
              <span className="font-extrabold text-[22px] leading-[1.3] text-ink-800 animate-pulse">
                고르는 중…
              </span>
            </div>
          ) : (
            <DrawStage
              toolKey={spin.tool.key}
              candidates={candidates}
              winner={spin.pick}
              onLanded={onLanded}
            />
          )}
        </div>

        {shown && !spinning ? (
          <Note tone="info" icon="users-round" className="mb-[18px]">
            지금 정해진 건 <b>{shown}</b>
            {shownTool ? (
              <>
                {" "}
                (<b>{shownTool}</b>로)
              </>
            ) : null}{" "}
            입니다. 다시 돌리면 전체가 함께 바뀝니다 — 지금 정한 대로 갈 수도 있습니다.
          </Note>
        ) : null}

        <div className="mb-[18px] flex flex-wrap gap-1.5">
          {options.map((option) => (
            <Chip key={option} tone={option === shown ? "y" : undefined}>
              {option}
            </Chip>
          ))}
        </div>

        <Btn
          full
          size="lg"
          icon={(chosen?.icon ?? "dices") as IconName}
          onClick={spinMenuPick}
          disabled={busy.spin || spinning || !chosen}
        >
          {spinning ? "정하는 중…" : shown ? "다른 거로 정하기" : "정하기"}
        </Btn>
      </Body>

      <Toast msg={toast} />
    </>
  );
}
