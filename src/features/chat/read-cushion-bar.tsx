import { Chip, Icon, Sheet, Switch } from "@/components/ui";
import { cn } from "@/lib/cn";
import { toneOf, type ReadCushionSetting } from "@/lib/read-cushion";
import type { CushionLevel, CushionTone } from "@/lib/types";
import { TonePicker } from "@/features/tools/tone-picker";


export function ReadCushionBar({
  setting,
  tones,
  levels,
  working,
  notice,
  usage,
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
  /**
   * 오늘 순화를 몇 번 돌렸는지. `readable` 이 false 면 **읽지 못한 것**(AI 키 없음·요청 실패)이라
   * 숫자를 말하지 않는다. 한도가 없으므로 "남음" 을 말하지 않는다(2026-09-28).
   */
  usage: { used: number; readable: boolean };
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
        label="읽기 도움"
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

          {/* **쓴 횟수**만 말한다 — 한도가 없으므로 "남음" 을 말할 수 없다(2026-09-28). */}
          {usage.readable && usage.used > 0 ? (
            <p className="t-cap mt-2.5 mb-0 text-txt-muted">오늘 읽기 도움 {usage.used}회</p>
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
    </div>
  );
}

/**
 * 01 읽기 순화 바텀 시트 (Plan A: 상단 공간 확보형).
 *
 * 상단 바가 250px 넘게 화면을 가리는 문제를 해결하기 위해,
 * 상단 AppBar 아이콘을 터치했을 때 열리는 시트로 분리한다.
 */
export function ReadCushionSheet({
  open,
  onClose,
  setting,
  tones,
  levels,
  usage,
  notice,
  onEnabled,
  onLevel,
  onTone,
  onRetry,
}: {
  open: boolean;
  onClose: () => void;
  setting: ReadCushionSetting;
  tones: CushionTone[];
  levels: CushionLevel[];
  usage: { used: number; readable: boolean };
  notice: string | null;
  onEnabled: (next: boolean) => void;
  onLevel: (key: string) => void;
  onTone: (key: string) => void;
  onRetry: () => void;
}) {
  return (
    <Sheet open={open} title="읽기 도움 설정" onClose={onClose}>
      <div className="p-4 space-y-4">
        {/* 스위치 박스 */}
        <div className="rounded-[16px] bg-fill px-4 py-2.5">
          <Switch
            checked={setting.enabled}
            onChange={onEnabled}
            icon={<Icon name="wand-sparkles" size={18} className="text-yellow-600" />}
            label="읽기 도움"
            stateText={
              setting.enabled
                ? "상대방의 메시지를 AI로 다듬어 보여줍니다"
                : "이 방의 대화는 원문 그대로 읽습니다"
            }
          />
        </div>

        {setting.enabled ? (
          <>
            {/* 읽기 강도 */}
            <div>
              <div className="mb-2 font-bold text-[13.5px] text-txt-strong">얼마까지 세게 다듬을까요?</div>
              <TonePicker
                tones={levels}
                value={setting.mode}
                onChange={onLevel}
                label="읽기 강도"
                className="mb-1"
              />
              <p className="t-cap mb-0 mt-1 text-txt-muted">
                {levels.find((level) => level.key === setting.mode)?.desc ?? ""}
              </p>
            </div>

            {/* 읽는 말투 */}
            <div>
              <div className="mb-2 font-bold text-[13.5px] text-txt-strong">어떤 말투로 읽을까요?</div>
              <TonePicker
                tones={tones}
                value={toneOf(setting)}
                onChange={onTone}
                label="읽는 말투"
                className="mb-1"
              />
            </div>

            {/* 읽기 도움 몫 & 공지 안내 */}
            <div className="rounded-[14px] border border-line bg-card p-3 text-[12.5px] leading-relaxed text-txt-muted">
              <div className="flex items-center gap-1.5 font-semibold text-txt-strong mb-1">
                <Icon name="info" size={14} />
                <span>안내</span>
              </div>
              <p className="m-0">
                • 원문은 말풍선 아래 버튼을 눌러 언제든지 다시 볼 수 있습니다.<br />
                • 다듬어 읽은 말은 나에게만 보이며, 상대방에게는 영향을 주지 않습니다.
              </p>
              {usage.readable && usage.used > 0 ? (
                <p className="mt-1.5 mb-0 font-medium text-yellow-800">
                  오늘 읽기 도움 {usage.used}회 사용
                </p>
              ) : null}
            </div>

            {notice ? (
              <p className="t-cap mt-2 mb-0 text-err">
                {notice}{" "}
                <button
                  type="button"
                  onClick={onRetry}
                  className="cursor-pointer border-none bg-transparent p-0 font-bold text-err underline active:scale-95"
                >
                  다시 시도
                </button>
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </Sheet>
  );
}
