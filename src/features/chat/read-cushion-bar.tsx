"use client";

import { Chip, Icon, Undecided } from "@/components/ui";
import { cn } from "@/lib/cn";
import { toneOf, type ReadCushionSetting } from "@/lib/read-cushion";
import type { CushionTone } from "@/lib/types";
import { TonePicker } from "@/features/tools/tone-picker";

/**
 * 읽는 말투 한 줄 — 19 팀플 단톡방과 31 DM 이 **같은 것**을 그린다.
 *
 * 이 기능의 약속은 세 가지고, 셋 다 이 자리에서 말로 보인다.
 * 1. **끄는 곳이 없다.** 남이 보낸 말은 순화되어 도착한다. 순화가 안 됐거나 한도가 끝나면
 *    그때는 원문이 보인다 — 사용자가 숨겨진 채로 원본을 대신 읽는 일은 없다.
 * 2. **숨기지 않는다.** 순화된 말에는 표시가 남고 원문을 다시 볼 수 있다(말풍선).
 * 3. **원문이 저장된 원본이다.** 순화는 보기에만 걸린다.
 *
 * 말투 칩은 15 쿠션 번역기와 같은 `TonePicker` 다 — 같은 말투를 두 기능이 다르게 쓰지
 * 않게 한곳에서 그린다.
 */
export function ReadCushionBar({
  setting,
  tones,
  working,
  notice,
  onTone,
  onRetry,
}: {
  setting: ReadCushionSetting;
  tones: CushionTone[];
  /** 순화가 도는 중인지. 도는 동안에도 원문은 이미 화면에 있다. */
  working: boolean;
  /** 실패 이유. 사람이 읽을 문장이고, 원문으로 읽고 있다는 사실을 함께 말한다. */
  notice: string | null;
  onTone: (key: string) => void;
  onRetry: () => void;
}) {
  return (
    <div className="mx-4 mt-2.5 rounded-control border border-line bg-card px-3.5 py-2.5">
      <div className="mb-2 flex items-center gap-1.5">
        <Icon name="shield" size={16} className="flex-none text-txt-muted" />
        <span className="t-cap text-txt-muted">
          도착한 말은 <b className="text-txt-strong">순화된 말</b>로 읽습니다
        </span>
        {working ? (
          <Chip tone="y" icon="sparkles" iconClassName="animate-wiggle">
            다듬는 중…
          </Chip>
        ) : null}
      </div>

      <TonePicker
        tones={tones}
        // 고른 것이 없으면 첫 말투가 보인다 — 화면이 "아직 고르지 않음" 을 말하게 두지 않는다.
        value={toneOf(setting)}
        onChange={onTone}
        label="읽는 말투"
      />

      {notice ? (
        <p className="t-cap mt-2.5 mb-0 text-txt-muted">
          {notice}{" "}
          <button
            type="button"
            onClick={onRetry}
            className={cn("cursor-pointer border-none bg-transparent p-0 font-bold text-err underline", "active:scale-95")}
          >
            다시 시도
          </button>
        </p>
      ) : null}

      <Undecided>
        읽을 때의 말투 3종이 맞는지는 기획안에 없습니다 — 보내는 쪽(15)과 같은 말을 빌려
        썼습니다. 읽을 때는 &quot;분명하게&quot; 가 낯설 수 있고, 순화의 강도도 정해지지
        않았습니다. **읽기 순화에 AI 몫을 따로 둘지**(지금은 보낼 때와 같은 하루 한도를
        씁니다)도 미정입니다.
      </Undecided>
    </div>
  );
}
