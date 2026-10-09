"use client";

import { useRouter } from "next/navigation";
import { Suspense, use, useMemo } from "react";
import { Rows, SecTitle, Skeleton, type IconName } from "@/components/ui";
import type { AiTool, RecentItem, RoleKey, Task } from "@/lib/types";
import { TASKS_RECENT_ID } from "@/lib/types";
import { suggestTools, type ToolSuggestion } from "./briefing";
import { HomeRow } from "./home-row";
import { AiToolTile } from "./home-parts";

type BoxDeadlines = Array<{ role: RoleKey; name: string; dueAt: string | null }>;

/**
 * 오른쪽 기둥 — "필요할 때 꺼내 쓰는 것"(최근 자료·업무, AI 도구).
 *
 * 왼쪽(내 확인이 필요한 일)은 지금 나를 기다리는 것이라 먼저 그려야 하지만, 이쪽은 늦게
 * 와도 된다. 그래서 세 조회를 서버가 **await 하지 않고 Promise 로 내려보내** 이 기둥만
 * 따로 스트리밍한다 — 가장 느린 읽기 하나가 홈 전체를 붙잡지 않는다.
 * `tasks` 는 왼쪽도 쓰므로 다시 읽지 않고 이미 받은 값을 쓴다.
 */
export function HomeSide({
  recent,
  aiTools,
  boxDeadlines,
  tasks,
  today,
}: {
  recent: Promise<RecentItem[]>;
  aiTools: Promise<AiTool[]>;
  boxDeadlines: Promise<BoxDeadlines>;
  tasks: Task[];
  today: string;
}) {
  return (
    <Suspense fallback={<HomeSideSkeleton />}>
      <HomeSideContent
        recent={recent}
        aiTools={aiTools}
        boxDeadlines={boxDeadlines}
        tasks={tasks}
        today={today}
      />
    </Suspense>
  );
}

function HomeSideContent({
  recent: recentPromise,
  aiTools: aiToolsPromise,
  boxDeadlines: boxDeadlinesPromise,
  tasks,
  today,
}: {
  recent: Promise<RecentItem[]>;
  aiTools: Promise<AiTool[]>;
  boxDeadlines: Promise<BoxDeadlines>;
  tasks: Task[];
  today: string;
}) {
  const router = useRouter();
  const recent = use(recentPromise);
  const aiTools = use(aiToolsPromise);
  const boxDeadlines = use(boxDeadlinesPromise);

  /** "3건 남음" 같은 문구는 실제 목록에서 센다 — 고정값이면 금방 사실과 어긋난다. */
  const remainingTasks = tasks.filter((t) => t.status !== "done").length;

  /**
   * 도구 추천 — **규칙으로만.** 규칙이 하나도 맞지 않으면 기존 정적 칩으로 되돌린다.
   * 도구는 언제 쓸 수 있으므로 빈 추천 칸을 보여 주는 것은 도구 목록을 감춘 것이다.
   */
  const suggestions = useMemo<ToolSuggestion[]>(
    () => suggestTools({ tasks, today, boxes: boxDeadlines }),
    [tasks, today, boxDeadlines],
  );

  return (
    <>
      <SecTitle note="드라이브에서 방금 바뀐 것">최근 자료·업무</SecTitle>
      <Rows className="mb-[18px]">
        {recent.map((item) => (
          <HomeRow
            key={item.id}
            icon={item.icon as IconName}
            title={item.title}
            note={item.id === TASKS_RECENT_ID ? `${remainingTasks}건 남음` : item.note}
            onOpen={() => router.push(item.href)}
          />
        ))}
      </Rows>

      <SecTitle
        note={suggestions.length > 0 ? "지금 팀 상황에 맞는 것" : "팀플에 필요한 만큼만"}
        action={`전체 ${aiTools.length}개`}
        onAction={() => router.push("/tools")}
      >
        {suggestions.length > 0 ? "지금 쓸 도구" : "AI 도구"}
      </SecTitle>
      {/*
        추천이 있으면 그것을 먼저 보여 주고, **원래 목록으로 되돌린다.**
        도구 다섯 개를 잘라 보여 주던 것을 네 개로 줄인 것이 아니다 — 도구는 언제나 쓸 수
        있으므로 목록이 줄면 그만큼 **찾기 어려워진다.** 그래서 "전체 N개" 로 몇 개가 더
        있는지 말한다.
      */}
      {suggestions.length > 0 ? (
        <Rows s="yellow" className="mb-2">
          {suggestions.map((s) => (
            <HomeRow
              key={s.key}
              size="lg"
              icon={s.icon}
              surface="bg-coral-100 text-coral-700"
              title={s.toolName}
              note={s.because}
              onOpen={() => router.push(s.href)}
            />
          ))}
        </Rows>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        {aiTools
          .filter((tool): tool is typeof tool & { href: string } => tool.href !== null)
          .slice(0, suggestions.length > 0 ? 2 : 4)
          .map((tool) => (
            <AiToolTile
              key={tool.key}
              icon={tool.icon as IconName}
              name={tool.name}
              note={tool.note}
              onOpen={() => router.push(tool.href)}
            />
          ))}
      </div>
    </>
  );
}

/** 스트리밍 중 자리를 지키는 뼈대 — 도착했을 때 레이아웃이 밀리지 않게 실제 높이와 맞춘다. */
function HomeSideSkeleton() {
  return (
    <div aria-hidden>
      <Skeleton className="mb-3 h-5 w-32" />
      <div className="mb-[18px] flex flex-col gap-2">
        <Skeleton className="h-[52px] w-full rounded-2xl" />
        <Skeleton className="h-[52px] w-full rounded-2xl" />
      </div>
      <Skeleton className="mb-3 h-5 w-28" />
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-[92px] rounded-2xl" />
        <Skeleton className="h-[92px] rounded-2xl" />
        <Skeleton className="h-[92px] rounded-2xl" />
        <Skeleton className="h-[92px] rounded-2xl" />
      </div>
    </div>
  );
}
