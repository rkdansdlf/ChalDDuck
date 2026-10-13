"use client";

import { useEffect, useMemo, useState } from "react";
import type { MbtiType } from "@/lib/mbti";
import type { DiceClashRound } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Avatar } from "./avatar";
import { Chip } from "./chip";
import { Icon } from "./icon";
import {
  findStartColumnForWinner,
  generateLadderRungs,
  getInterpolatedPoint,
  getPathSegments,
  pointsToSvgPath,
  tracePathWaypoints,
  type LadderGeometry,
  type Point,
} from "@/lib/ladder-engine";

/**
 * 07(역할 조율)의 "추첨" 화면에 쓰는 연출.
 *
 * 당첨자는 이미 서버가 정했다 — 여기서는 그 결과를 도구별로 다르게 "보여주기"만 한다
 * (룰렛/주사위/제비뽑기/사다리타기, `RANDOM_TOOLS` 의 key 그대로). 도구를 고른 뒤 서버
 * 응답을 기다렸다가 결과를 쥐고 이 컴포넌트를 띄우므로, 연출 도중에는 새 데이터를
 * 기다릴 필요 없이 정해진 타이밍표대로만 움직이면 된다.
 */

export type DrawCandidate = { name: string; mbti: MbtiType | null };

/**
 * 이름만 필요한 후보 — 29 팀 추첨처럼 **사람이 아니라 값을** 뽑을 때 쓴다.
 * 바퀴·제비·사다리는 이름만 읽고, MBTI 는 오직 `WinnerCard` 만 쓴다.
 */
type DrawName = { name: string };

const REVEAL_DELAY_MS = 1100;

/**
 * 도구별 연출 **만**.
 *
 * `DrawGame` 은 여기에 사람 전용 당첨자 카드(`Avatar`)를 얹은 한 겹이다. 값을 뽑는 화면은
 * `Avatar` 가 들어갈 자리가 없어서 — 그래서 여기만 빌려 쓴다. **결과 표시는 호출한 화면이 자기
 * 모양으로 한다**(`onLanded` 로 "연출이 끝났다"는 신호만 받는다).
 */
export function DrawStage({
  toolKey,
  candidates,
  winner = "",
  onLanded = () => {},
  preview = false,
}: {
  toolKey: string;
  candidates: DrawName[];
  winner?: string;
  /** 연출이 끝났을 때 한 번 온다 — 결과를 여는 시점이 여기서 정해진다. */
  onLanded?: () => void;
  preview?: boolean;
}) {
  return (
    <>
      {toolKey === "roulette" ? (
        <RouletteStage candidates={candidates} winner={winner} onLanded={onLanded} />
      ) : toolKey === "draw" ? (
        <TicketStage candidates={candidates} winner={winner} onLanded={onLanded} />
      ) : toolKey === "ladder" ? (
        <LadderStage candidates={candidates} winner={winner} onLanded={onLanded} preview={preview} />
      ) : (
        <DiceStage candidates={candidates} winner={winner} onLanded={onLanded} />
      )}
    </>
  );
}

export function DrawGame({
  toolKey,
  toolName,
  candidates,
  winner,
  onFinish,
}: {
  toolKey: string;
  toolName: string;
  candidates: DrawCandidate[];
  winner: string;
  onFinish: () => void;
}) {
  const [landed, setLanded] = useState(false);

  useEffect(() => {
    if (!landed) return;
    const t = setTimeout(onFinish, REVEAL_DELAY_MS);
    return () => clearTimeout(t);
  }, [landed, onFinish]);

  const target = useMemo<DrawCandidate>(
    () => candidates.find((c) => c.name === winner) ?? { name: winner, mbti: null },
    [candidates, winner],
  );

  return (
    <div className="flex flex-col items-center gap-5 py-1">
      <p className="t-note keep-all text-txt-muted">
        {landed ? `${toolName} 결과가 나왔어요` : `${toolName} 추첨 중…`}
      </p>

      <DrawStage
        toolKey={toolKey}
        candidates={candidates}
        winner={winner}
        onLanded={() => setLanded(true)}
      />

      {landed ? <WinnerCard candidate={target} /> : null}
    </div>
  );
}

