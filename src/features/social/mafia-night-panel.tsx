"use client";

import { Chip, Note, Rows, SecTitle } from "@/components/ui";
import { cn } from "@/lib/cn";
import { NIGHT_ACTION_LABEL } from "@/lib/mafia-rules";
import type { IceView } from "@/lib/types";
import { submitIceNightAction, type IceResult } from "@/server/actions/ice";

/**
 * 마피아의 밤 — **내가 할 밤 행동 하나.**
 *
 * 밤 행동은 예전에도 말로 했다(지목·치료·조사가 손짓으로 오갔다). 밤에 아무도 폰을 보지 않아야
 * 하므로, 한 사람이 **자기 폰에서 자기 행동 하나만** 고르고 그것만 서버로 간다.
 *
 * ## 왜 고를 수 있는 사람을 서버가 정하는가
 *
 * "아직 안 죽었다" · "자기 자신은 못 고른다(경찰은 자기 자신을 조사할 수 없다)" 를 화면에서 다시
 * 쓰면 규칙이 두 벌이 된다. 그래서 [`mayTargetAtNight`](@/lib/mafia-rules) 이 정한 id 목록만
 * 그린다 — 화면에 없는 사람은 이 밤에 고를 수 없는 사람이다.
 */
export function MafiaNightPanel({
  view,
  busy,
  run,
}: {
  view: IceView;
  busy: boolean;
  run: (action: () => Promise<IceResult>) => Promise<void>;
}) {
  const night = view.night;
  // 시민과 관전자는 밤에 아무것도 하지 않는다 — 선택지를 그리는 것만으로도 밤이 새어 나간다.
  if (!night?.mine || !night.open) return null;

  const kind = night.mine;
  const chosen = night.myTargetId ? (view.players.find((p) => p.id === night.myTargetId)?.name ?? null) : null;
  const targets = night.canTarget.map((id) => view.players.find((p) => p.id === id)).filter((p) => p !== undefined);

  return (
    <>
      <SecTitle note={chosen ? `${chosen} · ${night.day}일차 밤` : `${night.day}일차 밤`}>
        {NIGHT_ACTION_LABEL[kind]}
      </SecTitle>
      <Rows className="mb-3">
        {targets.map((p) => {
          const on = night.myTargetId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              disabled={busy}
              onClick={() => run(() => submitIceNightAction(kind, p.id))}
              className={cn(
                "box-border flex min-h-[52px] w-full items-center gap-3 border-none px-[15px] py-3 text-left select-none transition-all duration-150",
                on ? "bg-yellow-100 shadow-2xs" : "bg-transparent hover:bg-cr-50",
                busy ? "cursor-default" : "cursor-pointer active:scale-[0.985]",
              )}
            >
              <span className="t-label flex-1 text-txt-strong">{p.name}</span>
              {on ? (
                <Chip tone="y" icon="check" iconClassName="animate-pop">
                  내 선택
                </Chip>
              ) : null}
            </button>
          );
        })}
      </Rows>
      {chosen ? (
        <p className="t-cap m-0 mb-4 text-txt-muted">
          밤이 풀리기 전까지 바꿀 수 있습니다. **밤이 끝난 뒤에는** 누구도 이 선택을 고칠 수 없습니다.
        </p>
      ) : (
        <Note tone="warn" icon="moon" className="mb-4">
          아직 고르지 않았습니다. 고르지 않으면 밤이 끝나지 않습니다.
        </Note>
      )}
    </>
  );
}

/**
 * 경찰의 조사 결과 — **자기 카드에 붙인다.**
 *
 * 낮 동안에도 알아야 하니 밤 화면이 아니라 카드에 둔다. 카드는 기본으로 가려져 있으므로 옆 사람
 * 화면에 조사 결과가 함께 뜨지 않는다.
 */
export function PoliceCheckResult({ check }: { check: NonNullable<IceView["me"]>["check"] }) {
  if (!check) return null;
  return (
    <div className="mt-2">
      <p className="t-note m-0 text-txt">
        {check.day}일차 밤 · {check.name}님 조사 →{" "}
        <b className={check.isMafia ? "text-coral-700" : "text-txt-strong"}>
          {check.isMafia ? "마피아입니다" : "마피아가 아닙니다"}
        </b>
      </p>
    </div>
  );
}
