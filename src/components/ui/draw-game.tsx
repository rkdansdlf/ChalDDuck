"use client";

import { useEffect, useMemo, useState } from "react";
import type { MbtiType } from "@/lib/mbti";
import { cn } from "@/lib/cn";
import { Avatar } from "./avatar";
import { Chip } from "./chip";
import { Icon } from "./icon";

/**
 * 07(역할 조율)의 "추첨" 화면에 쓰는 연출.
 *
 * 당첨자는 이미 서버가 정했다 — 여기서는 그 결과를 도구별로 다르게 "보여주기"만 한다
 * (룰렛/주사위/제비뽑기/사다리타기, `RANDOM_TOOLS` 의 key 그대로). 도구를 고른 뒤 서버
 * 응답을 기다렸다가 결과를 쥐고 이 컴포넌트를 띄우므로, 연출 도중에는 새 데이터를
 * 기다릴 필요 없이 정해진 타이밍표대로만 움직이면 된다.
 */

export type DrawCandidate = { name: string; mbti: MbtiType | null };

const REVEAL_DELAY_MS = 1100;

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

  const onLanded = () => setLanded(true);

  return (
    <div className="flex flex-col items-center gap-5 py-1">
      <p className="t-note keep-all text-txt-muted">
        {landed ? `${toolName} 결과가 나왔어요` : `${toolName} 추첨 중…`}
      </p>

      {toolKey === "roulette" ? (
        <RouletteStage candidates={candidates} winner={winner} onLanded={onLanded} />
      ) : toolKey === "draw" ? (
        <TicketStage candidates={candidates} winner={winner} onLanded={onLanded} />
      ) : toolKey === "ladder" ? (
        <LadderStage candidates={candidates} winner={winner} onLanded={onLanded} />
      ) : (
        <DiceStage onLanded={onLanded} />
      )}

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

function WinnerCard({ candidate }: { candidate: DrawCandidate }) {
  const shown = usePop();
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 transition-all duration-300 ease-out",
        shown ? "scale-100 opacity-100" : "scale-75 opacity-0",
      )}
    >
      <Avatar name={candidate.name} mbti={candidate.mbti} size={56} />
      <span className="t-h2 keep-all text-txt-strong">{candidate.name}</span>
      <Chip tone="ok" icon="check">
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
  candidates: DrawCandidate[];
  winner: string;
  onLanded: () => void;
}) {
  const n = Math.max(1, candidates.length);
  const step = 360 / n;
  const winnerIndex = Math.max(0, candidates.findIndex((c) => c.name === winner));
  const centerAngle = winnerIndex * step + step / 2;

  const [deg, setDeg] = useState(0);
  useEffect(() => {
    // 라벨은 바퀴와 함께 돌아서 멈추는 각도에 따라 눕거나 뒤집힐 수 있다 —
    // 당첨자 이름은 아래 결과 카드가 다시 upright 로 보여 준다.
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
            const pos = polarToCartesian(95, 95, 62, i * step + step / 2);
            return (
              <text
                key={c.name}
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-txt-strong"
                style={{ font: "700 11px var(--font-sans)" }}
              >
                {c.name.length > 4 ? `${c.name.slice(0, 4)}…` : c.name}
              </text>
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

/* ── 주사위 — 흔들리다가 멈추고 결과 카드로 넘어간다 ───────────────────── */

const DICE_ROLL_MS = 1300;

function DiceStage({ onLanded }: { onLanded: () => void }) {
  const [rolling, setRolling] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => {
      setRolling(false);
      onLanded();
    }, DICE_ROLL_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={cn(
        "grid size-20 place-items-center rounded-2xl border border-line bg-card text-yellow-700 shadow-md",
        rolling && "animate-bounce",
      )}
    >
      <Icon name="dices" size={36} />
    </div>
  );
}

/* ── 제비뽑기 — 종이를 섞다가 한 장씩 펼쳐 마지막에 당첨을 연다 ────────── */

const TICKET_SHUFFLE_MS = 700;
const TICKET_FLIP_GAP_MS = 320;

function TicketStage({
  candidates,
  winner,
  onLanded,
}: {
  candidates: DrawCandidate[];
  winner: string;
  onLanded: () => void;
}) {
  const [order] = useState<number[]>(() => {
    const others = candidates.map((_, i) => i).filter((i) => candidates[i].name !== winner);
    for (let i = others.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [others[i], others[j]] = [others[j], others[i]];
    }
    const winnerIndex = candidates.findIndex((c) => c.name === winner);
    return winnerIndex === -1 ? others : [...others, winnerIndex];
  });
  const [shuffling, setShuffling] = useState(true);
  const [flipped, setFlipped] = useState<Set<number>>(new Set());

  useEffect(() => {
    const timers: number[] = [];
    timers.push(window.setTimeout(() => setShuffling(false), TICKET_SHUFFLE_MS));
    order.forEach((idx, step) => {
      timers.push(
        window.setTimeout(
          () => {
            setFlipped((prev) => new Set(prev).add(idx));
            if (step === order.length - 1) window.setTimeout(onLanded, 350);
          },
          TICKET_SHUFFLE_MS + 250 + step * TICKET_FLIP_GAP_MS,
        ),
      );
    });
    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {candidates.map((c, i) => {
        const isFlipped = flipped.has(i);
        const isWinner = c.name === winner;
        return (
          <div
            key={c.name}
            className={cn(
              "flex h-20 w-14 items-center justify-center rounded-xl border px-1 text-center transition-all duration-300",
              shuffling && "animate-pulse",
              isFlipped
                ? isWinner
                  ? "scale-105 border-ok bg-ok-bg"
                  : "border-line bg-fill"
                : "border-line bg-yellow-200",
            )}
          >
            {isFlipped ? (
              <span className="t-cap-strong keep-all text-txt-strong">{c.name}</span>
            ) : (
              <Icon name="ticket" size={20} className="text-yellow-700" />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── 사다리타기 — 당첨자 줄을 타고 토큰이 내려간다 ─────────────────────── */

const LADDER_DROP_MS = 1800;

function LadderStage({
  candidates,
  winner,
  onLanded,
}: {
  candidates: DrawCandidate[];
  winner: string;
  onLanded: () => void;
}) {
  const n = Math.max(1, candidates.length);
  const width = 240;
  const top = 24;
  const bottom = 168;
  const colX = (i: number) => (n === 1 ? width / 2 : 24 + (i * (width - 48)) / (n - 1));
  const winnerIndex = Math.max(0, candidates.findIndex((c) => c.name === winner));

  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setProgress(1));
    const t = setTimeout(onLanded, LADDER_DROP_MS + 100);
    return () => {
      cancelAnimationFrame(id);
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tokenX = colX(winnerIndex);
  const tokenY = top + progress * (bottom - top);

  return (
    <svg viewBox={`0 0 ${width} 190`} width={width} height={190}>
      {candidates.map((c, i) => (
        <line key={c.name} x1={colX(i)} y1={top} x2={colX(i)} y2={bottom} stroke="var(--line)" strokeWidth={2} />
      ))}
      {/* 장식용 가로줄 — 실제 경로 계산에는 쓰지 않는다, 사다리 느낌만 준다 */}
      {candidates.slice(0, -1).map((c, i) => (
        <line
          key={`rung-${c.name}`}
          x1={colX(i)}
          y1={top + (bottom - top) * 0.38}
          x2={colX(i + 1)}
          y2={top + (bottom - top) * 0.38}
          stroke="var(--line)"
          strokeWidth={2}
        />
      ))}
      {candidates.map((c, i) => (
        <text
          key={`label-${c.name}`}
          x={colX(i)}
          y={top - 8}
          textAnchor="middle"
          className="fill-txt-muted"
          style={{ font: "600 10px var(--font-sans)" }}
        >
          {c.name.length > 3 ? `${c.name.slice(0, 3)}…` : c.name}
        </text>
      ))}
      <circle
        cx={tokenX}
        cy={tokenY}
        r={7}
        className="fill-coral-600"
        style={{ transition: `cy ${LADDER_DROP_MS}ms cubic-bezier(.3,.2,.2,1)` }}
      />
      {progress === 1 ? (
        <text
          x={tokenX}
          y={bottom + 16}
          textAnchor="middle"
          className="fill-txt-strong"
          style={{ font: "700 11px var(--font-sans)" }}
        >
          당첨
        </text>
      ) : null}
    </svg>
  );
}
