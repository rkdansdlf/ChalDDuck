"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AppBar, Body, Btn, Chip, Icon, Undecided } from "@/components/ui";

/** 돌아가는 느낌을 주는 시간. 결과는 누른 순간 이미 정해져 있다. */
const SPIN_MS = 700;

/**
 * 29 친목 · 메뉴 룰렛.
 *
 * 07(역할 조율)의 추첨 도구를 밥 메뉴 정하기에 그대로 쓴다.
 * 결과에 따라 순위를 매기지 않는다 — 친목 기능이 점수가 되면 친목이 아니게 된다.
 */
export function RouletteScreen({ options }: { options: string[] }) {
  const router = useRouter();

  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const spin = () => {
    if (spinning || options.length === 0) return;
    setSpinning(true);
    setResult(null);

    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setResult(options[Math.floor(Math.random() * options.length)]);
      setSpinning(false);
    }, SPIN_MS);
  };

  return (
    <>
      <AppBar title="메뉴 룰렛" sub="밥약 메뉴 정하기" onBack={() => router.push("/team")} />

      <Body dense className="flex flex-col">
        <p className="text-pretty-keep mt-1 mb-[18px] text-[14.5px] leading-[1.62] text-txt">
          역할 조율에 쓰는 추첨 도구를 밥 메뉴 정하기에도 그대로 씁니다. 결과에 따라 순위를 매기지
          않습니다.
        </p>

        <div
          // 결과가 바뀌면 스크린 리더가 읽어 준다 — 애니메이션만으로는 알 수 없다.
          role="status"
          className="mb-[18px] flex min-h-[140px] items-center justify-center rounded-card bg-yellow-100"
        >
          {spinning ? (
            <span className="animate-spin text-yellow-700">
              <Icon name="loader-circle" size={30} />
            </span>
          ) : result ? (
            <span className="font-extrabold text-[24px] leading-[1.3] text-ink-900">{result}</span>
          ) : (
            <span className="font-semibold text-[14px] leading-[1.4] text-yellow-700">
              버튼을 눌러 정해요
            </span>
          )}
        </div>

        <div className="mb-[18px] flex flex-wrap gap-1.5">
          {options.map((option) => (
            <Chip key={option}>{option}</Chip>
          ))}
        </div>

        <Btn full size="lg" icon="dices" onClick={spin} disabled={spinning}>
          {result ? "다시 돌리기" : "돌리기"}
        </Btn>

        <Undecided>
          원안의 장소 태그·밥약 사진 인증·찰떡 지수·치장 아이템 중 메뉴 룰렛만 먼저 연결했습니다. 나머지
          우선순위는 기획안에 없습니다.
        </Undecided>
      </Body>
    </>
  );
}
