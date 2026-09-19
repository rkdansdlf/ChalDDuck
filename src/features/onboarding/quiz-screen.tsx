"use client";

import { useRouter } from "next/navigation";
import { AppBar, AppFrame, Body, Btn, Dock, Icon, Progress, TopInset, Undecided } from "@/components/ui";
import { cn } from "@/lib/cn";
import { picksToMbti } from "@/lib/mbti";
import type { QuizQuestion } from "@/lib/types";
import { setPick, useOnboarding } from "./onboarding-state";

/**
 * 04 30초 MBTI 판별.
 *
 * ⚠️ **정식 검사가 아니다.** 4문항의 정확도·검증 결과는 기획안에 없으므로
 * 화면 어디에서도 "진단"이나 "정확한 결과"라고 부르지 않는다.
 */
export function QuizScreen({ questions }: { questions: QuizQuestion[] }) {
  const router = useRouter();
  const { picks, answeredCount } = useOnboarding();

  const total = questions.length;
  const result = picksToMbti(picks);
  const done = answeredCount >= total;

  return (
    <AppFrame label="04 30초 MBTI 판별">
      <TopInset />
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
          {questions.map((q, qi) => (
            <fieldset key={q.axis} className="m-0 border-none p-0">
              <legend className="mb-[7px] flex items-baseline gap-[7px] p-0">
                <span className="font-mono font-bold text-[13px] leading-none tracking-[.06em] text-yellow-700">
                  {q.axis}
                </span>
                <span className="keep-all font-bold text-[15px] leading-[1.35] text-txt-strong">{q.label}</span>
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
                        "flex min-h-[52px] cursor-pointer items-center gap-[11px] rounded-control px-3.5 py-[11px] text-left",
                        on ? "bg-yellow-100 border-[1.5px] border-yellow-500" : "bg-card border border-line",
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-[21px] flex-none place-items-center rounded-full border-[1.5px] text-ink-900",
                          on ? "bg-yellow-400 border-yellow-600" : "border-line-strong bg-transparent",
                        )}
                      >
                        {on ? <Icon name="check" size={13} strokeWidth={3} /> : null}
                      </span>
                      <span
                        className={cn(
                          "text-pretty-keep text-[14.5px] leading-[1.5] text-txt-strong",
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
          ))}
        </div>

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
          {done ? `${result} 로 계속` : `${total}문항을 모두 골라 주세요`}
        </Btn>
      </Dock>
    </AppFrame>
  );
}
