"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { AppBar, Body, Panel, Rows, SecTitle, type IconName } from "@/components/ui";
import { useNavBadges } from "@/components/nav-badges-store";
import { useOnboarding } from "@/features/onboarding/onboarding-state";
import {
  applyMyChoices,
  rolesAwaitingMyConsent,
  unresolvedClashes,
  wantersOf,
} from "@/features/roles/roster-model";
import { buildBriefing } from "./briefing";
import { HomeRow } from "./home-row";
import { HomeSide } from "./home-side";
import {
  BriefingCard,
  UpcomingMeeting,
  homeFingerprint,
  useRefreshWhenStale,
} from "./home-parts";
import type {
  AiTool,
  MeetingProposal,
  Member,
  RecentItem,
  Role,
  RoleKey,
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
  now: nowIso,
  meeting,
  boxDeadlines,
  today,
  rejoinRequests,
  awaitingMyConfirm,
  unreadNotifications,
}: {
  team: Team;
  roles: Role[];
  roster: Member[];
  /** 오른쪽 기둥 데이터는 Promise 로 받는다 — `HomeSide` 가 Suspense 안에서 읽는다. */
  recent: Promise<RecentItem[]>;
  aiTools: Promise<AiTool[]>;
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
  /**
   * 제출함의 역할과 마감 시각만(파일·버전 없음). **마감 임박 추천에 쓴다.**
   * 홈이 12번째 조회를 얻는 값인데, 이게 없으면 "발표 임박 → 발표 지원" 추천이 영영
   * 나오지 않습니다 — 팀 발표일 필드가 없어서(스키마에 없다) 제출함 마감을 쓴 것입니다.
   */
  boxDeadlines: Promise<Array<{ role: RoleKey; name: string; dueAt: string | null }>>;
  /** 한국 날짜(`YYYY-MM-DD`). **서버가 정한다** — 화면이 자기 시계로 맞추면 사람마다 다르다. */
  today: string;
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
        {/* 오늘의 브리핑이 맨 위다 — "내 확인이 필요한 일" 보다 먼저.
            아래 목록은 **내가** 해야 하는 것이고, 이 카드는 **우리 팀 전체**가 지금 어디인지다.
            내 것만 보면 팀이 어딘가에서 밀리고 있다는 사실을 모른다. */}
        <BriefingCard lines={briefing} onOpen={(href) => router.push(href)} />
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
          <HomeSide
            recent={recent}
            aiTools={aiTools}
            boxDeadlines={boxDeadlines}
            tasks={tasks}
            today={today}
          />
        </div>
        </div>
      </Body>

    </>
  );
}
