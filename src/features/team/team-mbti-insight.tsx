"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Btn, Chip, Icon, Panel, SecTitle, Sheet } from "@/components/ui";
import {
  MBTI_TYPES,
  calculateTeamMbtiStats,
  characterImage,
  getMbtiMeta,
  getMbtiSynergy,
  type MbtiType,
} from "@/lib/mbti";
import type { Member } from "@/lib/types";
import { updateMyMbti } from "@/server/actions/onboarding";
import { cn } from "@/lib/cn";

export function TeamMbtiInsight({
  members,
  myMember,
}: {
  members: Member[];
  myMember: Member | undefined;
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedMbti, setSelectedMbti] = useState<MbtiType | null>(myMember?.mbti ?? null);
  const [saving, setSaving] = useState(false);
  const [synergyTarget, setSynergyTarget] = useState<Member | null>(null);

  const stats = calculateTeamMbtiStats(members.map((m) => m.mbti));
  const myMeta = getMbtiMeta(selectedMbti);

  const handleSaveMbti = async () => {
    setSaving(true);
    try {
      await updateMyMbti(selectedMbti);
      setSheetOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="mt-5">
        <div className="flex items-center justify-between mb-2">
          <SecTitle note="팀원 성향과 소통 스타일 분석">우리 팀 소통 성향 (MBTI)</SecTitle>
          <button
            type="button"
            onClick={() => {
              setSelectedMbti(myMember?.mbti ?? null);
              setSheetOpen(true);
            }}
            className="flex items-center gap-1 text-[12.5px] font-bold text-yellow-800 hover:text-yellow-900 bg-yellow-100 hover:bg-yellow-200/80 px-2.5 py-1 rounded-full cursor-pointer border border-yellow-300 transition-colors"
          >
            <Icon name="pencil" size={13} />
            <span>내 MBTI {myMember?.mbti ? "수정" : "등록"}</span>
          </button>
        </div>

        <Panel s="card" pad={16} r={18} className="border border-line/80 shadow-2xs">
          {/* 상단: 팀 분위기 한 줄 요약 */}
          <div className="flex items-start gap-2 mb-3">
            <span className="grid size-7 flex-none place-items-center rounded-lg bg-yellow-100 text-yellow-800 mt-0.5">
              <Icon name="sparkles" size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <span className="font-extrabold text-[14.5px] text-ink-900 block leading-[1.35]">
                {stats.withMbti > 0
                  ? `팀원 ${stats.withMbti}명의 성향 분석`
                  : "팀원들의 성향을 등록해 보세요"}
              </span>
              <p className="keep-all mt-0.5 text-[13px] text-txt-strong leading-[1.45]">
                {stats.dominantSummary}
              </p>
            </div>
          </div>

          {/* 4축 게이지 바 (EI, SN, TF, JP) */}
          {stats.withMbti > 0 ? (
            <div className="mt-3.5 flex flex-col gap-2.5 rounded-xl bg-fill/60 p-3">
              {/* E vs I */}
              <AxisBar
                leftLabel="외향 E"
                rightLabel="내향 I"
                leftRatio={stats.axes.ei.ratioE}
                leftCount={stats.axes.ei.e}
                rightCount={stats.axes.ei.i}
              />
              {/* S vs N */}
              <AxisBar
                leftLabel="감각 S (현실)"
                rightLabel="직관 N (아이디어)"
                leftRatio={stats.axes.sn.ratioS}
                leftCount={stats.axes.sn.s}
                rightCount={stats.axes.sn.n}
              />
              {/* T vs F */}
              <AxisBar
                leftLabel="사고 T (논리)"
                rightLabel="감정 F (공감)"
                leftRatio={stats.axes.tf.ratioT}
                leftCount={stats.axes.tf.t}
                rightCount={stats.axes.tf.f}
              />
              {/* J vs P */}
              <AxisBar
                leftLabel="판단 J (계획)"
                rightLabel="인식 P (유연)"
                leftRatio={stats.axes.jp.ratioJ}
                leftCount={stats.axes.jp.j}
                rightCount={stats.axes.jp.p}
              />
            </div>
          ) : null}

          {/* 팀 협업 조언 팁 */}
          <div className="mt-3 border-t border-line/60 pt-3">
            <div className="text-[12.5px] font-bold text-txt-strong mb-1.5 flex items-center gap-1.5">
              <Icon name="sparkles" size={14} className="text-yellow-700" />
              <span>우리 팀 맞춤 협업 꿀팁</span>
            </div>
            <ul className="m-0 pl-4 text-[13px] leading-[1.5] text-txt space-y-1">
              {stats.collaborationTips.map((tip, idx) => (
                <li key={idx} className="text-pretty-keep">
                  {tip}
                </li>
              ))}
            </ul>
          </div>

          {/* 팀원과의 1:1 케미 보기 바로가기 */}
          {myMember && members.filter((m) => !m.isMe && m.mbti).length > 0 ? (
            <div className="mt-3.5 pt-3 border-t border-line/60">
              <div className="text-[12px] font-semibold text-txt-muted mb-2">
                나와 팀원 사이의 소통 케미 확인하기:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {members
                  .filter((m) => !m.isMe && m.mbti)
                  .map((other) => (
                    <button
                      key={other.id}
                      type="button"
                      onClick={() => setSynergyTarget(other)}
                      className="flex items-center gap-1.5 rounded-full border border-line bg-card hover:bg-yellow-50 px-2.5 py-1 text-[12px] font-medium text-txt cursor-pointer transition-colors"
                    >
                      <span>{other.name}</span>
                      <span className="font-mono font-bold text-yellow-800">{other.mbti}</span>
                    </button>
                  ))}
              </div>
            </div>
          ) : null}
        </Panel>
      </div>

      {/* 내 MBTI 수정 바텀 시트 */}
      <Sheet open={sheetOpen} title="내 MBTI 변경" onClose={() => setSheetOpen(false)}>
        <p className="text-[14px] text-txt-muted mb-3 leading-[1.5]">
          내 MBTI를 변경하면 찰떡 캐릭터와 팀플 스타일이 자동으로 함께 업데이트됩니다.
        </p>

        {/* 16개 그리드 선택 */}
        <div className="grid grid-cols-4 gap-1.5 mb-3.5">
          {MBTI_TYPES.map((type) => {
            const on = selectedMbti === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setSelectedMbti(type)}
                className={cn(
                  "min-h-[44px] cursor-pointer rounded-xl font-mono text-[13.5px] leading-none transition-all active:scale-95",
                  on
                    ? "bg-yellow-400 border-[1.5px] border-yellow-600 font-extrabold text-ink-900 shadow-2xs"
                    : "bg-card border border-line font-medium text-txt hover:bg-cr-50",
                )}
              >
                {type}
              </button>
            );
          })}
        </div>

        {/* 선택 안 함 옵션 */}
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setSelectedMbti(null)}
            className={cn(
              "w-full py-2.5 rounded-xl border text-[13px] font-medium transition-colors cursor-pointer",
              selectedMbti === null
                ? "border-yellow-600 bg-yellow-100 font-bold text-ink-900"
                : "border-line bg-card text-txt-muted hover:bg-cr-50",
            )}
          >
            MBTI 입력하지 않음 (이름 모노그램으로 표시)
          </button>
        </div>

        {/* 캐릭터 미리보기 */}
        {selectedMbti && myMeta ? (
          <div className="mb-4 rounded-xl border border-yellow-200 bg-linear-to-b from-yellow-50 to-card p-3 flex items-center gap-3">
            <div className="relative size-12 flex-none overflow-hidden rounded-lg bg-yellow-100 border border-yellow-200">
              <Image
                src={characterImage(selectedMbti)}
                alt={selectedMbti}
                width={48}
                height={48}
                className="size-full object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-bold text-yellow-800 text-[14px]">
                  {selectedMbti}
                </span>
                <span className="font-bold text-[13px] text-txt-strong">
                  {myMeta.characterName}
                </span>
              </div>
              <p className="mt-0.5 text-[12px] text-txt-muted line-clamp-1">{myMeta.shortDesc}</p>
            </div>
          </div>
        ) : null}

        <div className="flex gap-2">
          <Btn full size="lg" disabled={saving} onClick={handleSaveMbti}>
            {saving ? "저장하는 중…" : "저장하기"}
          </Btn>
          <Btn v="ghost" size="lg" onClick={() => setSheetOpen(false)}>
            취소
          </Btn>
        </div>
      </Sheet>

      {/* 1:1 케미 시너지 확인 바텀 시트 */}
      {synergyTarget ? (
        <Sheet
          open={Boolean(synergyTarget)}
          title={`${myMember?.name} & ${synergyTarget.name} 소통 케미`}
          onClose={() => setSynergyTarget(null)}
        >
          {(() => {
            const synergy = getMbtiSynergy(myMember?.mbti, synergyTarget.mbti);
            const otherMeta = getMbtiMeta(synergyTarget.mbti);
            return (
              <div className="space-y-4">
                <div className="flex items-center justify-around py-3 bg-yellow-50/80 rounded-2xl border border-yellow-200">
                  <div className="flex flex-col items-center gap-1">
                    <div className="size-12 overflow-hidden rounded-full border border-yellow-300 bg-white">
                      {myMember?.mbti ? (
                        <Image
                          src={characterImage(myMember.mbti)}
                          alt="나"
                          width={48}
                          height={48}
                          className="size-full object-cover"
                        />
                      ) : (
                        <span className="grid size-full place-items-center font-bold text-txt-muted">
                          {myMember?.name?.charAt(0) ?? "?"}
                        </span>
                      )}
                    </div>
                    <span className="font-bold text-[13px] text-txt-strong">나</span>
                    <span className="font-mono text-[12px] text-yellow-800 font-extrabold">
                      {myMember?.mbti ?? "미입력"}
                    </span>
                  </div>

                  <div className="flex flex-col items-center">
                    <span className="font-extrabold text-[18px] text-coral-600">⚡ 시너지</span>
                    <div className="flex text-yellow-500 mt-0.5">
                      {"★".repeat(synergy.score)}
                      {"☆".repeat(5 - synergy.score)}
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-1">
                    <div className="size-12 overflow-hidden rounded-full border border-yellow-300 bg-white">
                      {synergyTarget.mbti ? (
                        <Image
                          src={characterImage(synergyTarget.mbti)}
                          alt={synergyTarget.name}
                          width={48}
                          height={48}
                          className="size-full object-cover"
                        />
                      ) : (
                        <span className="grid size-full place-items-center font-bold text-txt-muted">
                          {synergyTarget.name.charAt(0)}
                        </span>
                      )}
                    </div>
                    <span className="font-bold text-[13px] text-txt-strong">
                      {synergyTarget.name}
                    </span>
                    <span className="font-mono text-[12px] text-yellow-800 font-extrabold">
                      {synergyTarget.mbti ?? "미입력"}
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-line p-3.5 bg-card">
                  <div className="font-extrabold text-[15px] text-ink-900 mb-1">
                    {synergy.title}
                  </div>
                  <p className="text-[13.5px] leading-[1.55] text-txt text-pretty-keep m-0">
                    {synergy.tip}
                  </p>
                </div>

                {otherMeta ? (
                  <div className="rounded-xl bg-fill/60 p-3 border border-line/60">
                    <div className="text-[12px] font-bold text-txt-strong mb-1">
                      💡 {synergyTarget.name}님과 일할 때의 소통 팁
                    </div>
                    <div className="text-[12.5px] leading-[1.5] text-txt">
                      {otherMeta.communicationTip.good}
                    </div>
                  </div>
                ) : null}

                <Btn full size="lg" onClick={() => setSynergyTarget(null)}>
                  확인 완료
                </Btn>
              </div>
            );
          })()}
        </Sheet>
      ) : null}
    </>
  );
}

function AxisBar({
  leftLabel,
  rightLabel,
  leftRatio,
  leftCount,
  rightCount,
}: {
  leftLabel: string;
  rightLabel: string;
  leftRatio: number;
  leftCount: number;
  rightCount: number;
}) {
  return (
    <div>
      <div className="flex justify-between text-[11.5px] font-medium text-txt-muted mb-1">
        <span>
          {leftLabel} ({leftCount}명)
        </span>
        <span>
          {rightLabel} ({rightCount}명)
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-line flex">
        <div
          className="h-full bg-yellow-500 transition-all duration-300"
          style={{ width: `${leftRatio}%` }}
        />
        <div
          className="h-full bg-amber-200 transition-all duration-300"
          style={{ width: `${100 - leftRatio}%` }}
        />
      </div>
    </div>
  );
}
