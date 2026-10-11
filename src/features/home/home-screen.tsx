"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AppBar, Body, Btn, Panel, Rows, SecTitle, type IconName } from "@/components/ui";
import { useNavBadges } from "@/components/nav-badges-store";
import { useOnboarding } from "@/features/onboarding/onboarding-state";
import {
  applyMyChoices,
  rolesAwaitingMyConsent,
  unresolvedClashes,
  wantersOf,
} from "@/features/roles/roster-model";
import { BirthSheet } from "@/features/saju/birth-sheet";
import { TodayFlowCard } from "@/features/saju/today-flow-card";
import type { TeamSaju } from "@/data/api";
import { buildBriefing } from "./briefing";
import { HomeRow } from "./home-row";
import { HomeSide } from "./home-side";
import {
  BriefingCard,
  HomeShortcuts,
  UpcomingMeeting,
  homeFingerprint,
  useRefreshWhenStale,
  type HomeShortcut,
} from "./home-parts";
import type {
  MeetingProposal,
  Member,
  RecentItem,
  Role,
  RoleNegotiation,
  Task,
  Team,
} from "@/lib/types";

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
 * 순서가 곧 설계다(v3 핸드오프): **지금 할 일 → 다음 일정 → 바로가기 → 최근 자료·업무**.
 * 팀플에서 가장 자주 놓치는 것이 "나를 기다리는 일"이라 맨 위에 둔다. 오늘의 브리핑과
 * 오늘의 팀플 흐름은 맨 아래에 둔다 — 빼지 않고, 위의 할 일을 가리지 않게 하려는 자리다.
 *
 * 맨 위 두 구역은 데모 값이 아니라 07·09 화면의 **실제 상태에서 계산한다** —
 * 홈에 2건이라고 적혀 있는데 팀 탭에 가면 다른 수가 보이면 안 된다.
 */
