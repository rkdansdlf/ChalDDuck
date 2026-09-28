"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Btn, Panel, SecTitle, Sheet } from "@/components/ui";
import { MBTI_TYPES, calculateTeamMbtiStats, characterImage, getMbtiMeta, type MbtiType } from "@/lib/mbti";
import { cn } from "@/lib/cn";
import type { Member } from "@/lib/types";
import { updateMyMbti } from "@/server/actions/onboarding";

/**
 * 내 MBTI 등록·수정, 그리고 **팀에 등록된 값의 집계.**
 *
 * ## 이 화면이 그리는 것은 집계뿐이다
 *
 * 여기 보여 주는 것은 누가 무슨 값을 넣었는지의 **셈**(`withMbti` · 네 축 인원수)이다.
 * 입력값을 그대로 더한 것이므로 사실이고, 사람이 넣은 네 글자를 네 글자 그대로 옮긴다.
 *
 * `calculateTeamMbtiStats` 는 예전에 `dominantSummary`(예: "차분하게 텍스트로 생각을 정리하는
 * 분위기") 와 `collaborationTips` 도 함께 돌려줬다. **둘 다 없어졌다.** 자기보고("나는 INFP 다")
 * 한 줄을 55% 임계값으로 잘라 **팀이 실제로 그렇게 일하는지 서술**하고 거기서 **결과를 예측**
 * 하는데, 그 예측을 뒷받음할 근거가 코드에 없었다. 단정 어미로 말하니 거짓이면 그것이 팀에 대한
 * 사실 주장으로 남는다. `getMbtiSynergy` 도 **같은 계산**이어서 함께 걷혔다 — 두 글자 중 몇 개가
 * 다른지 보고 "최상의 호흡과 시너지" 라고 한 것은 같은 종류의 근거 없음이다.
 *
 * 그래서 이 함수는 **센 것만** 돌려준다. `withMbti` 와 네 축 인원수는 입력값을 더한 것이므로
 * 사실이다. 해석은 사람이 한다.
 *
 * **합계로 박는다.** 네 축 모두 "양쪽 인원수의 합 = 등록한 사람 수" 가 성립해야 한다. 한 축의
 * 분기가 조용히 사라져도 화면에 오류는 보이지 않는다 — 숫자 하나가 0 이 될 뿐이다.
 * (`scripts/smoke.mts` 가 네 축을 전부 돈다)
 *
 * ## 지우지 않은 것과 지운 것의 구분
 *
 * 예전에는 "이 함수를 쓴 다른 곳이 있어 지우면 그쪽이 깨진다" 고 적었고 판단을 **소비자**에
 * 두었다. 다른 곳이 **하나도 없었고**, 그사이 DM 화면이 그 계산을 쓰지 않는 것으로 드러났다 —
 * 남은 것은 **주석뿐**이었다. 근거 없는 해석을 "누군가 쓰고 있으니" 남겨 둘 이유는 없다.
 *
 * ## 어디에 붙나
 *
 * **07 역할 조율에 넣지 않는다.** 그 화면은 역할 배정을 다루고, MBTI 가 옆에 있으면
 * "유형이 배정에 영향을 주었다" 고 읽힌다. 실제로도 영향을 주지 않는다 —
 * `candidatesFor`(`server/actions/roles`)는 `wantRole`·`vetoRole`·거절 기록만 본다.
 * 07 화면이 "이 과정 어디에도 MBTI는 쓰이지 않습니다" 라고 말하는 것이 참이므로, 그
 * 문장을 지키려면 카드가 그 화면에 있어서는 안 된다.
 *
 * 계정과 기기에 둔다 — 내 MBTI 는 계정 값이고, 이 화면의 다른 항목(내 기기 · 이메일 ·
 * 재입장 코드 · 로그아웃)이 전부 내 계정 상태를 다루기 때문이다.
 */
