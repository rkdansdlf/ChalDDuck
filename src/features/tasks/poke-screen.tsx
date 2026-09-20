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
import { pokeTask } from "@/server/actions/tasks";

/**
 * 24 콕 찌르기 — 담당자에게 제출이나 진행상황을 요청한다.
 *
 * **보낸 사람을 밝힌다.** 누가 물었는지 알아야 답할 수 있고, 익명 재촉은 답할 곳 없는
 * 압박이 된다. 대신 **업무당 하루 한 번**으로 횟수를 막는다.
 */
export function PokeScreen({
  tasks,
  poked,
}: {
  tasks: Task[];
  /** 오늘 내가 이미 찌른 업무 id. 서버가 하루 단위로 센다. */
  poked: string[];
}) {
  const router = useRouter();

  const [selected, setSelected] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  /** 끝난 일과 담당자 없는 일은 찌를 대상이 아니다. */
  const targets = tasks.filter((t) => t.status !== "done" && t.assignee);
  const selectedTask = targets.find((t) => t.id === selected) ?? null;

  const send = async () => {
    if (!selectedTask || sending || poked.includes(selectedTask.id)) return;
    setSending(true);
    try {
      const result = await pokeTask(selectedTask.id);
      setSelected(null);
      router.refresh();
      flash(
        result === "sent"
          ? `${selectedTask.assignee}님에게 알렸습니다`
          : "이 업무에는 오늘 이미 보냈습니다",
      );
    } finally {
      setSending(false);
    }
  };

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  };

  return (
    <>
      <AppBar
        title="콕 찌르기"
        sub="담당자에게 진행상황을 묻습니다"
        onBack={() => router.push("/home/tasks")}
      />

      <Body dense>
        <Note tone="info" icon="bell" className="mb-3.5">
          담당자에게만 알림이 갑니다. <b>내 이름이 함께 갑니다</b> — 누가 물었는지 알아야 답할 수
          있기 때문입니다. 대신 업무당 <b>하루 한 번</b>만 보낼 수 있습니다.
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
          같은 사람에게 여러 업무로 하루에 몇 번까지 물어볼 수 있는지는 기획안에 없습니다. 지금은
          업무마다 하루 한 번이라, 업무가 많으면 여러 번 갈 수 있습니다.
        </Undecided>
      </Body>

      <Dock>
        <Btn full size="lg" icon="bell" disabled={!selectedTask || sending} onClick={send}>
          {sending ? "보내는 중" : "진행상황 물어보기"}
        </Btn>
      </Dock>

      <Toast msg={toast} />
    </>
  );
}
