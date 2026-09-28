"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { AppBar, AppFrame, Body, Btn, Chip, Dock, Icon, Note, Panel, Progress } from "@/components/ui";
import { setMbti, startQuiz, useOnboarding } from "@/features/onboarding/onboarding-state";
import { useOnboardingGate } from "@/features/onboarding/use-onboarding-gate";
import { MBTI_TYPES, characterImage, getMbtiMeta } from "@/lib/mbti";
import { cn } from "@/lib/cn";

/**
 * 03 MBTI 선택.
 *
 * MBTI 는 **캐릭터 발급과 소통 방식 이해에만** 쓴다. 역할 추천 계산에는 절대 들어가지 않는다 —
 * 이 약속은 화면에도 적혀 있고, 06 화면에서 한 번 더 확인시킨다.
 */
export default function MbtiPage() {
  const router = useRouter();
  const { mbti } = useOnboarding();
  const ready = useOnboardingGate(true);
  if (!ready) return null;

  const currentMeta = getMbtiMeta(mbti);

  return (
    <AppFrame label="03 MBTI 선택">
      <AppBar title="내 MBTI" sub="2 / 4단계" onBack={() => router.push("/onboarding/name")} />
      <Body dense>
        <Progress step={2} total={4} className="mt-1 mb-[18px]" />

        <h1 className="t-h1 keep-all m-0 mb-2 text-txt-strong">내 MBTI를 골라 주세요</h1>
        <p className="text-pretty-keep m-0 mb-4 text-[15px] leading-[1.62] text-txt">
          찰떡 캐릭터를 받고, 팀원과 소통 방식을 맞추는 데 씁니다.
        </p>

        <div role="radiogroup" aria-label="MBTI 유형" className="mb-3.5 grid grid-cols-4 gap-[7px]">
          {MBTI_TYPES.map((type) => {
            const on = mbti === type;
            return (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setMbti(type)}
                className={cn(
                  "min-h-[52px] cursor-pointer rounded-[13px] font-mono text-[14px] leading-none tracking-[.02em] transition-all duration-150 active:scale-95",
                  on
                    ? "bg-yellow-400 border-[1.5px] border-yellow-600 font-extrabold text-ink-900 shadow-xs"
                    : "bg-card border border-line font-semibold text-txt hover:border-yellow-300",
                )}
              >
                {type}
              </button>
            );
          })}
        </div>

        {/* 선택한 유형의 캐릭터 및 팀플 스타일 미리보기 카드 */}
        {currentMeta && mbti ? (
          <div className="animate-pop mb-4 overflow-hidden rounded-2xl border-[1.5px] border-yellow-300 bg-linear-to-b from-yellow-50 to-card p-3.5 shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="relative size-[58px] flex-none overflow-hidden rounded-xl border border-yellow-200 bg-yellow-100">
                <Image
                  src={characterImage(mbti)}
                  alt={`${mbti} 캐릭터`}
                  width={58}
                  height={58}
                  className="size-full object-contain p-1 animate-jelly"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-extrabold text-[15px] text-yellow-800">{currentMeta.type}</span>
                  <span className="t-sec keep-all text-txt-strong">{currentMeta.characterName}</span>
                </div>
                <p className="keep-all mt-0.5 line-clamp-1 text-[13px] text-txt-muted">{currentMeta.shortDesc}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {currentMeta.keywords.map((kw) => (
                    <span
                      key={kw}
                      className="rounded-full bg-yellow-200/80 px-2 py-0.5 font-medium text-[11.5px] text-yellow-900"
                    >
                      #{kw}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-2.5 rounded-xl bg-card/80 p-2.5 border border-line/60">
              <div className="flex items-start gap-1.5 text-[12.5px] leading-[1.5] text-txt">
                <span className="flex-none font-bold text-yellow-700">팀플 성향</span>
                <span className="text-pretty-keep">{currentMeta.teamplayStyle}</span>
              </div>
              <div className="mt-1 flex items-start gap-1.5 text-[12px] leading-[1.45] text-txt-muted">
                <span className="flex-none font-bold text-coral-600">소통 팁</span>
                <span className="text-pretty-keep">{currentMeta.communicationTip.good}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-4 rounded-xl border border-dashed border-line-strong bg-fill/50 px-3.5 py-3 text-center text-[13px] text-txt-muted">
            위 버튼에서 MBTI를 누르면 팀플 성향과 찰떡 캐릭터를 미리 볼 수 있어요.
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            startQuiz();
            router.push("/onboarding/quiz");
          }}
          className="flex min-h-[56px] w-full cursor-pointer items-center gap-[11px] rounded-2xl border border-transparent bg-coral-100 px-[15px] py-3 text-left"
        >
          <span className="flex-none text-coral-700">
            <Icon name="wand-sparkles" size={19} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="keep-all block font-bold text-[15px] leading-[1.35] text-[#8A3B29]">
              내 MBTI를 몰라요 — 성향 체크
            </span>
            <span className="mt-0.5 block font-medium text-[13px] leading-[1.4] text-coral-700">
              팀플 상황 20문항으로 골라 보기
            </span>
          </span>
          <span className="flex-none text-coral-700">
            <Icon name="chevron-right" size={18} />
          </span>
        </button>

        <div className="mt-3.5">
          <Btn v="ghost" size="sm" icon="skip-forward" onClick={() => router.push("/onboarding/role")}>
            MBTI 없이 계속하기
          </Btn>
        </div>

        <Note tone="info" icon="lock" className="mt-2.5">
          MBTI는 캐릭터 발급과 소통 방식 이해에만 씁니다. <b>역할 추천 계산에는 쓰지 않습니다.</b>
        </Note>
      </Body>

      <Dock>
        <Btn
          full
          size="lg"
          disabled={!mbti}
          onClick={() => router.push("/onboarding/character")}
          iconRight="arrow-right"
        >
          {mbti ? `${mbti} 로 계속` : "유형을 골라 주세요"}
        </Btn>
      </Dock>
    </AppFrame>
  );
}
