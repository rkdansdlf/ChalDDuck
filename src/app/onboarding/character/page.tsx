"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppFrame, Body, Btn, Dock, Note, Panel, StatusBar } from "@/components/ui";
import { useOnboarding } from "@/features/onboarding/onboarding-state";
import { characterImage } from "@/lib/mbti";

/**
 * 05 캐릭터 발급.
 *
 * MBTI 16종에 캐릭터 이미지가 1:1로 배정된다. 캐릭터 고유 이름은 기획안에 없어
 * 지어내지 않고 MBTI 유형명을 그대로 쓴다.
 */
export default function CharacterPage() {
  const router = useRouter();
  const { effectiveMbti, fromQuiz } = useOnboarding();

  // 유형 없이 이 화면에 직접 들어온 경우(새로고침·링크 공유) 선택 화면으로 되돌린다.
  useEffect(() => {
    if (!effectiveMbti) router.replace("/onboarding/mbti");
  }, [effectiveMbti, router]);

  if (!effectiveMbti) return null;

  return (
    <AppFrame label="05 캐릭터 발급">
      <StatusBar tone="y" />
      <Body tone="y" pad={20}>
        <div className="pt-[22px] pb-2 text-center">
          <div className="t-cap-strong mb-3.5 text-yellow-700" style={{ letterSpacing: ".06em" }}>
            내 찰떡 캐릭터
          </div>

          <Image
            src={characterImage(effectiveMbti)}
            alt={`${effectiveMbti} 캐릭터`}
            width={168}
            height={168}
            priority
            className="mx-auto block size-[168px] rounded-3xl object-contain"
          />

          <h1 className="keep-all m-0 mt-2.5 font-extrabold text-[25px] leading-[1.3] tracking-[-.035em] text-ink-900">
            내 캐릭터
          </h1>

          <div
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-full px-[13px] py-1.5"
            style={{ background: "rgba(255,255,255,.7)" }}
          >
            <span className="font-mono font-bold text-[14px] leading-none tracking-[.04em] text-ink-800">
              {effectiveMbti}
            </span>
            {fromQuiz ? (
              <span className="font-medium text-[13px] leading-none text-ink-600">· 30초 컷 결과</span>
            ) : null}
          </div>
        </div>

        <Panel s="cream" pad={16} r={18} className="mt-[18px]">
          <div className="t-note-title mb-2 text-txt-strong">16종 중 하나가 자동 배정됩니다</div>
          <p className="t-note text-pretty-keep m-0 text-txt">
            캐릭터는 팀원에게 나를 소개하는 표시입니다. 잘하는 일이나 맡을 역할을 뜻하지 않습니다.
          </p>
        </Panel>

        <Note tone="y" icon="check" className="mt-3">
          16종 캐릭터 이미지를 반영했습니다. 캐릭터별 고유 이름은 아직 제공되지 않아, 이름 대신 MBTI 유형명을
          그대로 씁니다.
        </Note>

        {fromQuiz ? (
          <Note tone="y" icon="info" className="mt-3">
            30초 컷은 <b>간편 선택</b>입니다. 정식 검사 결과가 아니고, 언제든 직접 고쳐서 바꿀 수 있습니다.
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
