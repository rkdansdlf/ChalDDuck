"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Btn, Field, Icon, Input, Sheet } from "@/components/ui";
import type { Role, RoleKind } from "@/lib/types";
import { cn } from "@/lib/cn";
import type { useAction } from "@/lib/use-action";
import { addTeamRole, removeTeamRole, updateTeamRole, type RoleEditResult } from "@/server/actions/roles";
import { MAX_ROLES, MAX_ROLE_NAME, MAX_ROLE_NOTE, ROLE_ERROR_TEXT } from "./role-rules";
import { ROLE_KIND_LABEL } from "./roster-model";

/** 유형을 한 줄로 풀어 쓴 말 — 이름만 있으면 "운영" 과 "보조" 가 무엇이 다른지 모른다. */
const KIND_HELP: Record<RoleKind, string> = {
  core: "결과물을 직접 만드는 일 — 모든 팀원이 하나는 맡도록 추천해요",
  ops: "팀이 굴러가게 하는 일 — 일정·회의·진행 관리",
  support: "남이 만든 것을 다듬는 일 — 핵심 업무를 대신하지는 않아요",
};

const KINDS: RoleKind[] = ["core", "ops", "support"];

/** 편집 중인 한 역할. `key` 가 null 이면 새로 더하는 중이다. */
type Draft = { key: string | null; name: string; note: string; kind: RoleKind };

/** 지울 수 없는 이유 — 화면이 그대로 보여 준다. */
const BLOCKED_TEXT = {
  confirmed: "확정된 담당이 있는 역할은 지울 수 없어요 — 이름이나 유형을 고칠 수 있어요",
  box: "드라이브 제출함이 묶인 역할은 지울 수 없어요 — 올라온 파일의 주인이 사라져요",
  last: "역할이 하나는 있어야 해요",
} as const;

function messageOf(result: RoleEditResult, done: string): string {
  switch (result.status) {
    case "ok":
      return done;
    case "invalid":
      return ROLE_ERROR_TEXT[result.error];
    case "forbidden":
      return "팀장만 역할을 바꿀 수 있어요";
    case "gone":
      return "이미 없는 역할이에요 — 화면을 새로 불러왔어요";
    case "blocked":
      return BLOCKED_TEXT[result.reason];
  }
}

/**
 * 07 **역할 편집** — 팀장이 프로젝트에 맞게 역할을 더하고, 이름·유형을 고치고, 지운다.
 *
 * 기본 다섯 개로 시작하고 처음 고칠 때 팀의 목록이 된다. **키는 바뀌지 않아** 이름을 바꿔도 기존
 * 배정·기록이 이어진다. 확정된 담당이나 제출함이 묶인 역할은 지울 수 없다 — 그 둘은 기록의 근거다.
 * 지우기는 되돌릴 수 없어 한 번 더 묻는다.
 */
