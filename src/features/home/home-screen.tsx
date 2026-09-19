"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AppBar,
  Body,
  Icon,
  Panel,
  Rows,
  SecTitle,
  Toast,
  type IconName,
} from "@/components/ui";
import { useOnboarding } from "@/features/onboarding/onboarding-state";
import { setPendingCount, useNegotiation } from "@/features/roles/negotiation-state";
import { applyMyChoices, unresolvedClashes, wantersOf } from "@/features/roles/roster-model";
import { useMeeting } from "@/features/schedule/meeting-state";
import { useTasks } from "@/features/tasks/tasks-state";
import type { AiTool, Member, RecentItem, Role, Task, Team } from "@/lib/types";

/** 홈에 세로로 쌓이는 "확인이 필요한 일" 한 줄. */
type Todo = {
  key: string;
  icon: IconName;
  /** 아이콘 칩의 면·글자 색. */
  surface: string;
  title: string;
  note: string;
  href: string;
};

/**
 * 11 홈.
 *
 * 순서가 곧 설계다: **내 확인이 필요한 일 → 가까운 일정 → 최근 자료·업무 → AI 도구**.
 * 팀플에서 가장 자주 놓치는 것이 "나를 기다리는 일"이라 맨 위에 둔다.
 *
 * 맨 위 두 구역은 데모 값이 아니라 07·09 화면의 **실제 상태에서 계산한다** —
 * 홈에 2건이라고 적혀 있는데 팀 탭에 가면 다른 수가 보이면 안 된다.
 */
export function HomeScreen({
  team,
  roles,
  roster,
  recent,
  aiTools,
  tasks: tasksFromServer,
}: {
  team: Team;
  roles: Role[];
  roster: Member[];
  recent: RecentItem[];
  aiTools: AiTool[];
  tasks: Task[];
}) {
  const router = useRouter();
  const onboarding = useOnboarding();
  const { resolutions } = useNegotiation();
  const { stage, slot } = useMeeting();
  const tasks = useTasks(tasksFromServer);

  /** "3건 남음" 같은 문구는 실제 목록에서 센다 — 고정값이면 금방 사실과 어긋난다. */
  const remainingTasks = tasks.filter((t) => t.status !== "done").length;

  const [toast, setToast] = useState<string | null>(null);

  const notReady = (what: string) => {
    setToast(`${what}은 아직 준비 중입니다`);
    window.setTimeout(() => setToast(null), 2400);
  };

  const members = useMemo(
    () =>
      applyMyChoices(roster, {
        name: onboarding.name,
        mbti: onboarding.effectiveMbti,
        want: onboarding.want,
        veto: onboarding.veto,
      }),
    [roster, onboarding.name, onboarding.effectiveMbti, onboarding.want, onboarding.veto],
  );

  const clashes = useMemo(
    () => unresolvedClashes(roles, members, resolutions),
    [roles, members, resolutions],
  );

  // 홈이 "1건"이라고 적어 놓고 팀 탭 배지는 비어 있으면 안 된다.
  // 07 화면과 같은 계산이라 어느 쪽을 먼저 열어도 같은 값이 된다.
  useEffect(() => {
    setPendingCount(clashes.length);
  }, [clashes.length]);

  const todos = useMemo<Todo[]>(() => {
    const list: Todo[] = [];

    if (clashes.length > 0) {
      const [first] = clashes;
      list.push({
        key: "roles",
        icon: "hand",
        surface: "bg-coral-100 text-coral-700",
        title: "역할 제안 확인",
        note:
          clashes.length === 1
            ? `${first.name} · ${wantersOf(members, first.key).length}명 겹침`
            : `${first.name} 외 ${clashes.length - 1}건 겹침`,
        href: "/team",
      });
    }

    if (stage === "proposed" && slot) {
      list.push({
        key: "meeting",
        icon: "calendar-clock",
        surface: "bg-yellow-200 text-yellow-700",
        title: `${slot.day}요일 회의 제안에 응답`,
        note: "제안 대기 중 · 응답 마감까지",
        href: "/schedule/slots",
      });
    }

    return list;
  }, [clashes, members, stage, slot]);

  return (
    <>
      <AppBar
        tone="y"
        title={team.name}
        sub={team.dday ?? undefined}
        action="bell"
        actionLabel="알림"
        onAction={() => notReady("알림")}
      />

      <Body dense>
        <SecTitle
          note={
            todos.length > 0
              ? `${todos.length}건이 처리를 기다리고 있습니다`
              : "지금 확인할 일이 없습니다"
          }
        >
          내 확인이 필요한 일
        </SecTitle>

        {todos.length > 0 ? (
          <Rows className="mb-[18px]">
            {todos.map((todo) => (
              <button
                key={todo.key}
                type="button"
                onClick={() => router.push(todo.href)}
                className="box-border flex min-h-[56px] w-full cursor-pointer items-center gap-3 border-none bg-transparent px-[15px] py-3.5 text-left"
              >
                <span
                  className={`grid size-[38px] flex-none place-items-center rounded-xl ${todo.surface}`}
                >
                  <Icon name={todo.icon} size={19} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="t-body-strong keep-all block text-txt-strong">{todo.title}</span>
                  <span className="keep-all mt-0.5 block font-medium text-[13px] leading-[1.45] text-txt-muted">
                    {todo.note}
                  </span>
                </span>
                <span className="flex-none text-txt-muted">
                  <Icon name="chevron-right" size={17} />
                </span>
              </button>
            ))}
          </Rows>
        ) : (
          <Panel s="fill" pad={16} className="mb-[18px]">
            <p className="t-note keep-all m-0 text-center text-txt-muted">
              모두 확인했습니다. 새로 생기면 여기에 표시됩니다.
            </p>
          </Panel>
        )}

        <SecTitle note="응답이 확정되면 여기 표시가 바뀝니다">가까운 일정</SecTitle>
        <UpcomingMeeting
          stage={stage}
          day={slot?.day ?? null}
          time={slot?.time ?? null}
          total={team.memberCount}
          onOpen={() => router.push("/schedule/slots")}
        />

        <SecTitle note="드라이브에서 방금 바뀐 것">최근 자료·업무</SecTitle>
        <Rows className="mb-[18px]">
          {recent.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => (item.href ? router.push(item.href) : notReady(item.title))}
              className="box-border flex min-h-[52px] w-full cursor-pointer items-center gap-3 border-none bg-transparent px-[15px] py-[13px] text-left"
            >
              <span className="grid size-[34px] flex-none place-items-center rounded-[11px] bg-fill text-txt-muted">
                <Icon name={item.icon as IconName} size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="keep-all block font-semibold text-[14.5px] leading-[1.4] text-txt-strong">
                  {item.title}
                </span>
                <span className="keep-all mt-0.5 block font-medium text-[13px] leading-[1.45] text-txt-muted">
                  {item.id === "r2" ? `${remainingTasks}건 남음` : item.note}
                </span>
              </span>
              <span className="flex-none text-txt-muted">
                <Icon name="chevron-right" size={16} />
              </span>
            </button>
          ))}
        </Rows>

        <SecTitle
          note="채팅·일정·팀 탭에는 없는 자리"
          action="전체 보기"
          onAction={() => router.push("/tools")}
        >
          AI 도구 바로가기
        </SecTitle>
        <div className="flex flex-wrap gap-2">
          {aiTools.slice(0, 4).map((tool) => (
            <button
              key={tool.key}
              type="button"
              onClick={() => (tool.href ? router.push(tool.href) : notReady(tool.name))}
              className="flex min-h-[68px] flex-[1_1_100px] cursor-pointer flex-col items-start gap-1.5 rounded-2xl border border-line bg-card px-3 py-2.5"
            >
              <Icon name={tool.icon as IconName} size={17} className="text-info" />
              <span className="keep-all font-bold text-[12.5px] leading-[1.3] text-txt-strong">
                {tool.name}
              </span>
            </button>
          ))}
        </div>
      </Body>

      <Toast msg={toast} />
    </>
  );
}