/** 등장 애니메이션 — 마운트된 다음 프레임에 클래스를 바꿔 transition 을 태운다. */
function usePop() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return shown;
}

const CONFETTI_PIECES = [
  { dx: "-75px", dy: "-65px", rot: "120deg", bg: "bg-yellow-400", size: "w-2.5 h-2 rounded-xs" },
  { dx: "70px", dy: "-70px", rot: "-90deg", bg: "bg-coral-400", size: "w-2 h-2.5 rounded-xs" },
  { dx: "-95px", dy: "-20px", rot: "180deg", bg: "bg-yellow-500", size: "w-2 h-2 rounded-full" },
  { dx: "90px", dy: "-25px", rot: "75deg", bg: "bg-ok", size: "w-2.5 h-1.5 rounded-xs" },
  { dx: "-45px", dy: "-90px", rot: "-140deg", bg: "bg-coral-300", size: "w-2 h-2 rounded-full" },
  { dx: "50px", dy: "-85px", rot: "160deg", bg: "bg-yellow-300", size: "w-3 h-2 rounded-xs" },
  { dx: "-105px", dy: "25px", rot: "-60deg", bg: "bg-coral-600", size: "w-2 h-2.5 rounded-xs" },
  { dx: "100px", dy: "20px", rot: "110deg", bg: "bg-yellow-600", size: "w-2.5 h-2 rounded-xs" },
  { dx: "-30px", dy: "-105px", rot: "45deg", bg: "bg-ok", size: "w-2 h-2 rounded-full" },
  { dx: "30px", dy: "-110px", rot: "-75deg", bg: "bg-coral-200", size: "w-2.5 h-2.5 rounded-xs" },
  { dx: "-65px", dy: "45px", rot: "-110deg", bg: "bg-yellow-400", size: "w-2 h-2 rounded-full" },
  { dx: "70px", dy: "50px", rot: "135deg", bg: "bg-coral-400", size: "w-2.5 h-2 rounded-xs" },
];

function ConfettiBurst() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center z-20">
      {CONFETTI_PIECES.map((piece, i) => (
        <span
          key={i}
          className={cn("absolute animate-confetti", piece.bg, piece.size)}
          style={{
            ["--dx" as string]: piece.dx,
            ["--dy" as string]: piece.dy,
            ["--rot" as string]: piece.rot,
          }}
        />
      ))}
    </div>
  );
}

function WinnerCard({ candidate }: { candidate: DrawCandidate }) {
  const shown = usePop();
  return (
    <div
      className={cn(
        "relative flex flex-col items-center gap-2 transition-all duration-300 ease-out",
        shown ? "scale-100 opacity-100 animate-pop" : "scale-75 opacity-0",
      )}
    >
      {shown ? <ConfettiBurst /> : null}
      <Avatar name={candidate.name} mbti={candidate.mbti} size={56} />
      <span className="t-h2 keep-all text-txt-strong">{candidate.name}</span>
      <Chip tone="ok" icon="check" iconClassName="animate-pop">
        당첨
      </Chip>
    </div>
  );
}

/* ── 룰렛 — 바퀴가 돌다가 당첨자 조각에서 멈춘다 ───────────────────────── */

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function wedgePath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

const ROULETTE_SPIN_MS = 2200;

