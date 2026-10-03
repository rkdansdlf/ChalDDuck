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
import { useAction } from "@/lib/use-action";
import { handOffToCushion } from "@/features/tools/cushion-handoff";
import { canOfferCushion, pokeRequestText } from "./poke-request";
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
  const { toast, busy, run } = useAction();
  const sending = busy.send === true;

  /**
   * 찌를 대상이 아닌 것을 화면에서 먼저 뺀다.
   *
   * - 끝난 일: 다시 재촉할 일이 아니다.
   * - 담당자 없는 일: 보낼 사람이 없다.
   * - **내가 맡은 일**: 서버가 막는다(`notify` 가 본인을recipient 에서 빼므로 알림은
   *   안 가는데, 예전에는 "알렸습니다"만 떴다).
   * - **팀을 나간 담당자**: 알림이 닿지 않는다 — 같은 이유로 거짓말이 된다.
   *
   * 서버도 같은 조건을 다시 확인한다. 여기서 걸러야 실패할 수 없는 버튼만 남는다.
   */
  const targets = tasks.filter(
    (t) => t.status !== "done" && t.assignee && !t.isMine && !t.assigneeLeft,
  );
  const selectedTask = targets.find((t) => t.id === selected) ?? null;
  /**
   * "다듬고 보내기" 로 넘길 문장.
   *
   * **만들 수 없으면 `null` 이고 버튼도 그리지 않는다.** 빈 문자열을 넘기면 쿠션 화면이
   * 빈 칸으로 열리고 사람은 "왜 아무것도 없어" 하고 돌아온다.
   *
   * ⚠️ **오늘 이미 보낸 일은 다시 권하지 않는다** — 같은 말을 두 번 다듬게 하면 한도가 두 번
   * 깎이고, 어차피 어제 알림을 받은 사람이니 의미가 없다.
   */
  const polishable =
    selectedTask &&
    canOfferCushion({
      assigneeName: selectedTask.assignee,
      title: selectedTask.title,
      alreadySent: poked.includes(selectedTask.id),
    })
      ? pokeRequestText({
          assigneeName: selectedTask.assignee ?? "",
          title: selectedTask.title,
          due: selectedTask.due,
        })
      : null;

  const send = async () => {
    if (!selectedTask || poked.includes(selectedTask.id)) return;
    await run(
      "send",
      async () => {
        const result = await pokeTask(selectedTask.id);
        setSelected(null);
        router.refresh();
        return result === "sent"
          ? `${selectedTask.assignee}님에게 알렸습니다`
          : "이 업무에는 오늘 이미 보냈습니다";
      },
      "알리지 못했습니다. 잠시 뒤 다시 눌러 주세요.",
    );
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
                    "box-border flex w-full items-center gap-[11px] rounded-2xl px-[15px] py-[13px] text-left select-none transition-all duration-200",
                    on
                      ? "border-[1.5px] border-yellow-500 bg-yellow-100 shadow-xs scale-[1.01] ring-2 ring-yellow-400/30"
                      : "border-[1.5px] border-line bg-card hover:bg-cr-50",
                    already ? "cursor-default opacity-55" : "cursor-pointer active:scale-[0.98]",
                  )}
                >
                  <div className={cn("flex-none transition-transform duration-200", on && "animate-poke")}>
                    <Avatar name={task.assignee ?? ""} mbti={task.mbti} size={34} />
                  </div>
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
        <Btn full size="lg" icon={sending ? "loader-circle" : "bell"} disabled={!selectedTask || sending} onClick={send}>
          {sending ? "보내는 중…" : "진행상황 물어보기 (콕 찌르기)"}
        </Btn>

        {/**
         * **다듬고 보내기** — 2단계-b.
         *
         * 여기로 오는 이유는 **사람이 말을 다듬어야 하는 자리**이기 때문이다. "진행상황
         * 물어보기" 는 정해 둔 문장을 그대로 보내고, 이쪽은 **요구하는 내용은 같고 말투만**
         * 바꾼다(쿠션 번역기의 대 원칙). **같은 내용을 담은 두 길**이라 다른 게 없어야 한다.
         *
         * ⚠️ **넘길 문장이 없으면 버튼을 그리지 않는다.** 빈 문자열을 넘기면 쿠션 화면이
         * 빈 칸으로 열리고 사람은 "왜 아무것도 없어" 하고 돌아온다. `pokeRequestText` 가
         * `null` 을 주는 것(담당자 없음·제목 없음·마감 미정)이 그 신호다.
         */}
        {polishable ? (
          <Btn
            full
            className="mt-2"
            v="outline"
            icon="message-square-heart"
            onClick={() => {
              handOffToCushion(polishable);
              router.push("/tools/cushion");
            }}
          >
            말투만 다듬고 보내기
          </Btn>
        ) : null}
      </Dock>

      <Toast msg={toast} />
    </>
  );
}
