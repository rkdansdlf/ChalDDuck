import { Chip, Icon, Switch, Undecided } from "@/components/ui";
import { cn } from "@/lib/cn";
import { toneOf, type ReadCushionSetting } from "@/lib/read-cushion";
import type { CushionLevel, CushionTone } from "@/lib/types";
import { TonePicker } from "@/features/tools/tone-picker";

/**
 * 읽기 순화 설정 — 19 팀플 단톡방과 31 DM 이 **같은 것**을 그린다.
 *
 * 이 기능의 약속은 셋이고, 셋 다 이 자리에서 말로 보인다.
 * 1. **끄면 원문으로 읽는다.** 끄는 뜻은 "조용히 안 쓰는 것"이 아니라 "이 방은 원문으로
 *    읽겠다"다 — 서버가 AI 호출 후보를 아예 만들지 않는다.
 * 2. **숨기지 않는다.** 순화된 말에는 표시가 남고 원문을 다시 볼 수 있다(말풍선), 그리고
 *    AI 가 아니라 규칙으로 가린 것��은 **라벨이 다르다.**
 * 3. **원문이 저장된 원본이다.** 순화는 보기에만 걸린다.
 *
 * 강도 칩과 말투 칩은 15 쿠션 번역기와 같은 `TonePicker` 다 — 같은 말을 두 기능이 다르게
 * 쓰지 않게 한곳에서 그린다.
 */
export function ReadCushionBar({
  setting,
  tones,
  levels,
  working,
  notice,
  onEnabled,
  onLevel,
  onTone,
  onRetry,
}: {
  setting: ReadCushionSetting;
  tones: CushionTone[];
  levels: CushionLevel[];
  /** 순화가 도는 중인지. 도는 동안에도 원문은 이미 화면에 있다. */
  working: boolean;
  /** 실패 이유. 사람이 읽을 문장이고, 원문(또는 규칙 가림)으로 읽고 있다는 사실을 함께 말한다. */
  notice: string | null;
  onEnabled: (next: boolean) => void;
  onLevel: (key: string) => void;
  onTone: (key: string) => void;
  onRetry: () => void;
}) {
  return (
    <div className="mx-4 mt-2.5 rounded-control border border-line bg-card px-3.5 py-2.5">
      <Switch
        checked={setting.enabled}
        onChange={onEnabled}
        icon={<Icon name="shield" size={16} />}
        label="순화해서 읽기"
        stateText={
          setting.enabled
            ? "도착한 남의 말을 다듬어 보여 줍니다 · 원문은 말풍선에서 다시 볼 수 있어요"
            : "이 방의 말은 원문으로 읽습니다"
        }
      />

      {setting.enabled ? (
        <>
          <div className="t-cap-strong mb-[7px] font-bold text-txt-muted">얼마까지 세게</div>
          <TonePicker
            tones={levels}
            value={setting.mode}
            onChange={onLevel}
            label="읽기 강도"
            className="mb-1"
          />
          <p className="t-cap mb-2.5 mt-0 text-txt-muted">
            {levels.find((level) => level.key === setting.mode)?.desc ?? ""}
          </p>

          <div className="t-cap-strong mb-[7px] font-bold text-txt-muted">읽는 말투</div>
          <TonePicker
            tones={tones}
            // 고른 것이 없으면 첫 말투가 보인다 — 화면이 "아직 고르지 않음" 을 말하게 두지 않는다.
            value={toneOf(setting)}
            onChange={onTone}
            label="읽는 말투"
            className="mb-1"
          />

          {working ? (
            <div className="mt-2.5">
              <Chip tone="y" icon="sparkles" iconClassName="animate-wiggle">
                다듬는 중…
              </Chip>
            </div>
          ) : null}

          {notice ? (
            <p className="t-cap mt-2.5 mb-0 text-txt-muted">
              {notice}{" "}
              <button
                type="button"
                onClick={onRetry}
                className={cn(
                  "cursor-pointer border-none bg-transparent p-0 font-bold text-err underline",
                  "active:scale-95",
                )}
              >
                다시 시도
              </button>
            </p>
          ) : null}
        </>
      ) : null}

      <Undecided>
        읽기 순화는 기획안에 없습니다 — 보내는 쪽(15)과 말투를 빌려 쓰고, 강도 3단계와 끄는
        길은 함께 정했습니다. **강도별로 규칙 가림의 범위가 달라야 하는지**(지금 단계마다
        다릅니다), 순화된 말을 **몇 시간 뒤에 같은 단계로 다시 만들지**가 정해지지 않았습니다.
      </Undecided>
    </div>
  );
}