function RouletteStage({
  candidates,
  winner,
  onLanded,
}: {
  candidates: DrawName[];
  winner: string;
  onLanded: () => void;
}) {
  const n = Math.max(1, candidates.length);
  const step = 360 / n;
  const winnerIndex = Math.max(0, candidates.findIndex((c) => c.name === winner));
  const centerAngle = winnerIndex * step + step / 2;

  const [deg, setDeg] = useState(0);
  useEffect(() => {
    // 각 조각의 라벨을 중심각(midAngle)에 맞춰 회전시켜 배치하므로,
    // 당첨 조각이 상단 12시(화살표)에 안착했을 때 글자가 항상 똑바로(upright) 보인다.
    const id = requestAnimationFrame(() => setDeg(4 * 360 + (360 - centerAngle)));
    const t = setTimeout(onLanded, ROULETTE_SPIN_MS + 100);
    return () => {
      cancelAnimationFrame(id);
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative" style={{ width: 190, height: 190 }}>
      <div
        className="absolute inset-0"
        style={{ transform: `rotate(${deg}deg)`, transition: `transform ${ROULETTE_SPIN_MS}ms cubic-bezier(.12,.73,.14,1)` }}
      >
        <svg viewBox="0 0 190 190" width={190} height={190}>
          {candidates.map((c, i) => (
            <path
              key={c.name}
              d={wedgePath(95, 95, 91, i * step, (i + 1) * step)}
              className={i % 2 === 0 ? "fill-yellow-200" : "fill-cr-100"}
              stroke="var(--line)"
              strokeWidth={1}
            />
          ))}
          {candidates.map((c, i) => {
            const midAngle = i * step + step / 2;
            return (
              <g key={c.name} transform={`rotate(${midAngle}, 95, 95)`}>
                <text
                  x={95}
                  y={38}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-txt-strong"
                  style={{ font: "700 11px var(--font-sans)" }}
                >
                  {c.name.length > 4 ? `${c.name.slice(0, 4)}…` : c.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div
        className="absolute left-1/2 top-[-2px] -translate-x-1/2"
        style={{
          width: 0,
          height: 0,
          borderLeft: "7px solid transparent",
          borderRight: "7px solid transparent",
          borderTop: "11px solid var(--c-600)",
        }}
      />
    </div>
  );
}

/* ── 주사위 — 3D 큐브가 굴러 당첨 눈에서 멈춘다 ─────────────────────
 *
 * 당첨자는 이미 서버가 정했다 — 여기서 굴리는 눈은 그 결과를 "보여주는" 상징이다.
 * 그래서 굴리는 동안의 눈은 난수(연출용)지만, 멈추는 눈은 항상 당첨자의 눈이다.
 * 후보 순서대로 눈을 배정한다(1번 후보→1, 2번 후보→2 … 6번 후보→6, 7번 후보→1 …).
 * 후보가 6명을 넘으면 눈을 공유하므로 눈만으로 당첨자를 특정할 수 없고,
 * 이때는 아래 대조표의 당첨 행 하이라이트가 "누가 당첨인지"를 말한다.
 */

const DICE_SIZE = 84;
const DICE_HALF = DICE_SIZE / 2;
const DICE_TUMBLE_MS = 150;
const DICE_TUMBLES = 8;
const DICE_SETTLE_MS = 550;

/** 표준 배치(반대면 합 7): 앞1·뒤6·위2·아래5·오른쪽3·왼쪽4. */
const DICE_FACE_TRANSFORM: Record<number, string> = {
  1: `translateZ(${DICE_HALF}px)`,
  6: `rotateY(180deg) translateZ(${DICE_HALF}px)`,
  3: `rotateY(90deg) translateZ(${DICE_HALF}px)`,
  4: `rotateY(-90deg) translateZ(${DICE_HALF}px)`,
  2: `rotateX(90deg) translateZ(${DICE_HALF}px)`,
  5: `rotateX(-90deg) translateZ(${DICE_HALF}px)`,
};

/** 각 눈을 정면으로 가져오는 큐브 회전값(위 면 배치를 뒤집는다). */
const DICE_FACE_ORIENT: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  6: { x: 0, y: 180 },
  3: { x: 0, y: -90 },
  4: { x: 0, y: 90 },
  2: { x: -90, y: 0 },
  5: { x: 90, y: 0 },
};

/** 3×3 격자(왼쪽 위 0 … 오른쪽 아래 8) 중 점이 찍히는 칸. */
const DICE_PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

/** 후보 순서 → 눈. 7번째부터는 1로 돌아온다(위 주석). */
function diceFaceOf(index: number) {
  return (index % 6) + 1;
}

function Pips({ n, dotClass }: { n: number; dotClass: string }) {
  const cells = DICE_PIPS[n] ?? [4];
  return (
    <span aria-hidden="true" className="grid size-full grid-cols-3 grid-rows-3">
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className="grid place-items-center">
          {cells.includes(i) ? <span className={cn("rounded-full", dotClass)} /> : null}
        </span>
      ))}
    </span>
  );
}

export function MiniDie({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-[26px] flex-none place-items-center rounded-md border border-line bg-card p-[5px] shadow-2xs"
    >
      <Pips n={n} dotClass="size-[3px] bg-ink-900" />
    </span>
  );
}

function DiceStage({
  candidates,
  winner,
  onLanded,
}: {
  candidates: DrawName[];
  winner: string;
  onLanded: () => void;
}) {
  const winnerIndex = Math.max(
    0,
    candidates.findIndex((c) => c.name === winner),
  );
  const winnerFace = diceFaceOf(winnerIndex);

  const [spin, setSpin] = useState({ x: -18, y: 24 });
  const [landed, setLanded] = useState(false);

  useEffect(() => {
    // 전체 시퀀스를 미리 정한다 — 매 틱 한 바퀴씩 더해 역회전 없이 굴러간다.
    // 중간 눈은 난수(스포 방지: 당첨 눈이 미리 보이지 않게 마지막 직전 틱은 당첨 눈을 피한다).
    const steps: { x: number; y: number }[] = [];
    for (let i = 0; i < DICE_TUMBLES; i++) {
      const face =
        i === DICE_TUMBLES - 1
          ? [1, 2, 3, 4, 5, 6].filter((f) => f !== winnerFace)[
              Math.floor(Math.random() * 5)
            ]
          : 1 + Math.floor(Math.random() * 6);
      const o = DICE_FACE_ORIENT[face];
      steps.push({ x: o.x + 360 * (i + 1), y: o.y + 360 * (i + 1) });
    }
    const end = DICE_FACE_ORIENT[winnerFace];
    const settled = { x: end.x + 360 * (DICE_TUMBLES + 2), y: end.y + 360 * (DICE_TUMBLES + 2) };

    const timers: number[] = [];
    steps.forEach((s, i) => {
      timers.push(window.setTimeout(() => setSpin(s), DICE_TUMBLE_MS * (i + 1)));
    });
    timers.push(
      window.setTimeout(() => {
        setSpin(settled);
        setLanded(true);
      }, DICE_TUMBLE_MS * DICE_TUMBLES),
      window.setTimeout(onLanded, DICE_TUMBLE_MS * DICE_TUMBLES + DICE_SETTLE_MS),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className={cn(landed && "animate-pop")}>
        <div
          aria-hidden="true"
          className="grid place-items-center"
          style={{ width: DICE_SIZE + 32, height: DICE_SIZE + 28, perspective: "600px" }}
        >
          <div
            className="relative text-ink-900"
            style={{
              width: DICE_SIZE,
              height: DICE_SIZE,
              transformStyle: "preserve-3d",
              transform: `rotateX(${spin.x}deg) rotateY(${spin.y}deg)`,
              transition: `transform ${landed ? DICE_SETTLE_MS : DICE_TUMBLE_MS}ms ${landed ? "cubic-bezier(.2,.7,.2,1)" : "linear"}`,
            }}
          >
            {[1, 2, 3, 4, 5, 6].map((face) => (
              <div
                key={face}
                className="absolute inset-0 rounded-2xl border border-line bg-card p-3 shadow-md"
                style={{
                  transform: DICE_FACE_TRANSFORM[face],
                  backfaceVisibility: "hidden",
                }}
              >
                <Pips n={face} dotClass="size-2.5 bg-ink-900" />
              </div>
            ))}
          </div>
        </div>
        <div
          aria-hidden="true"
          className={cn(
            "mx-auto h-2 w-24 rounded-full bg-ink-900/10 blur-[2px] transition-all",
            landed ? "scale-x-100 opacity-70" : "animate-pulse-subtle scale-x-75 opacity-50",
          )}
        />
      </div>

      {candidates.length > 0 ? (
        <ol className="flex w-full max-w-[280px] flex-col gap-1.5">
          {candidates.map((c, i) => {
            const face = diceFaceOf(i);
            const isWinner = c.name === winner;
            const dimmed = landed && !isWinner;
            return (
              <li
                key={c.name}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-2.5 py-1.5 transition-all duration-300",
                  landed && isWinner
                    ? "scale-[1.02] border-ok bg-ok-bg shadow-sm animate-pop"
                    : "border-line bg-card",
                  dimmed && "opacity-55",
                )}
              >
                <MiniDie n={face} />
                <span className="t-cap-strong keep-all flex-1 text-txt-strong">{c.name}</span>
                {landed && isWinner ? (
                  <Icon name="check" size={14} strokeWidth={3} className="text-ok" />
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}

/* ── 주사위 게임 — 전원이 굴려 눈이 가장 높은 사람이 이긴다 ──────────────
 *
 * 위 `DiceStage`(역할 조율용 1인 큐브)와 다르다. 여기는 후보가 팀원 전원이라
 * 큐브 하나로 눈을 보여줄 수 없고, 라운드마다 각자 굴린 눈을 표로 공개한다.
 * 라운드는 서버가 이미 정했다(`rollDiceClash`) — 한 장씩 넘기며 보여주기만 한다.
 * 동점으로 다음 라운드가 있으면 그 장도 서버 기록 그대로 보여준다.
 */

const CLASH_ROUND_MS = 1100;
const CLASH_SETTLE_MS = 600;

export function DiceClashStage({
  rounds,
  winner,
  onLanded,
}: {
  rounds: DiceClashRound[];
  winner: string;
  onLanded: () => void;
}) {
  /** 지금까지 공개한 라운드 수. 1부터 시작해 한 장씩 넘긴다. */
  const [shown, setShown] = useState(1);
  const done = shown >= rounds.length;

  useEffect(() => {
    const t = window.setTimeout(
      () => {
        if (done) onLanded();
        else setShown((s) => s + 1);
      },
      done ? CLASH_SETTLE_MS : CLASH_ROUND_MS,
    );
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  if (rounds.length === 0) return null;

  return (
    <div className="flex w-full max-w-[280px] flex-col gap-2.5">
      {rounds.slice(0, shown).map((round, i) => {
        const top = Math.max(...round.rolls.map((r) => r.value));
        const isLast = i === shown - 1;
        const settled = done && isLast;
        return (
          <div
            key={i}
            className={cn(
              "rounded-2xl border bg-card p-2.5 animate-pop",
              settled ? "border-ok shadow-sm" : "border-line",
            )}
          >
            <div className="t-cap-strong mb-1.5 text-txt-muted">
              {rounds.length === 1 ? "전원 한 번씩 굴렸습니다" : i === 0 ? "1차" : `${i + 1}차 · 동점 재굴림`}
            </div>
            <ol className="flex flex-col gap-1">
              {round.rolls.map((roll) => {
                const isTop = roll.value === top;
                const isWinner = settled && roll.name === winner && isTop;
                return (
                  <li
                    key={roll.name}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border px-2 py-1 transition-all",
                      isWinner
                        ? "border-ok bg-ok-bg"
                        : isTop
                          ? "border-line-strong bg-yellow-100"
                          : "border-line bg-card",
                      settled && !isWinner && "opacity-55",
                    )}
                  >
                    <MiniDie n={roll.value} />
                    <span className="t-cap-strong keep-all flex-1 text-txt-strong">
                      {roll.name}
                      <span className="sr-only">{` ${roll.value}`}</span>
                    </span>
                    {isWinner ? (
                      <Icon name="check" size={14} strokeWidth={3} className="text-ok" />
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })}
    </div>
  );
}

/* ── 제비뽑기 — 종이를 섞은 뒤 직접 뽑거나 한 번에 연다 ────────── */

const TICKET_SHUFFLE_MS = 800;

function TicketStage({
  candidates,
  winner,
  onLanded,
}: {
  candidates: DrawName[];
  winner: string;
  onLanded: () => void;
}) {
  // 후보들을 무작위 순서로 카드 슬롯에 배치한다.
  const [cards] = useState<{ name: string; isWinner: boolean }[]>(() => {
    const list = candidates.map((c) => ({
      name: c.name,
      isWinner: c.name === winner,
    }));
    // Fisher-Yates shuffle
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  });

  const [shuffling, setShuffling] = useState(true);
  const [opened, setOpened] = useState<Set<number>>(new Set());
  const [landedCalled, setLandedCalled] = useState(false);

  // 셔플 타이머
  useEffect(() => {
    const timer = setTimeout(() => {
      setShuffling(false);
    }, TICKET_SHUFFLE_MS);
    return () => clearTimeout(timer);
  }, []);

  // 당첨 제비가 열렸을 때 마무리 처리
  const finishStage = () => {
    if (landedCalled) return;
    setLandedCalled(true);
    // 남은 카드들도 전체 공개
    setOpened(new Set(cards.map((_, i) => i)));
    setTimeout(onLanded, 700);
  };

  // 개별 카드 터치
  const handlePickCard = (index: number) => {
    if (shuffling || opened.has(index) || landedCalled) return;
    const nextOpened = new Set(opened);
    nextOpened.add(index);
    setOpened(nextOpened);

    // 당첨 카드를 열었다면 연출 마무리
    if (cards[index].isWinner) {
      finishStage();
    }
  };

  // 한 번에 모두 열기
  const handleRevealAll = () => {
    if (shuffling || landedCalled) return;
    setOpened(new Set(cards.map((_, i) => i)));
    finishStage();
  };

  // 5초 동안 카드를 열지 않으면 자동으로 하나씩 열어주는 폴백
  useEffect(() => {
    if (shuffling || landedCalled || opened.size > 0) return;
    const autoTimer = setTimeout(() => {
      handleRevealAll();
    }, 5500);
    return () => clearTimeout(autoTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shuffling, opened.size, landedCalled]);

  const hasWinnerRevealed = Array.from(opened).some((idx) => cards[idx]?.isWinner);

  return (
    <div className="flex w-full flex-col items-center gap-3">
      {/* 상태 및 액션 툴바 */}
      <div className="flex w-full items-center justify-between px-1 text-xs">
        <span className="font-medium text-txt-muted">
          {shuffling ? (
            <span className="animate-pulse">제비를 섞는 중…</span>
          ) : hasWinnerRevealed ? (
            <span className="font-bold text-ok">🎉 당첨 제비를 찾았어요!</span>
          ) : (
            <span>제비를 골라 직접 열어보세요</span>
          )}
        </span>

        {!shuffling && !hasWinnerRevealed && opened.size < cards.length ? (
          <button
            type="button"
            onClick={handleRevealAll}
            className="flex items-center gap-1 font-semibold text-yellow-700 hover:text-yellow-800 active:scale-95 cursor-pointer"
          >
            <Icon name="sparkles" size={13} />
            <span>모두 열기</span>
          </button>
        ) : null}
      </div>

      {/* 제비 카드 격자 */}
      <div className="flex flex-wrap justify-center gap-2.5 py-1">
        {cards.map((card, i) => {
          const isOpen = opened.has(i);
          return (
            <button
              key={`${card.name}-${i}`}
              type="button"
              onClick={() => handlePickCard(i)}
              disabled={shuffling || isOpen}
              aria-label={isOpen ? `${card.name} (${card.isWinner ? "당첨" : "일반"})` : `제비 ${i + 1}번 열기`}
              className={cn(
                "relative flex h-20 w-16 flex-col items-center justify-center rounded-2xl border text-center transition-all duration-300",
                shuffling && "animate-wiggle cursor-default",
                !shuffling && !isOpen && "cursor-pointer border-line-strong bg-yellow-100 hover:-translate-y-1 hover:shadow-sm active:scale-95",
                isOpen && card.isWinner && "scale-105 border-ok bg-ok-bg shadow-sm animate-pop ring-2 ring-ok/30",
                isOpen && !card.isWinner && "border-line bg-fill opacity-75 animate-fade-in",
              )}
            >
              {isOpen ? (
                <div className="flex flex-col items-center gap-0.5 px-1">
                  {card.isWinner ? (
                    <span className="text-ok">
                      <Icon name="sparkles" size={15} />
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      "keep-all text-[12px] leading-tight",
                      card.isWinner ? "font-extrabold text-txt-strong" : "font-medium text-txt-muted",
                    )}
                  >
                    {card.name}
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <span className="text-yellow-700">
                    <Icon name="ticket" size={22} />
                  </span>
                  <span className="text-[10px] font-bold text-yellow-700/80">
                    {i + 1}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── 사다리타기 — 당첨자 줄을 타고 토큰이 내려간다 ─────────────────────── */

const LADDER_DURATION_MS = 2200;

function LadderStage({
  candidates,
  winner = "",
  onLanded = () => {},
  preview = false,
}: {
  candidates: DrawName[];
  winner?: string;
  onLanded?: () => void;
  preview?: boolean;
}) {
  const n = Math.max(1, candidates.length);
  // 후보 수에 따라 폭 유동적 계산 (최소 260px, 모바일 가로 스크롤 고려)
  const colSpacing = Math.max(46, Math.min(68, Math.floor(300 / n)));
  const width = Math.max(260, (n - 1) * colSpacing + 64);
  const height = 230;
  const top = 38;
  const bottom = 176;
  const padX = 32;

  const colX = (i: number) => (n === 1 ? width / 2 : padX + (i * (width - padX * 2)) / (n - 1));
  const levelCount = Math.max(5, Math.min(8, n + 2));
  const levelY = (lvl: number) => top + 16 + (lvl * (bottom - top - 32)) / (levelCount - 1);

  const geo: LadderGeometry = useMemo(
    () => ({
      width,
      height,
      top,
      bottom,
      colX,
      levelY,
    }),
    [width, height, top, bottom, n],
  );

  const rungs = useMemo(() => generateLadderRungs(n, levelCount), [n, levelCount]);
  const winnerIndex = useMemo(() => {
    const idx = candidates.findIndex((c) => c.name === winner);
    return idx === -1 ? 0 : idx;
  }, [candidates, winner]);

  const startCol = useMemo(
    () => findStartColumnForWinner(rungs, winnerIndex, levelCount),
    [rungs, winnerIndex, levelCount],
  );

  const waypoints = useMemo(
    () => tracePathWaypoints(rungs, startCol, levelCount, geo),
    [rungs, startCol, levelCount, geo],
  );

  const segmentsMeta = useMemo(() => getPathSegments(waypoints), [waypoints]);
  const fullPathD = useMemo(() => pointsToSvgPath(waypoints), [waypoints]);

  const [progress, setProgress] = useState(0);
  const [landed, setLanded] = useState(false);

  useEffect(() => {
    if (preview) return;

    let animId: number;
    let startTime: number | null = null;

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const rawT = Math.min(1, elapsed / LADDER_DURATION_MS);

      // 부드러운 cubic-bezier (0.25, 0.1, 0.25, 1) ease-in-out 근사
      const easeT = rawT < 0.5 ? 2 * rawT * rawT : 1 - Math.pow(-2 * rawT + 2, 2) / 2;
      setProgress(easeT);

      if (rawT < 1) {
        animId = requestAnimationFrame(step);
      } else {
        setProgress(1);
        setLanded(true);
      }
    };

    animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, [preview]);

  useEffect(() => {
    if (preview || !landed) return;
    const t = setTimeout(onLanded, 400);
    return () => clearTimeout(t);
  }, [preview, landed, onLanded]);

  const currentToken = useMemo(
    () => getInterpolatedPoint(waypoints, progress, segmentsMeta),
    [waypoints, progress, segmentsMeta],
  );

  // 지나온 경로의 partial path (하이라이트 트레일)
  const trailD = useMemo(() => {
    if (preview || progress <= 0) return "";
    if (progress >= 1) return fullPathD;
    const targetDist = progress * segmentsMeta.totalLength;
    const trailPoints: Point[] = [waypoints[0]];
    for (const seg of segmentsMeta.segments) {
      if (seg.cumulative <= targetDist) {
        trailPoints.push(seg.to);
      } else {
        trailPoints.push(currentToken);
        break;
      }
    }
    return pointsToSvgPath(trailPoints);
  }, [preview, progress, segmentsMeta, waypoints, fullPathD, currentToken]);

  return (
    <div className="flex w-full flex-col items-center overflow-x-auto pb-1">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="overflow-visible select-none"
      >
        <defs>
          <filter id="token-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1" stdDeviation="2.5" floodColor="var(--coral-600)" floodOpacity="0.4" />
          </filter>
        </defs>

        {/* 상단 출발선 배지 (1번, 2번 ...) */}
        {candidates.map((c, i) => {
          const isStarter = !preview && i === startCol;
          const cx = colX(i);
          return (
            <g key={`start-col-${i}`}>
              <circle
                cx={cx}
                cy={top - 16}
                r={10}
                className={cn(
                  "transition-colors duration-200",
                  isStarter ? "fill-coral-600" : "fill-card stroke-line stroke-1",
                )}
              />
              <text
                x={cx}
                y={top - 16}
                textAnchor="middle"
                dominantBaseline="central"
                className={cn("text-[10px] font-bold", isStarter ? "fill-white" : "fill-txt-muted")}
              >
                {i + 1}
              </text>
            </g>
          );
        })}

        {/* 기둥 세로줄 (배경) */}
        {candidates.map((c, i) => (
          <line
            key={`col-line-${c.name}-${i}`}
            x1={colX(i)}
            y1={top}
            x2={colX(i)}
            y2={bottom}
            stroke="var(--line-strong)"
            strokeWidth={3}
            strokeLinecap="round"
          />
        ))}

        {/* 가로줄 발판 (Rungs) */}
        {rungs.map((r) => (
          <line
            key={r.id}
            x1={colX(r.col)}
            y1={levelY(r.level)}
            x2={colX(r.col + 1)}
            y2={levelY(r.level)}
            stroke="var(--line-strong)"
            strokeWidth={3}
            strokeLinecap="round"
          />
        ))}

        {/* 지나온 궤적 하이라이트 (Trail Path) */}
        {trailD ? (
          <path
            d={trailD}
            fill="none"
            stroke="var(--coral-500)"
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {/* 움직이는 토큰 (현재 위치) */}
        {progress > 0 && progress < 1 ? (
          <g transform={`translate(${currentToken.x}, ${currentToken.y})`} filter="url(#token-glow)">
            <circle r={8} className="fill-coral-600" />
            <circle r={4} className="fill-white" />
          </g>
        ) : null}

        {/* 하단 도착 영역 (블라인드 / 당첨 카드) */}
        {candidates.map((c, i) => {
          const isWinner = c.name === winner;
          const cx = colX(i);
          const showRevealed = landed;

          return (
            <g key={`bottom-card-${c.name}-${i}`}>
              <rect
                x={cx - 24}
                y={bottom + 8}
                width={48}
                height={26}
                rx={8}
                className={cn(
                  "transition-all duration-300",
                  showRevealed && isWinner
                    ? "fill-coral-600 stroke-coral-500 stroke-1 shadow-sm"
                    : showRevealed
                      ? "fill-card stroke-line stroke-1"
                      : "fill-yellow-200 stroke-yellow-400 stroke-1",
                )}
              />
              <text
                x={cx}
                y={bottom + 21}
                textAnchor="middle"
                dominantBaseline="central"
                className={cn(
                  "text-[10px] font-bold transition-all duration-200",
                  showRevealed && isWinner
                    ? "fill-white font-extrabold"
                    : showRevealed
                      ? "fill-txt-strong"
                      : "fill-yellow-800",
                )}
              >
                {showRevealed ? (c.name.length > 4 ? `${c.name.slice(0, 4)}…` : c.name) : "?"}
              </text>
            </g>
          );
        })}

        {/* 도착 완료 시 축하 배지 */}
        {landed ? (
          <g
            transform={`translate(${colX(winnerIndex)}, ${bottom + 44})`}
            className="animate-pop"
          >
            <text
              x={0}
              y={0}
              textAnchor="middle"
              className="fill-coral-600 font-extrabold text-[12px]"
            >
              🎉 당첨!
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  );
}