/** 가까운 회의 한 칸 — 09/10 화면의 제안 상태를 그대로 비춘다. */
function UpcomingMeeting({
  stage,
  day,
  time,
  total,
  onOpen,
}: {
  stage: "idle" | "proposed" | "confirmed" | "carried";
  day: string | null;
  time: string | null;
  total: number;
  onOpen: () => void;
}) {
  const content =
    stage === "proposed" && day && time
      ? { title: `${day}요일 ${time}`, note: `제안 대기 중 · 동의 1명 / 미응답 ${total - 1}명` }
      : stage === "confirmed" && day && time
        ? { title: `${day}요일 ${time}`, note: "확정 · 60분" }
        : stage === "carried"
          ? { title: "다음 주로 이월했습니다", note: "이번 주 회의는 열리지 않습니다" }
          : { title: "아직 정해진 회의가 없습니다", note: "후보를 골라 팀에 제안해 보세요" };

  return (
    <Panel s="fill" pad={14} r={16} className="mb-[18px]" onClick={onOpen}>
      <div className="flex items-center gap-2.5">
        <span className="flex-none text-txt-muted">
          <Icon name="calendar-clock" size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="keep-all block font-bold text-[14.5px] leading-[1.4] text-txt-strong">
            {content.title}
          </span>
          <span className="keep-all mt-0.5 block font-medium text-[12.5px] leading-[1.4] text-txt-muted">
            {content.note}
          </span>
        </span>
        <span className="flex-none text-txt-muted">
          <Icon name="chevron-right" size={16} />
        </span>
      </div>
    </Panel>
  );
}