export function TeamMbti({ members }: { members: Member[] }) {
  const router = useRouter();
  const me = members.find((m) => m.isMe);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<MbtiType | null>(me?.mbti ?? null);
  const [saving, setSaving] = useState(false);

  const stats = calculateTeamMbtiStats(members.map((m) => m.mbti));
  const myMeta = getMbtiMeta(me?.mbti);
  const pickedMeta = getMbtiMeta(picked);

  return (
    <>
      <SecTitle note="캐릭터와 소통 방식에만 씁니다. 역할 배정과는 관계없습니다">내 MBTI</SecTitle>
      <Panel s="cream" pad={16} className="mb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="t-cap-strong text-txt-muted">등록된 유형</div>
            {me?.mbti ? (
              <div className="mt-0.5 flex items-center gap-2">
                <span className="font-mono text-[15px] font-extrabold text-txt-strong">{me.mbti}</span>
                <span className="t-body keep-all truncate text-txt-muted">{myMeta?.characterName}</span>
              </div>
            ) : (
              <div className="t-body mt-0.5 text-txt-strong">아직 등록하지 않았습니다</div>
            )}
          </div>
          <Btn
            v="outline"
            size="sm"
            onClick={() => {
              setPicked(me?.mbti ?? null);
              setOpen(true);
            }}
          >
            {me?.mbti ? "변경" : "등록"}
          </Btn>
        </div>
      </Panel>

      {/* 집계는 **있는 것만** 보여 준다. 한 명도 안 넣었으면 축을 그려 빈 상자를 남기지 않는다. */}
      {stats.withMbti > 0 ? (
        <>
          <SecTitle note={`팀 ${stats.total}명 중 ${stats.withMbti}명이 등록했습니다`}>
            팀에 등록된 성향
          </SecTitle>
          <Panel s="card" pad={16} className="mb-4 flex flex-col gap-2.5">
            <AxisBar label="E 외향" count={stats.axes.ei.e} other="I 내향" otherCount={stats.axes.ei.i} />
            <AxisBar label="S 감각" count={stats.axes.sn.s} other="N 직관" otherCount={stats.axes.sn.n} />
            <AxisBar label="T 사고" count={stats.axes.tf.t} other="F 감정" otherCount={stats.axes.tf.f} />
            <AxisBar label="J 판단" count={stats.axes.jp.j} other="P 인식" otherCount={stats.axes.jp.p} />
          </Panel>
        </>
      ) : null}

      <Sheet open={open} title="내 MBTI 변경" onClose={() => setOpen(false)}>
        <p className="text-pretty-keep m-0 mb-3.5 text-[14.5px] leading-[1.6] text-txt">
          고른 유형으로 찰떡 캐릭터가 정해집니다.{" "}
          <b>역할 배정에는 쓰이지 않습니다</b> — 배정은 각자 고른 희망 역할과 추첨으로만 정해집니다.
        </p>

        <div role="radiogroup" aria-label="MBTI 유형" className="mb-3.5 grid grid-cols-4 gap-[7px]">
          {MBTI_TYPES.map((type) => {
            const on = picked === type;
            return (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setPicked(type)}
                className={cn(
                  "min-h-[48px] cursor-pointer rounded-[13px] font-mono text-[14px] leading-none tracking-[.02em] transition-all duration-150 active:scale-95",
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

        <button
          type="button"
          onClick={() => setPicked(null)}
          className={cn(
            "mb-4 w-full cursor-pointer rounded-xl border py-2.5 text-[13px] font-medium transition-colors",
            picked === null
              ? "border-yellow-600 bg-yellow-100 font-bold text-ink-900"
              : "border-line bg-card text-txt-muted hover:bg-cr-50",
          )}
        >
          입력하지 않기
        </button>

        {picked && pickedMeta ? (
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-yellow-200 bg-linear-to-b from-yellow-50 to-card p-3">
            <div className="relative size-12 flex-none overflow-hidden rounded-lg border border-yellow-200 bg-yellow-100">
              <Image
                src={characterImage(picked)}
                alt={picked}
                width={48}
                height={48}
                className="size-full object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[14px] font-extrabold text-yellow-800">{picked}</span>
                <span className="keep-all text-[13px] font-bold text-txt-strong">
                  {pickedMeta.characterName}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[12px] text-txt-muted">{pickedMeta.shortDesc}</p>
            </div>
          </div>
        ) : null}

        <div className="flex gap-2">
          <Btn full v="outline" disabled={saving} onClick={() => setOpen(false)}>
            취소
          </Btn>
          <Btn
            full
            disabled={saving}
            onClick={() => {
              setSaving(true);
              void updateMyMbti(picked)
                .then(() => {
                  setOpen(false);
                  router.refresh();
                })
                .finally(() => setSaving(false));
            }}
          >
            {saving ? "저장 중…" : "저장"}
          </Btn>
        </div>
      </Sheet>
    </>
  );
}

/**
 * 한 축의 두 갈래 인원수.
 *
 * **비율 바는 두 수의 관계만 그린다.** 어느 쪽이 "좋다" 고 말하지 않는다 — 그건 이 화면이
 * 하지 않는 말이다. 가로 막대는 "몇 명인가" 를 눈으로 옮긴 것이지 평가가 아니다.
 */
function AxisBar({
  label,
  count,
  other,
  otherCount,
}: {
  label: string;
  count: number;
  other: string;
  otherCount: number;
}) {
  const total = count + otherCount;
  const left = total > 0 ? Math.round((count / total) * 100) : 50;
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11.5px] font-medium text-txt-muted">
        <span>
          {label} {count}명
        </span>
        <span>
          {other} {otherCount}명
        </span>
      </div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-line">
        <div className="h-full bg-yellow-500 transition-all duration-300" style={{ width: `${left}%` }} />
        <div
          className="h-full bg-amber-200 transition-all duration-300"
          style={{ width: `${100 - left}%` }}
        />
      </div>
    </div>
  );
}
