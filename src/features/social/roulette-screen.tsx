"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AppBar, Body, Btn, Chip, Icon, Note, Toast } from "@/components/ui";
import { useAction } from "@/lib/use-action";
import { spinMenu } from "@/server/actions/social";

/** 돌아가는 느낌을 주는 시간. 결과는 누른 순간 이미 서버에 정해져 있다. */
const SPIN_MS = 700;

/**
 * 29 친목 · 누가 하지.
 *
 * **결정은 팀에 하나다.** 예전에는 폰마다 `Math.random()` 으로 따로 돌렸고 서버를 부르지도
 * 않았다 — 팀원 네 명이 각자 다른 메뉴를 보고 무엇을 먹을지 합의가 되지 않았고, 새로고침하면
 * 또 다른 값이 나왔다. 이제 서버가 한 번 뽑아 저장하고 모두가 그 값을 본다.
 *
 * 보여 주는 순서가 이 화면의 전부다: **이미 정해진 밥이 있으면 그게 먼저 보인다.** 다시
 * 돌리려면 그 위에 다시 만들라는 말을 남긴다.
 *
 * 결과에 따라 순위를 매기지 않는다 — 친목 기능이 점수가 되면 친목이 아니게 된다.
 */
export function RouletteScreen({
  options,
  pick,
}: {
  options: string[];
  /** 팀이 이미 정한 밥. 없으면 아직 아무도 돌리지 않았다. */
  pick: string | null;
}) {
  const router = useRouter();
  const { toast, busy, run } = useAction();

  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [rollingLabel, setRollingLabel] = useState<string>("");
  const timer = useRef<number | null>(null);
  const rollInterval = useRef<number | null>(null);

  /**
   * 굴리는 것을 멈추고 **다시 누를 수 있게** 돌려놓는다.
   *
   * 굴림 구간은 세 곳에서만 멈췄다 — 화면을 떠날 때, 다음spin 의 시작, 성공한 뒤의 예약.
   * **서버 호출이 실패하면 그 셋 어디에도 도달하지 못했다.** `useAction.run` 이 오류를
   * 삼키므로(`use-action.ts`) 예약된 정리로 넘어가지 않았고, 결과적으로 이름이 무한히
   * 바뀌면서 "정하는 중…" 버튼이 계속 꺼져 있었다. 네트워크 한 번 실패하면 그 화면에서 빠져나갈
   * 방법이 없고, 다시 시도도 눌러 볼 수 없다 — 유일한 탈출은 다른 곳으로 이동하는 것뿐이었다.
   *
   * 그래서 **실패해도 반드시 이 자리를 지나게** 만든다(`run` 의 반환값이 그 신호다).
   */
  const stopRolling = () => {
    if (rollInterval.current) {
      window.clearInterval(rollInterval.current);
      rollInterval.current = null;
    }
    setSpinning(false);
  };

  // 화면을 떠나면 예약된 setState 가 남지 않게 한다.
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
    stopRolling();
  }, []);

  const spin = () => {
    if (busy.spin || options.length === 0) return;
    setSpinning(true);
    setResult(null);

    if (timer.current) window.clearTimeout(timer.current);
    stopRolling();

    let idx = 0;
    rollInterval.current = window.setInterval(() => {
      idx = (idx + 1) % options.length;
      setRollingLabel(options[idx] ?? "");
    }, 70);

    // **서버가 먼저 뽑는다.** 여기는 그 결과를 천천히 보여 줄 뿐이다 — 예전에는 여기가
    // 뽑아서, 팀원이 몇 명인지에 따라 모두 다른 답이 나왔다.
    void run(
      "spin",
      async () => {
        const picked = await spinMenu();
        timer.current = window.setTimeout(() => {
          setResult(picked);
          stopRolling();
        }, SPIN_MS);
        // 알림은 서버가 팀 전체에 보냈다. 여기서는 다시 말하지 않는다.
        router.refresh();
      },
      "정하지 못했습니다. 잠시 뒤 다시 눌러 주세요.",
    ).then((ok) => {
      // 실패하면 굴림을 멈추고 버튼을 되돌린다. 사용자가 다시 누를 수 있어야 한다.
      if (!ok) stopRolling();
    });
  };

  /** 지금 화면에 보여 줄 값. 서버가 정한 것이 우선이다. */
  const shown = result ?? pick;

  return (
    <>
      <AppBar title="누가 하지" sub="오늘 밥 정하기" onBack={() => router.push("/team")} />

      <Body dense className="flex flex-col">
        <p className="text-pretty-keep mt-1 mb-[18px] text-[14.5px] leading-[1.62] text-txt">
          여기서 정한 건 <b>팀에 하나</b>입니다. 정하기 전에는 누구도 볼 수 없고, 정한 뒤에는 모두
          같은 값을 봅니다. 순위는 매기지 않습니다.
        </p>

        <div
          // 결과가 바뀌면 스크린 리더가 읽어 준다 — 애니메이션만으로는 알 수 없다.
          role="status"
          className="mb-[18px] flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-card bg-yellow-100 px-4 text-center transition-all duration-300"
        >
          {spinning ? (
            <div className="flex flex-col items-center gap-2">
              <span className="animate-spin text-yellow-700">
                <Icon name="loader-circle" size={26} />
              </span>
              <span className="font-extrabold text-[22px] leading-[1.3] text-ink-800 animate-pulse">
                {rollingLabel || "고르는 중…"}
              </span>
            </div>
          ) : shown ? (
            <div className="animate-pop flex flex-col items-center gap-1">
              <span className="t-cap-strong text-yellow-700" style={{ letterSpacing: ".06em" }}>
                ✨ 오늘은 이거!
              </span>
              <span className="font-extrabold text-[26px] leading-[1.3] text-ink-900 animate-jelly">{shown}</span>
            </div>
          ) : (
            <span className="font-semibold text-[14px] leading-[1.4] text-yellow-700">
              버튼을 눌러 정해요
            </span>
          )}
        </div>

        {shown && !spinning ? (
          <Note tone="info" icon="users-round" className="mb-[18px]">
            지금 정해진 건 <b>{shown}</b> 입니다. 다시 돌리면 전체가 함께 바뀝니다 — 지금 정한
            대로 갈 수도 있습니다.
          </Note>
        ) : null}

        <div className="mb-[18px] flex flex-wrap gap-1.5">
          {options.map((option) => (
            <Chip key={option} tone={option === shown ? "y" : undefined}>
              {option}
            </Chip>
          ))}
        </div>

        <Btn full size="lg" icon="dices" onClick={spin} disabled={busy.spin}>
          {spinning ? "정하는 중…" : shown ? "다른 거로 정하기" : "정하기"}
        </Btn>
      </Body>

      <Toast msg={toast} />
    </>
  );
}
