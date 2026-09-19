"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AppBar,
  Avatar,
  Body,
  Btn,
  Chip,
  Icon,
  Note,
  Rows,
  Sheet,
  STATUS,
  StatusBadge,
  Undecided,
  type IconName,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Task, TaskKind, TaskKindKey } from "@/lib/types";
import { addTask, cycleTaskStatus } from "@/server/actions/tasks";

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
}: {
  tasks: Task[];
  kinds: TaskKind[];
}) {
  const router = useRouter();

  const [filter, setFilter] = useState<TaskKindKey | "all">("all");
  const [adding, setAdding] = useState(false);

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
          담당자에게 콕 찌르기
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
                  onClick={async () => {
                    await cycleTaskStatus(task.id);
                    router.refresh();
                  }}
                  aria-label={`${task.title} — 지금 ${status.label}, 눌러서 다음 상태로`}
                  className="mt-px flex-none cursor-pointer border-none bg-transparent p-0 text-txt-muted"
                >
                  <Icon name={status.icon} size={22} />
                </button>

                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      "text-pretty-keep font-semibold text-[14.5px] leading-[1.5]",
                      done ? "text-txt-faint line-through" : "text-txt-strong",
                    )}
                  >
                    {task.title}
                  </div>

                  <div className="mt-[7px] flex flex-wrap gap-[5px]">
                    <Chip icon={kind.icon as IconName}>{kind.name}</Chip>
                    {task.assignee ? (
                      <Chip icon="user-round">{task.assignee}</Chip>
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

      <Sheet open={adding} title="업무 종류 고르기" onClose={() => setAdding(false)}>
        <p className="text-pretty-keep m-0 mb-3.5 text-[14.5px] leading-[1.6] text-txt">
          어떤 종류의 할 일인지 먼저 고르면 목록에 추가됩니다. 제목·담당자·기한은 목록에서 이어서
          채웁니다.
        </p>
        <div className="flex flex-col gap-2">
          {kinds.map((kind) => (
            <button
              key={kind.key}
              type="button"
              onClick={async () => {
                setAdding(false);
                setFilter("all");
                await addTask(kind.key, `새 ${kind.name}`);
                router.refresh();
              }}
              className="box-border flex min-h-[52px] w-full cursor-pointer items-center gap-2.5 rounded-control border border-line bg-card px-3.5 py-3 text-left"
            >
              <Icon name={kind.icon as IconName} size={18} />
              <span className="font-semibold text-[14.5px] leading-[1.4] text-txt-strong">
                {kind.name}
              </span>
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}
