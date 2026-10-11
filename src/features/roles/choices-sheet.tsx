"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Btn, Sheet } from "@/components/ui";
import type { Role, RoleKey } from "@/lib/types";
import { cn } from "@/lib/cn";
import type { useAction } from "@/lib/use-action";
import { setMyRoleChoices } from "@/server/actions/roles";

export type MyChoices = { want: RoleKey | null; want2: RoleKey | null; veto: RoleKey | null };

/**
 * 내 **희망 역할**을 가입 뒤에 고치는 시트 — 첫 희망 · 두 번째 희망(선택) · 피할 역할(선택).
 *
 * 역할이 팀마다 바뀌므로(`TeamRole`) 가입 화면 한 번으로는 부족하다. 팀장이 역할을 더하면 이미 들어온
 * 팀원이 그 역할을 고를 길이 있어야 하고, 역할이 지워져 첫 희망이 비워진 사람은 다시 골라야 한다.
 *
 * 한 역할은 세 칸 중 **한 곳에만** 놓인다 — 다른 칸에서 고른 역할은 잠근다(서버도 막는다). 첫 희망은
 * 반드시 있어야 저장된다(가입할 때와 같은 규칙).
 */
export function ChoicesSheet({
  open,
  roles,
  current,
  run,
  onClose,
}: {
  open: boolean;
  roles: Role[];
  current: MyChoices;
  run: ReturnType<typeof useAction>["run"];
  onClose: () => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<MyChoices>(current);
  const [wasOpen, setWasOpen] = useState(open);

  // 열릴 때마다 서버 값으로 되돌린다 — 닫았다 연 뒤 지난번 초안이 남으면 저장된 값과 어긋난다.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(current);
  }

  const pick = (slot: keyof MyChoices, key: RoleKey) => {
    setDraft((d) => {
      const on = d[slot] === key;
      const next: MyChoices = { ...d, [slot]: on ? null : key };
      // 같은 역할이 다른 칸에 있으면 비운다 — 옮기는 것이지 복사가 아니다.
      if (!on) {
        for (const other of ["want", "want2", "veto"] as const) {
          if (other !== slot && next[other] === key) next[other] = null;
        }
      }
      return next;
    });
  };

  const save = () =>
    run(
      "choices",
      async () => {
        if (!draft.want) return;
        const result = await setMyRoleChoices({ want: draft.want, want2: draft.want2, veto: draft.veto });
        router.refresh();
        if (result === "ok") {
          onClose();
          return "희망 역할을 저장했습니다";
        }
        return "저장하지 못했습니다 — 역할이 바뀌었을 수 있어요. 화면을 새로 불러왔어요";
      },
      "저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
    );

  const rows: { slot: keyof MyChoices; label: string; hint: string }[] = [
    { slot: "want", label: "첫 희망 역할", hint: "꼭 하나 골라요 — 추첨은 이것으로 정해요" },
    { slot: "want2", label: "두 번째 희망 역할 · 선택", hint: "첫 희망이 겹칠 때 균형 추천이 참고해요" },
    { slot: "veto", label: "피할 역할 · 선택", hint: "이 역할은 추첨과 추천에서 빠져요" },
  ];

  return (
    <Sheet
      open={open}
      title="내 희망 역할"
      onClose={onClose}
      footer={
        <Btn full disabled={!draft.want} onClick={() => void save()}>
          저장
        </Btn>
      }
    >
      {rows.map(({ slot, label, hint }) => (
        <div key={slot} className="mb-4">
          <div className="text-[13.5px] font-bold text-txt-strong">{label}</div>
          <p className="m-0 mb-2 text-[12.5px] leading-snug text-txt-muted">{hint}</p>
          <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
            {roles.map((r) => {
              const on = draft[slot] === r.key;
              // 다른 칸이 쥔 역할은 이 칸에서 잠근다 — 누르면 그 칸에서 옮겨 오는 것이라 표시한다.
              const elsewhere = (["want", "want2", "veto"] as const).find((o) => o !== slot && draft[o] === r.key);
              return (
                <button
                  key={r.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => pick(slot, r.key)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[13.5px] leading-none",
                    on
                      ? "border-line bg-ink-900 font-bold text-white"
                      : elsewhere
                        ? "border-line bg-fill text-txt-muted"
                        : "border-line bg-card text-txt",
                  )}
                >
                  {r.name}
                  {elsewhere
                    ? ` · ${elsewhere === "want" ? "첫 희망" : elsewhere === "want2" ? "두 번째" : "피할래"}`
                    : ""}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </Sheet>
  );
}
