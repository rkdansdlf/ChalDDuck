"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import {
  AppBar,
  Body,
  Icon,
  Panel,
  Rows,
  SecTitle,
  type IconName,
} from "@/components/ui";
import { useNavBadges } from "@/components/nav-badges-store";
import { useOnboarding } from "@/features/onboarding/onboarding-state";
import { applyMyChoices, unresolvedClashes, wantersOf } from "@/features/roles/roster-model";
import type {
  AiTool,
  MeetingProposal,
  Member,
  RecentItem,
  Role,
  RoleNegotiation,
  Task,
  Team,
} from "@/lib/types";
import { TASKS_RECENT_ID } from "@/lib/types";

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
  tasks,
  negotiation,
  meeting,
  rejoinRequests,
  awaitingMyConfirm,
  unreadNotifications,
}: {
  team: Team;
  roles: Role[];
  roster: Member[];
  recent: RecentItem[];
  aiTools: AiTool[];
  tasks: Task[];
  negotiation: RoleNegotiation;
  meeting: MeetingProposal;
  /** 팀장이 승인해 줘야 하는 요청 수(가입 + 재입장). 팀장이 아니면 0. */
  rejoinRequests: number;
  /** 내가 확인해 줘야 하는 팀원의 기여 기록 수. */
  awaitingMyConfirm: number;
  /** 안 읽은 알림 수. 종에 붙는다. */
  unreadNotifications: number;
}) {
  const router = useRouter();
  const onboarding = useOnboarding();
  const { stage, slot } = meeting;

  // 종은 내비게이션 배지와 **같은 값**을 본다 — 탭바에 "새 알림"이 떠 있는데 종은
  // 비어 있으면 어느 쪽을 믿어야 할지 알 수 없다. 아직 다시 세기 전이면 서버가 준 값.
  const polled = useNavBadges();
  const unread = polled?.notifications ?? unreadNotifications;

  useRefreshWhenStale(
    // 이 화면이 그려질 때의 몫. **서버가 준 값으로만** 센다 — 온보딩 중 로컬에 남은
    // 선택을 얹은 `members` 로 세면 서버의 몫과 영영 맞지 않을 수 있다.
    homeFingerprint({
      clashes: unresolvedClashes(roles, roster, negotiation.draws).length,
      cal: meeting.stage === "proposed" && meeting.myResponse === null ? 1 : 0,
      contribAwaitingMe: awaitingMyConfirm,
      approvals: rejoinRequests,
    }),
    polled
      ? homeFingerprint({
          clashes: polled.parts.clashes,
          cal: polled.cal,
          contribAwaitingMe: polled.parts.contribAwaitingMe,
          approvals: polled.parts.approvals,
        })
      : null,
  );

  /** "3건 남음" 같은 문구는 실제 목록에서 센다 — 고정값이면 금방 사실과 어긋난다. */
  const remainingTasks = tasks.filter((t) => t.status !== "done").length;

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

  // 07 화면·탭 배지와 같은 함수로 센다 — 어느 쪽을 먼저 열어도 같은 값이어야 한다.
  const clashes = useMemo(
    () => unresolvedClashes(roles, members, negotiation.draws),
    [roles, members, negotiation.draws],
  );

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

    // 아직 내가 답하지 않은 제안만 "내 할 일"이다 — 일정 탭 배지와 같은 조건이어야
    // 배지는 0인데 홈은 1건이라고 말하는 어긋남이 생기지 않는다.
    if (stage === "proposed" && slot && meeting.myResponse === null) {
      list.push({
        key: "meeting",
        icon: "calendar-clock",
        surface: "bg-yellow-200 text-yellow-700",
        title: `${slot.day}요일 회의 제안에 응답`,
        note: `제안 대기 중 · 응답 마감 ${meeting.respondBy}`,
        href: "/schedule/slots",
      });
    }

    if (awaitingMyConfirm > 0) {
      list.push({
        key: "contrib",
        icon: "list-checks",
        surface: "bg-yellow-200 text-yellow-700",
        title: "팀원 기록 확인",
        note: `${awaitingMyConfirm}건이 내 확인을 기다립니다`,
        href: "/team/contrib/members",
      });
    }

    // 팀장에게만 온다. 남이 내 이름으로 들어오려는 것일 수 있어 맨 위에 둘 만한 일이다.
    if (rejoinRequests > 0) {
      list.push({
        key: "rejoin",
        icon: "user-search",
        surface: "bg-coral-100 text-coral-700",
        title: "들어오려는 사람 확인",
        note:
          rejoinRequests === 1
            ? "1명이 팀에 들어오려 합니다"
            : `${rejoinRequests}명이 팀에 들어오려 합니다`,
        href: "/team/access",
      });
    }

    return list;
  }, [clashes, members, stage, slot, meeting.respondBy, meeting.myResponse, rejoinRequests, awaitingMyConfirm]);

  return (
    <>
      <AppBar
        tone="y"
        title={team.name}
        sub={team.dday ?? undefined}
        action="bell"
        actionLabel={unread > 0 ? `알림 ${unread}건` : "알림"}
        actionBadge={unread || undefined}
        onAction={() => router.push("/home/notifications")}
      />

      <Body dense>
        {/* 넓은 화면에서는 두 기둥으로 나눈다 — 한 기둥이면 오른쪽이 통째로 빈다.
            왼쪽은 "지금 나를 기다리는 것", 오른쪽은 "필요할 때 꺼내 쓰는 것". */}
        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-6">
        <div>
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
          agreed={meeting.agreed}
          pending={meeting.pending}
          onOpen={() => router.push("/schedule/slots")}
        />

        </div>

        <div>
        <SecTitle note="드라이브에서 방금 바뀐 것">최근 자료·업무</SecTitle>
        <Rows className="mb-[18px]">
          {recent.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => router.push(item.href)}
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
                  {item.id === TASKS_RECENT_ID ? `${remainingTasks}건 남음` : item.note}
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
          {/* 열 수 있는 도구만 바로가기에 둔다 — 누르면 "준비 중"만 뜨는 칸은 자리만 차지한다. */}
          {aiTools
            .filter((tool): tool is typeof tool & { href: string } => tool.ready && tool.href !== null)
            .slice(0, 4)
            .map((tool) => (
              <button
                key={tool.key}
                type="button"
                onClick={() => router.push(tool.href)}
                className="flex min-h-[68px] flex-[1_1_100px] cursor-pointer flex-col items-start gap-1.5 rounded-2xl border border-line bg-card px-3 py-2.5"
              >
                <Icon name={tool.icon as IconName} size={17} className="text-info" />
                <span className="keep-all font-bold text-[12.5px] leading-[1.3] text-txt-strong">
                  {tool.name}
                </span>
              </button>
            ))}
        </div>
        </div>
        </div>
      </Body>

    </>
  );
}

