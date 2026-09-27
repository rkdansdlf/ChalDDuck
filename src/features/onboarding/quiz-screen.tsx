"use client";

import { useRouter } from "next/navigation";
import { AppBar, AppFrame, Body, Btn, Dock, Icon, Progress, Undecided } from "@/components/ui";
import { cn } from "@/lib/cn";
import { picksToMbti } from "@/lib/mbti";
import type { QuizQuestion } from "@/lib/types";
import { setPick, useOnboarding } from "./onboarding-state";
import { useOnboardingGate } from "./use-onboarding-gate";

/**
 * 04 30초 MBTI 판별.
 *
 * ⚠️ **정식 검사가 아니다.** 4문항의 정확도·검증 결과는 기획안에 없으므로
 * 화면 어디에서도 "진단"이나 "정확한 결과"라고 부르지 않는다.
 */
export function QuizScreen({ questions }: { questions: QuizQuestion[] }) {
  const router = useRouter();
  const { picks, answeredCount } = useOnboarding();
  const ready = useOnboardingGate(true);
  if (!ready) return null;

  const total = questions.length;
  const result = picksToMbti(picks);
  const done = answeredCount >= total;

  return (
    <AppFrame label="04 30초 MBTI 판별">
      <AppBar
        title="30초 컷"
        sub={`${answeredCount} / ${total}문항`}
        onBack={() => router.push("/onboarding/mbti")}
      />
      <Body dense>
        <Progress
          step={answeredCount}
          total={total}
          label="30초 컷 답변 진행"
          className="mt-1 mb-4"
        />

        <p className="text-pretty-keep m-0 mb-3.5 text-[14px] leading-[1.6] text-txt-muted">
          팀플 상황에서 더 가까운 쪽을 고르세요. 정답은 없고, 언제든 바꿀 수 있습니다.
        </p>

        <div className="flex flex-col gap-3.5">
          {questions.map((q, qi) => {
            const currentPick = picks[qi];
            const axisLetters = q.axis.split(" / ");
            return (
              <fieldset key={q.axis} className="m-0 border-none p-0">
                <legend className="mb-[7px] flex items-baseline justify-between p-0 w-full">
                  <div className="flex items-baseline gap-[7px]">
                    <span className="font-mono font-bold text-[13px] leading-none tracking-[.06em] text-yellow-700">
                      {q.axis}
                    </span>
                    <span className="keep-all font-bold text-[15px] leading-[1.35] text-txt-strong">{q.label}</span>
                  </div>
                  {currentPick ? (
                    <span className="font-mono font-bold text-[12px] text-yellow-800 bg-yellow-200/80 px-2 py-0.5 rounded-md animate-pop">
                      {currentPick === "a" ? axisLetters[0] : axisLetters[1]} 선택됨
                    </span>
                  ) : null}
                </legend>
                <div className="flex flex-col gap-[7px]">
                  {(["a", "b"] as const).map((key) => {
                    const on = picks[qi] === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setPick(qi, key)}
                        className={cn(
                          "flex min-h-[52px] cursor-pointer items-center gap-[11px] rounded-control px-3.5 py-[11px] text-left select-none transition-all duration-150 active:scale-[0.985]",
                          on ? "bg-yellow-100 border-[1.5px] border-yellow-500 shadow-2xs" : "bg-card border border-line hover:bg-cr-50",
                        )}
                      >
                        <span
                          className={cn(
                            "grid size-[21px] flex-none place-items-center rounded-full border-[1.5px] text-ink-900 transition-all duration-150",
                            on ? "bg-yellow-400 border-yellow-600 scale-105" : "border-line-strong bg-transparent",
                          )}
                        >
                          {on ? (
                            <span className="animate-pop inline-flex">
                              <Icon name="check" size={13} strokeWidth={3} />
                            </span>
                          ) : null}
                        </span>
                        <span
                          className={cn(
                            "text-pretty-keep text-[14.5px] leading-[1.5] text-txt-strong transition-colors duration-150",
                            on ? "font-semibold" : "font-normal",
                          )}
                        >
                          {q[key]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
        </div>

        {done && result ? (
          <div className="animate-pop mt-4 rounded-2xl border-[1.5px] border-yellow-400 bg-linear-to-r from-yellow-100 to-amber-50 p-4 text-center shadow-xs">
            <span className="t-cap-strong text-yellow-800">🎉 팀플 성향 분석 완료</span>
            <div className="font-mono font-extrabold text-[22px] text-ink-900 mt-1">
              나의 찰떡 유형: <span className="text-yellow-700 underline decoration-yellow-400">{result}</span>
            </div>
            <p className="t-note m-0 mt-1 text-txt-muted">
              아래 버튼을 눌러 내 캐릭터와 팀플 스타일을 확인하세요!
            </p>
          </div>
        ) : null}

        <Undecided>
          이 4문항의 정확도나 검증 결과는 기획안에 없습니다. 결과 화면에서 <b>&ldquo;정확한 진단&rdquo;으로
          표현하지 않았습니다.</b>
        </Undecided>
      </Body>

      <Dock>
        <Btn
          full
          size="lg"
          disabled={!done}
          onClick={() => router.push("/onboarding/character")}
          iconRight="arrow-right"
        >
          {done ? `${result} 캐릭터 발급받기` : `${total - answeredCount}문항 남았습니다`}
        </Btn>
      </Dock>
    </AppFrame>
  );
}
