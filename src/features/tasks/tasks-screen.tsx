"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AppBar,
  Avatar,
  Body,
  Btn,
  Chip,
  Field,
  Icon,
  Input,
  Note,
  Rows,
  Sheet,
  STATUS,
  StatusBadge,
  Toast,
  Undecided,
  type IconName,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Member, Task, TaskKind, TaskKindKey } from "@/lib/types";
import { useAction } from "@/lib/use-action";
import { addTask, cycleTaskStatus, updateTask } from "@/server/actions/tasks";

/**
 * 21 할 일 · 체크리스트.
 *
 * 팀 업무·개인 학습·점검이 **한 목록에** 있고 종류로만 구분된다 — 팀플에서 할 일은
 * 어차피 섞여 있고, 목록을 나누면 어느 쪽을 봐야 할지부터 정해야 한다.
 *
 * 상태는 드라이브·버전 기록과 같은 `STATUS` 어휘를 쓴다.
 */
export function TasksScreen({
  tasks,
  kinds,
  roster,
}: {
  tasks: Task[];
  kinds: TaskKind[];
  /** 담당자를 고르는 명단. 지금 팀에 있는 사람만 담긴다. */
  roster: Member[];
}) {
  const router = useRouter();

  const [filter, setFilter] = useState<TaskKindKey | "all">("all");
  const [adding, setAdding] = useState(false);
  /** 편집 중인 할 일. 눌린 행 하나. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const { toast, busy, run } = useAction();

  // 명단에는 나간 사람이 이미 없다(`getRoster` 가 걸러 준다). 서버도 같은 조건으로 막는다.
  const assignable = roster;

  const [draft, setDraft] = useState<TaskDraft>(EMPTY_DRAFT);
  const [editingDraft, setEditingDraft] = useState<TaskDraft>(EMPTY_DRAFT);
  const editing = tasks.find((t) => t.id === editingId) ?? null;

  // 열 때만 폼을 채운다 — 매 렌저 다시 쓰면 typing 하는 동안 글자가 흔들린다.
  const openEditor = (task: Task) => {
    setEditingId(task.id);
    setEditingDraft({
      title: task.title,
      kind: task.kind,
      assignee: task.assignee ?? "",
      due: task.due === "미정" ? "" : task.due,
    });
  };

  const remaining = tasks.filter((t) => t.status !== "done").length;
  const shown = filter === "all" ? tasks : tasks.filter((t) => t.kind === filter);
  const kindOf = (key: TaskKindKey) => kinds.find((k) => k.key === key) ?? kinds[0];

  const filters: Array<{ key: TaskKindKey | "all"; label: string }> = [
    { key: "all", label: "전체" },
    ...kinds.map((k) => ({ key: k.key, label: k.name })),
  ];

  return (
    <>
      <AppBar
        title="할 일 · 체크리스트"
        sub={`${remaining}건 남음`}
        onBack={() => router.push("/home")}
        action="plus"
        actionLabel="할 일 추가"
        onAction={() => setAdding(true)}
      />

      <Body dense>
        <div role="tablist" aria-label="할 일 종류" className="mb-3.5 flex gap-1.5 overflow-x-auto">
          {filters.map((item) => {
            const on = filter === item.key;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setFilter(item.key)}
                className={cn(
                  "min-h-11 flex-none cursor-pointer whitespace-nowrap rounded-xl px-[13px] font-bold text-[13px] leading-none",
                  on
                    ? "border border-transparent bg-action text-on-action"
                    : "border border-line bg-card text-txt",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <Btn
          v="outline"
          size="sm"
          icon="bell"
          className="mb-3.5"
          onClick={() => router.push("/home/tasks/poke")}
        >
          담당자에게 진행상황 묻기
        </Btn>

        <Rows>
          {shown.map((task) => {
            const status = STATUS[task.status];
            const kind = kindOf(task.kind);
            const done = task.status === "done";
            return (
              <div key={task.id} className="flex min-h-[56px] items-start gap-3 px-[15px] py-[13px]">
                <button
                  type="button"
                  disabled={busy.cycle}
                  onClick={() =>
                    void run("cycle", async () => {
                      await cycleTaskStatus(task.id);
                      router.refresh();
                    }, "상태를 바꾸지 못했습니다. 다시 눌러 주세요.")
                  }
                  aria-label={`${task.title} — 지금 ${status.label}, 눌러서 다음 상태로`}
                  className="mt-px flex-none cursor-pointer border-none bg-transparent p-0 text-txt-muted"
                >
                  <Icon name={status.icon} size={22} />
                </button>

                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => openEditor(task)}
                    className="block w-full cursor-pointer border-none bg-transparent p-0 text-left"
                  >
                    <div
                      className={cn(
                        "text-pretty-keep font-semibold text-[14.5px] leading-[1.5]",
                        done ? "text-txt-faint line-through" : "text-txt-strong",
                      )}
                    >
                      {task.title}
                    </div>
                  </button>

                  <div className="mt-[7px] flex flex-wrap gap-[5px]">
                    <Chip icon={kind.icon as IconName}>{kind.name}</Chip>
                    {task.assignee ? (
                      <Chip icon={task.isMine ? "user-check" : "user-round"}>
                        {task.isMine ? `${task.assignee}(나)` : task.assignee}
                        {task.assigneeLeft ? " · 팀 퇴장" : ""}
                      </Chip>
                    ) : (
                      <Chip tone="warn" icon="circle-dashed">
                        담당자 미정
                      </Chip>
                    )}
                    <Chip icon="calendar-clock">{task.due}</Chip>
                    <StatusBadge status={task.status} />
                    {task.source === "clerk" ? (
                      <Chip tone="y" icon="notebook-pen">
                        AI 서기
                      </Chip>
                    ) : null}
                  </div>
                </div>

                {task.mbti ? <Avatar mbti={task.mbti} name={task.assignee ?? ""} size={30} /> : null}
              </div>
            );
          })}
        </Rows>

        <Note tone="info" icon="list-checks" className="mt-3.5">
          상태 아이콘을 누르면 <b>할 일 → 진행 중 → 완료</b> 순으로 바뀝니다. 완료 표시는 담당자만 되돌릴
          수 있다고 가정했습니다.
        </Note>

        <Undecided>
          담당자 지정을 당사자가 수락해야 확정되는지, 마감을 놓치면 어떻게 되는지는 기획안에 없어 다루지
          않았습니다.
        </Undecided>
      </Body>

      <Sheet
        open={adding}
        title="할 일 고쳐 적기"
        onClose={() => setAdding(false)}
        footer={
          <Btn
            full
            size="lg"
            disabled={busy.add || !draft.title.trim()}
            onClick={() =>
              void run(
                "add",
                async () => {
                  await addTask(draft.kind, draft.title, {
                    assignee: draft.assignee || null,
                    due: draft.due,
                  });
                  setAdding(false);
                  setFilter("all");
                  setDraft(EMPTY_DRAFT);
                  router.refresh();
                  return "추가했습니다";
                },
                "추가하지 못했습니다. 다시 시도해 주세요.",
              )
            }
          >
            목록에 넣기
          </Btn>
        }
      >
        <TaskFields
          draft={draft}
          onChange={setDraft}
          kinds={kinds}
          assignable={assignable}
        />
      </Sheet>

      <Sheet
        open={editing !== null}
        title="할 일 고쳐 적기"
        onClose={() => setEditingId(null)}
        footer={
          <Btn
            full
            size="lg"
            disabled={busy.edit || !editingDraft.title.trim()}
            onClick={() =>
              void run(
                "edit",
                async () => {
                  if (!editing) return;
                  await updateTask(editing.id, {
                    title: editingDraft.title,
                    assignee: editingDraft.assignee || null,
                    due: editingDraft.due,
                  });
                  setEditingId(null);
                  router.refresh();
                  return "고쳐 적었습니다";
                },
                "고치지 못했습니다. 다시 시도해 주세요.",
              )
            }
          >
            저장하기
          </Btn>
        }
      >
        <TaskFields
          draft={editingDraft}
          onChange={setEditingDraft}
          kinds={kinds}
          assignable={assignable}
        />
      </Sheet>

      <Toast msg={toast} />
    </>
  );
}

/**
 * 할 일 한 개의 제목·종류·담당자·기한.
 *
 * 추가와 편집이 **같은 폼**을 쓴다 — 예전에는 추가만 있었고 "목록에서 이어서 채웁니다"
 * 라는 문장만 있고 그 길이 없었다. 사람이 넣은 할 일은 제목이 `새 팀 업무` 로, 담당자가
 * 미정으로 남았는데, 담당자가 없으면 콕 찌르기 대상이 되지 못해 사실상 쓸 수 없었다.
 */
type TaskDraft = {
  title: string;
  kind: TaskKindKey;
  /** 이름. 비면 미정. */
  assignee: string;
  /** 비어 있으면 미정으로 저장된다. */
  due: string;
};

const EMPTY_DRAFT: TaskDraft = { title: "", kind: "team", assignee: "", due: "" };

function TaskFields({
  draft,
  onChange,
  kinds,
  assignable,
}: {
  draft: TaskDraft;
  onChange: (next: TaskDraft) => void;
  kinds: TaskKind[];
  assignable: Member[];
}) {
  return (
    <>
      {/* `Field` 는 한 입력에 대한 `<label for>` 이라 render-prop 이다. 종류·담당자는
          여러 개를 고르는 그룹이라 `role="group"` 으로 묶고 라벨을 따로 준다. */}
      <Field label="무엇을 해야 하나요" required>
        {(p) => (
          <Input
            {...p}
            value={draft.title}
            onChange={(value) => onChange({ ...draft, title: value })}
            placeholder="예: 실험 결과 정리해서 공유"
            maxLength={120}
          />
        )}
      </Field>

      <div className="mb-3.5">
        <div className="t-label mb-1.5 block text-txt-strong">종류</div>
        <div role="group" aria-label="할 일 종류" className="flex flex-wrap gap-[7px]">
          {kinds.map((kind) => (
            <button
              key={kind.key}
              type="button"
              aria-pressed={draft.kind === kind.key}
              onClick={() => onChange({ ...draft, kind: kind.key })}
              className={chipClass(draft.kind === kind.key)}
            >
              <Icon name={kind.icon as IconName} size={15} />
              {kind.name}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3.5">
        <div className="t-label mb-1.5 block text-txt-strong">담당자</div>
        <div role="group" aria-label="담당자" className="flex flex-wrap gap-[7px]">
          <button
            type="button"
            aria-pressed={draft.assignee === ""}
            onClick={() => onChange({ ...draft, assignee: "" })}
            className={chipClass(draft.assignee === "")}
          >
            미정
          </button>
          {assignable.map((m) => {
            const on = draft.assignee === m.name;
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ ...draft, assignee: m.name })}
                className={chipClass(on)}
              >
                {m.name}
                {m.isMe ? "(나)" : ""}
              </button>
            );
          })}
        </div>
        <div className="t-cap text-pretty-keep mt-1.5 text-txt-muted">
          비워 두면 미정으로 남습니다. 담당자가 정해져야 콕 찌르기가 됩니다.
        </div>
      </div>

      <Field label="기한">
        {(p) => (
          <Input
            {...p}
            value={draft.due}
            onChange={(value) => onChange({ ...draft, due: value })}
            placeholder="예: 다음 발표까지"
            maxLength={40}
          />
        )}
      </Field>
    </>
  );
}

function chipClass(on: boolean) {
  return cn(
    "inline-flex min-h-11 cursor-pointer items-center rounded-chip px-3 text-[13px] font-bold leading-none",
    on ? "border border-transparent bg-action text-on-action" : "border border-line bg-card text-txt",
  );
}