/**
 * "내 확인이 필요한 일"을 만드는 몫들을 한 줄로.
 *
 * 목록의 네 줄(겹친 역할·회의 응답·기여 확인·승인 대기)은 내비게이션 배지가 30초마다
 * 이미 세고 있는 것과 같은 것이다. 그래서 홈을 위해 따로 묻지 않고, 배지가 세어 온
 * 몫과 이 화면이 그려질 때의 몫을 **견주기만** 한다.
 */
function homeFingerprint(parts: {
  clashes: number;
  cal: number;
  contribAwaitingMe: number;
  approvals: number;
}): string {
  return `${parts.clashes}:${parts.cal}:${parts.contribAwaitingMe}:${parts.approvals}`;
}

/**
 * 홈이 그려진 뒤로 목록의 몫이 바뀌었으면 한 번 새로 받아 온다.
 *
 * 왜 필요한가: 배지와 종은 스스로 따라오는데 목록은 서버가 그린 그대로라, 종에
 * "알림 1건"이 떠서 홈을 봐도 "지금 확인할 일이 없습니다"가 남아 있었다. 배지가
 * 가리키는 곳에 갔는데 아무것도 없으면 배지를 믿지 않게 된다.
 *
 * **바뀌었을 때만** 부른다. 아무 일 없는 동안에는 추가 요청이 0이다 — 주기적으로
 * `router.refresh()` 를 걸면 홈의 읽기 11개가 그 주기마다 돈다.
 *
 * 같은 값으로는 두 번 부르지 않는다. 새로 받아 왔는데도 몫이 맞지 않으면(두 쪽의 세는
 * 조건이 어긋난 경우) 30초마다 새로고침이 이어지는데, 그건 고칠 대상이지 반복할 일이 아니다.
 */
function useRefreshWhenStale(rendered: string, polled: string | null) {
  const router = useRouter();
  const refreshedFor = useRef<string | null>(null);

  useEffect(() => {
    if (polled === null || polled === rendered) return;
    if (refreshedFor.current === polled) return;
    refreshedFor.current = polled;
    router.refresh();
  }, [rendered, polled, router]);
}

/** 가까운 회의 한 칸 — 09/10 화면의 제안 상태를 그대로 비춘다. */
function UpcomingMeeting({
  stage,
  day,
  time,
  agreed,
  pending,
  onOpen,
}: {
  stage: "idle" | "proposed" | "confirmed" | "carried";
  day: string | null;
  time: string | null;
  agreed: number;
  pending: number;
  onOpen: () => void;
}) {
  const content =
    stage === "proposed" && day && time
      ? { title: `${day}요일 ${time}`, note: `제안 대기 중 · 동의 ${agreed}명 / 미응답 ${pending}명` }
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