export function HomeScreen({
  team,
  roles,
  roster,
  recent,
  tasks,
  negotiation,
  now: nowIso,
  meeting,
  today,
  rejoinRequests,
  awaitingMyConfirm,
  unreadNotifications,
  saju,
}: {
  team: Team;
  roles: Role[];
  roster: Member[];
  /** 최근 목록은 Promise 로 받는다 — `HomeSide` 가 Suspense 안에서 읽는다. */
  recent: Promise<RecentItem[]>;
  tasks: Task[];
  negotiation: RoleNegotiation;
  /**
   * 서버가 이 화면을 그릴 때의 시각(ISO).
   *
   * 동의 대기는 `respondBy` 와 "지금"을 비교해 정한다. 클라이언트가 다시 재면 서버가 그린
   * 것과 다른 그림이 그려진다(하이드레이션 불일치) — 시각은 읽는 곳에서 한 번만 정한다.
   */
  now: string;
  meeting: MeetingProposal;
  /** 한국 날짜(`YYYY-MM-DD`). **서버가 정한다** — 화면이 자기 시계로 맞추면 사람마다 다르다. */
  today: string;
  /** 팀장이 승인해 줘야 하는 요청 수(가입 + 재입장). 팀장이 아니면 0. */
  rejoinRequests: number;
  /** 내가 확인해 줘야 하는 팀원의 기여 기록 수. */
  awaitingMyConfirm: number;
  /** 안 읽은 알림 수. 종에 붙는다. */
  unreadNotifications: number;
  /** 팀 사주 — 오늘의 팀플 흐름에 쓴다. 조회에 실패하면 `null`(카드를 그리지 않는다). */
  saju: TeamSaju | null;
}) {
  const router = useRouter();
  const onboarding = useOnboarding();
  const [showBirthSheet, setShowBirthSheet] = useState(false);
  const { stage, slot } = meeting;

  // 종은 내비게이션 배지와 **같은 값**을 본다 — 탭바에 "새 알림"이 떠 있는데 종은
  // 비어 있으면 어느 쪽을 믿어야 할지 알 수 없다. 아직 다시 세기 전이면 서버가 준 값.
  const polled = useNavBadges();
  const unread = polled?.notifications ?? unreadNotifications;

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

  const now = useMemo(() => new Date(nowIso), [nowIso]);

  // 07 화면·탭 배지와 같은 함수로 센다 — 어느 쪽을 먼저 열어도 같은 값이어야 한다.
  const clashes = useMemo(
    () => unresolvedClashes(roles, members, negotiation.draws, negotiation.consents, now),
    [roles, members, negotiation.draws, negotiation.consents, now],
  );

  /** 내가 응답해야 하는 추첨 동의 — 배지의 `parts.consent` 와 같은 조건이어야 한다. */
  const myConsents = useMemo(
    () => rolesAwaitingMyConsent(negotiation.consents, now),
    [negotiation.consents, now],
  );


  useRefreshWhenStale(
    // 이 화면이 그려질 때의 몫. **서버가 준 값으로만** 센다 — 온보딩 중 로컬에 남은
    // 선택을 얹은 `members` 로 세면 서버의 몫과 영영 맞지 않을 수 있다.
    homeFingerprint({
      clashes: unresolvedClashes(roles, roster, negotiation.draws, negotiation.consents, now).length,
      consent: myConsents.length,
      cal: meeting.stage === "proposed" && meeting.myResponse === null ? 1 : 0,
      contribAwaitingMe: awaitingMyConfirm,
      approvals: rejoinRequests,
    }),
    polled
      ? homeFingerprint({
          clashes: polled.parts.clashes,
          consent: polled.parts.consent,
          cal: polled.cal,
          contribAwaitingMe: polled.parts.contribAwaitingMe,
          approvals: polled.parts.approvals,
        })
      : null,
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

    // **동의 대기를 "역할 제안 확인" 에 몰아 넣지 않는다.** 거기서 할 일은 이야기지 동의가
    // 아니다 — 다음 행동을 잘못 안내하면 팀원이 엉뚱한 자리에서 답을 찾는다. 배지의
    // `parts.consent` 와 같은 조건이라야 배지와 목록이 어긋나지 않는다.
    if (myConsents.length > 0) {
      const [firstKey] = myConsents;
      const firstConsent = negotiation.consents[firstKey];
      list.push({
        key: "consent",
        icon: "users-round",
        surface: "bg-yellow-200 text-yellow-700",
        title: "추첨 제안에 응답",
        note:
          myConsents.length === 1
            ? `${roles.find((r) => r.key === firstKey)?.name ?? "역할"} · ${firstConsent?.tool ?? "추첨"} · 응답 마감 ${firstConsent?.respondBy ?? ""}`
            : `${roles.find((r) => r.key === firstKey)?.name ?? "역할"} 외 ${myConsents.length - 1}건 응답 대기`,
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
  }, [
    clashes,
    members,
    roles,
    myConsents,
    negotiation.consents,
    stage,
    slot,
    meeting.respondBy,
    meeting.myResponse,
    rejoinRequests,
    awaitingMyConfirm,
  ]);

  /**
   * "오늘의 브리핑" — **있던 숫자로 만든다.** 계산과 세는 기준은 `briefing.ts` 다.
   *
   * 여기서 다시 세지 않는다. 화면이 개수를 세면 그 숫자는 화면 안에만 존재해서
   * "왜 3건이냐" 를 물을 때 답할 곳이 없어진다 — 그리고 질문이 사라지면 규칙도 사라진다.
   */
  // `awaitingMe: 0` — "확인이 필요한 일 N건" 은 바로 아래 목록이 이미 말한다. 같은 건수를
  // 카드와 목록에서 두 번 읽게 하지 않는다. 카드는 팀 전체 상황(회의·마감·독촉)만 맡는다.
  const briefing = useMemo(
    () => buildBriefing({ today, awaitingMe: 0, meeting, tasks }),
    [today, meeting, tasks],
  );
  // 브리핑은 두 줄만 — 나머지는 아래 목록과 일정이 이미 보여 준다.
  const briefingLines = briefing.slice(0, 2);

  // 지금 할 일의 맨 위 한 건은 크게 보여 주고, 나머지는 아래 줄로 둔다.
  const [hero, ...restTodos] = todos;

  // 바로가기의 "할 일" 배지 — 최근 목록과 같은 기준(완료가 아닌 것)으로 센다.
  const remainingTasks = tasks.filter((t) => t.status !== "done").length;
  const shortcuts: HomeShortcut[] = [
    { key: "drive", icon: "folder-open", label: "제출함", href: "/drive", surface: "bg-yellow-200 text-yellow-700" },
    {
      key: "tasks",
      icon: "list-checks",
      label: "할 일",
      href: "/home/tasks",
      surface: "bg-coral-100 text-coral-700",
      badge: remainingTasks,
    },
    { key: "chat", icon: "messages-square", label: "단톡방", href: "/chat", surface: "bg-fill text-txt-muted" },
    { key: "ai", icon: "sparkles", label: "AI 도구", href: "/tools", surface: "bg-fill text-txt-muted" },
  ];

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
        {/* 넓은 화면은 두 기둥 — 왼쪽은 "지금 나를 기다리는 것", 오른쪽은 "꺼내 쓰는 것". */}
        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-6">
          <div>
            <SecTitle>내 확인이 필요한 일</SecTitle>

            <div className="mb-[18px]">
              {hero ? (
                <div className="rounded-[22px] bg-action p-[18px]">
                  <div className="keep-all font-bold text-[20px] leading-[1.4] tracking-[-0.02em] text-on-action">
                    {hero.title}
                  </div>
                  <div className="keep-all mt-0.5 font-medium text-[14px] leading-[1.5] text-cr-200">
                    {hero.note}
                  </div>
                  <div className="mt-3.5">
                    <Btn v="yellow" full iconRight="arrow-right" onClick={() => router.push(hero.href)}>
                      확인하기
                    </Btn>
                  </div>
                </div>
              ) : (
                <Panel s="fill" pad={16}>
                  <p className="t-note keep-all m-0 text-center text-txt-muted">
                    모두 확인했습니다. 새로 생기면 여기에 표시됩니다.
                  </p>
                </Panel>
              )}

              {restTodos.length > 0 ? (
                <Rows className="mt-2.5">
                  {restTodos.map((todo) => (
                    <HomeRow
                      key={todo.key}
                      size="lg"
                      icon={todo.icon}
                      surface={todo.surface}
                      title={todo.title}
                      note={todo.note}
                      onOpen={() => router.push(todo.href)}
                    />
                  ))}
                </Rows>
              ) : null}
            </div>

            <SecTitle action="캘린더" onAction={() => router.push("/schedule/calendar")}>
              다음 일정
            </SecTitle>
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
            <SecTitle>바로가기</SecTitle>
            <HomeShortcuts items={shortcuts} onOpen={(href) => router.push(href)} />
            <HomeSide recent={recent} tasks={tasks} />
          </div>
        </div>

        {/* 브리핑과 팀플 흐름은 맨 아래 — 위의 할 일과 일정을 가리지 않게. */}
        <div className="mt-2">
          <BriefingCard lines={briefingLines} onOpen={(href) => router.push(href)} />
          <TodayFlowCard
            saju={saju}
            today={today}
            meetingToday={briefing.some((l) => l.key === "meeting")}
            dueSoon={briefing.some((l) => l.key === "soon")}
            onOpen={(href) => router.push(href)}
            onRegisterSaju={() => setShowBirthSheet(true)}
          />
        </div>
      </Body>

      {showBirthSheet ? <BirthSheet onClose={() => setShowBirthSheet(false)} /> : null}
    </>
  );
}
