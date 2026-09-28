"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppFrame, Body, Btn, Dock, Icon, Note, Panel, TopInset } from "@/components/ui";
import { useOnboarding } from "@/features/onboarding/onboarding-state";
import { characterImage, getMbtiMeta } from "@/lib/mbti";
import { useOnboardingGate } from "@/features/onboarding/use-onboarding-gate";

/**
 * 05 캐릭터 발급.
 *
 * MBTI 16종에 캐릭터와 팀플 성향이 배정된다.
 * 캐릭터는 팀원 간 친밀한 소통과 팀플 스타일 이해를 돕기 위한 표시이다.
 */
export default function CharacterPage() {
  const router = useRouter();
  const { effectiveMbti, fromQuiz } = useOnboarding();
  // 게이트는 초대 코드만 본다(`true`). **`effectiveMbti` 를 넘기면 아래 되돌리기가 죽는다.**
  // 게이트가 `ready = Boolean(effectiveMbti) && 코드있음` 을 돌려주므로 아래 이펙트의
  // `ready && !effectiveMbti` 는 언제나 거짓이었다 — 유형 없이 직접 들어온 사람은
  // 되돌아가지도 못하고 그냥 빈 화면만 마주했다(아래 주석이 바라는 동작과 반대).
  const ready = useOnboardingGate(true);

  // 유형 없이 이 화면에 직접 들어온 경우(새로고침·링크 공유) 선택 화면으로 되돌린다.
  useEffect(() => {
    if (ready && !effectiveMbti) router.replace("/onboarding/mbti");
  }, [ready, effectiveMbti, router]);

  if (!ready) return null;
  if (!effectiveMbti) return null;

  const meta = getMbtiMeta(effectiveMbti);

  return (
    <AppFrame label="05 캐릭터 발급">
      <TopInset tone="y" />
      <Body tone="y" pad={20}>
        <div className="pt-[22px] pb-2 text-center">
          <div className="t-cap-strong mb-3.5 text-yellow-700" style={{ letterSpacing: ".06em" }}>
            내 찰떡 캐릭터
          </div>

          <div className="animate-pop mx-auto my-2 size-[168px] relative">
            <Image
              src={characterImage(effectiveMbti)}
              alt={`${effectiveMbti} 캐릭터`}
              width={168}
              height={168}
              priority
              className="size-full rounded-3xl object-contain animate-jelly transition-transform duration-200 hover:scale-105"
            />
          </div>

          <h1 className="keep-all m-0 mt-3 font-extrabold text-[24px] leading-[1.3] tracking-[-.035em] text-ink-900">
            {meta?.characterName ?? "내 캐릭터"}
          </h1>

          <div
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-full px-[13px] py-1.5 shadow-2xs"
            style={{ background: "rgba(255,255,255,.85)" }}
          >
            <span className="font-mono font-extrabold text-[14px] leading-none tracking-[.04em] text-yellow-800">
              {effectiveMbti}
            </span>
            {fromQuiz ? (
              <span className="font-medium text-[12.5px] leading-none text-coral-700">· 성향 체크 결과</span>
            ) : null}
          </div>

          {meta ? (
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {meta.keywords.map((kw) => (
                <span
                  key={kw}
                  className="rounded-full bg-yellow-200/90 px-2.5 py-0.5 font-bold text-[12px] text-yellow-900"
                >
                  #{kw}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {meta ? (
          <Panel s="card" pad={16} r={18} className="mt-3.5 shadow-xs border border-yellow-200/70">
            <div className="t-note-title mb-1.5 text-yellow-800 flex items-center gap-1.5">
              <Icon name="sparkles" size={16} />
              <span>팀플에서의 나의 강점</span>
            </div>
            <p className="t-body text-pretty-keep m-0 text-txt-strong leading-[1.55]">
              {meta.teamplayStyle}
            </p>

            <div className="mt-3 pt-3 border-t border-line/60">
              <div className="text-[12.5px] font-bold text-txt-strong mb-1">💡 팀원과의 소통 팁</div>
              <div className="text-[13px] leading-[1.5] text-txt">
                {meta.communicationTip.good}
              </div>
            </div>
          </Panel>
        ) : null}

        <Panel s="cream" pad={14} r={16} className="mt-3">
          <p className="t-note text-pretty-keep m-0 text-txt-muted">
            캐릭터는 팀원에게 나를 소개하고 원활한 소통을 돕는 표시입니다. 잘하는 일이나 맡을 역할을 뜻하지 않습니다.
          </p>
        </Panel>

        {fromQuiz ? (
          <Note tone="y" icon="info" className="mt-3">
            20문항짜리 성향 체크는 <b>자기 서술용 프로필</b>입니다. 계측·검증된 검사 결과가 아니며 언제든 팀 페이지나 이전 화면에서 바꿀 수 있습니다.
          </Note>
        ) : null}
      </Body>

      <Dock>
        <Btn full size="lg" iconRight="arrow-right" onClick={() => router.push("/onboarding/role")}>
          희망 역할 고르기
        </Btn>
        <Btn full v="ghost" onClick={() => router.push("/onboarding/mbti")}>
          유형 다시 고르기
        </Btn>
      </Dock>
    </AppFrame>
  );
}
