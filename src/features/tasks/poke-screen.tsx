"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AppBar,
  Avatar,
  Body,
  Btn,
  Chip,
  Dock,
  Note,
  Panel,
  SecTitle,
  Toast,
  Undecided,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Task } from "@/lib/types";
import { pokeTask, usePokedTasks, useTasks } from "./tasks-state";

/**
 * 24 익명 콕 찌르기.
 *
 * 다그치지 않고 슬쩍 알린다. 보낸 사람은 밝히지 않고, **업무당 하루 한 번만** 보낼 수 있다 —
 * 익명이면서 횟수 제한이 없으면 재촉이 괴롭힘이 된다.
 */
export function PokeScreen({ tasks: fromServer }: { tasks: Task[] }) {
  const router = useRouter();
  const tasks = useTasks(fromServer);
  const poked = usePokedTasks();

  const [selected, setSelected] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  /** 끝난 일과 담당자 없는 일은 찌를 대상이 아니다. */
  const targets = tasks.filter((t) => t.status !== "done" && t.assignee);
  const selectedTask = targets.find((t) => t.id === selected) ?? null;

  const send = () => {
    if (!selectedTask || poked.includes(selectedTask.id)) return;
    pokeTask(selectedTask.id);
    setSelected(null);
    setToast(`${selectedTask.assignee}님에게 익명으로 알렸습니다`);
    window.setTimeout(() => setToast(null), 2600);
  };

  return (
    <>
      <AppBar
        title="콕 찌르기"
        sub="담당자에게 조용히 알립니다"
        onBack={() => router.push("/home/tasks")}
      />

      <Body dense>
        <Note tone="info" icon="eye-off" className="mb-3.5">
          보낸 사람은 밝히지 않습니다. 받는 사람에게만 조용히 뜨고, 업무당 <b>하루 한 번</b>만 보낼 수
          있습니다.
        </Note>

        <SecTitle note="아직 끝나지 않은 업무만 보입니다">업무 고르기</SecTitle>

        {targets.length > 0 ? (
          <div role="radiogroup" aria-label="콕 찌를 업무" className="mb-4 flex flex-col gap-2">
            {targets.map((task) => {
              const on = selected === task.id;
              const already = poked.includes(task.id);
              return (
                <button
                  key={task.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={already}
                  onClick={() => setSelected(task.id)}
                  className={cn(
                    "box-border flex w-full items-center gap-[11px] rounded-2xl px-[15px] py-[13px] text-left",
                    on ? "border-[1.5px] border-yellow-500 bg-yellow-100" : "border-[1.5px] border-line bg-card",
                    already ? "cursor-default opacity-55" : "cursor-pointer",
                  )}
                >
                  <Avatar name={task.assignee ?? ""} mbti={task.mbti} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="keep-all block font-semibold text-[14.5px] leading-[1.4] text-txt-strong">
                      {task.title}
                    </span>
                    <span className="mt-0.5 block font-medium text-[13px] leading-[1.4] text-txt-muted">
                      {task.assignee} · {task.due} 마감
                    </span>
                  </span>
                  {already ? (
                    <Chip tone="ok" icon="check">
                      오늘 이미 보냈어요
                    </Chip>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : (
          <Panel s="fill" pad={16} className="mb-4">
            <p className="t-note keep-all m-0 text-center text-txt-muted">
              담당자가 정해진 미완료 업무가 없습니다.
            </p>
          </Panel>
        )}

        <Undecided>
          익명이 악용될 때(과도하게 자주 찌르기 등) 대응 방법은 기획안에 없어 다루지 않았습니다.
        </Undecided>
      </Body>

      <Dock>
        <Btn full size="lg" icon="bell" disabled={!selectedTask} onClick={send}>
          익명으로 콕 찌르기
        </Btn>
      </Dock>

      <Toast msg={toast} />
    </>
  );
}