export function RoleEditSheet({
  open,
  roles,
  run,
  onClose,
}: {
  open: boolean;
  roles: Role[];
  run: ReturnType<typeof useAction>["run"];
  onClose: () => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const close = () => {
    setDraft(null);
    setError(null);
    setConfirmDelete(false);
    onClose();
  };

  const edit = (next: Draft | null) => {
    setDraft(next);
    setError(null);
    setConfirmDelete(false);
  };

  const save = () =>
    run(
      "role-save",
      async () => {
        if (!draft) return;
        const input = { name: draft.name, note: draft.note, kind: draft.kind };
        const result = draft.key === null ? await addTeamRole(input) : await updateTeamRole(draft.key, input);
        router.refresh();
        if (result.status === "ok") {
          edit(null);
          return draft.key === null ? "역할을 더했습니다" : "역할을 고쳤습니다";
        }
        // 입력 오류는 칸 아래에서 말한다. 그 밖에는 토스트로.
        if (result.status === "invalid") setError(ROLE_ERROR_TEXT[result.error]);
        else return messageOf(result, "");
      },
      "저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
    );

  const remove = () =>
    run(
      "role-remove",
      async () => {
        if (!draft || draft.key === null) return;
        const result = await removeTeamRole(draft.key);
        router.refresh();
        if (result.status === "ok") edit(null);
        else setConfirmDelete(false);
        return messageOf(result, "역할을 지웠습니다");
      },
      "지우지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
    );

  const full = roles.length >= MAX_ROLES;

  return (
    <Sheet
      open={open}
      title={draft ? (draft.key === null ? "역할 더하기" : "역할 고치기") : "역할 편집"}
      onClose={draft ? () => edit(null) : close}
      footer={
        draft ? (
          <div className="flex gap-2">
            <Btn v="outline" onClick={() => edit(null)}>
              취소
            </Btn>
            <Btn full disabled={draft.name.trim() === ""} onClick={() => void save()}>
              {draft.key === null ? "더하기" : "저장"}
            </Btn>
          </div>
        ) : (
          <Btn
            full
            icon="plus"
            disabled={full}
            onClick={() => edit({ key: null, name: "", note: "", kind: "core" })}
          >
            {full ? `역할은 ${MAX_ROLES}개까지 둘 수 있어요` : "역할 더하기"}
          </Btn>
        )
      }
    >
      {draft ? (
        <>
          <Field label="이름" required error={error}>
            {(props) => (
              <Input
                {...props}
                value={draft.name}
                onChange={(v) => setDraft({ ...draft, name: v })}
                placeholder="예: 설문 설계"
                maxLength={MAX_ROLE_NAME}
                error={error !== null}
                autoFocus
              />
            )}
          </Field>
          <Field label="한 줄 설명" hint="무엇을 하는 역할인지 팀원이 한눈에 알 수 있게요">
            {(props) => (
              <Input
                {...props}
                value={draft.note}
                onChange={(v) => setDraft({ ...draft, note: v })}
                placeholder="예: 설문 문항 작성과 응답 정리"
                maxLength={MAX_ROLE_NOTE}
              />
            )}
          </Field>

          <div className="mb-1 text-[13px] font-bold text-txt-strong">유형</div>
          <div role="radiogroup" aria-label="역할 유형" className="mb-1.5 flex gap-1.5">
            {KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={draft.kind === kind}
                onClick={() => setDraft({ ...draft, kind })}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-[13.5px] leading-none",
                  draft.kind === kind ? "border-line bg-ink-900 font-bold text-white" : "border-line bg-card text-txt",
                )}
              >
                {ROLE_KIND_LABEL[kind]}
              </button>
            ))}
          </div>
          <p className="m-0 mb-4 text-[12.5px] leading-snug text-txt-muted">{KIND_HELP[draft.kind]}</p>

          {draft.key !== null ? (
            confirmDelete ? (
              <div className="rounded-[14px] bg-err-bg px-3.5 py-3">
                <p className="m-0 mb-2.5 text-[13px] leading-[1.5] text-txt-strong">
                  <b>{draft.name}</b> 역할을 지울까요? 이 역할을 희망하거나 피하던 팀원의 선택이 비워지고, 받기를
                  기다리던 추첨도 사라져요. 되돌릴 수 없어요.
                </p>
                <div className="flex gap-2">
                  <Btn size="sm" v="outline" onClick={() => setConfirmDelete(false)}>
                    그만두기
                  </Btn>
                  <Btn size="sm" icon="trash-2" onClick={() => void remove()}>
                    지우기
                  </Btn>
                </div>
              </div>
            ) : (
              <Btn size="sm" v="ghost" icon="trash-2" onClick={() => setConfirmDelete(true)}>
                이 역할 지우기
              </Btn>
            )
          ) : null}
        </>
      ) : (
        <>
          <p className="m-0 mb-3 text-[13px] leading-[1.55] text-txt-muted">
            프로젝트에 맞게 역할을 더하거나 고쳐요. 이름을 바꿔도 이미 정해진 담당과 기록은 그대로 이어져요.
            팀원은 바뀐 역할을 보고 희망 역할을 다시 고를 수 있어요.
          </p>
          <ul className="m-0 list-none divide-y divide-line/60 overflow-hidden rounded-[16px] border border-line bg-card p-0">
            {roles.map((r) => (
              <li key={r.key}>
                <button
                  type="button"
                  onClick={() => edit({ key: r.key, name: r.name, note: r.note, kind: r.kind })}
                  className="flex min-h-[56px] w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left"
                >
                  <span className="min-w-0">
                    <span className="block text-[14.5px] font-bold text-txt-strong">
                      {r.name}
                      <span className="ml-1.5 text-[12px] font-semibold text-txt-muted">{ROLE_KIND_LABEL[r.kind]}</span>
                    </span>
                    {r.note ? <span className="block truncate text-[12.5px] text-txt-muted">{r.note}</span> : null}
                  </span>
                  <Icon name="chevron-right" size={16} className="flex-none text-txt-muted" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  );
}
