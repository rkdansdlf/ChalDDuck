"use client";

import { useRouter } from "next/navigation";
import { Suspense, use } from "react";
import { Rows, SecTitle, Skeleton, type IconName } from "@/components/ui";
import type { RecentItem, Task } from "@/lib/types";
import { TASKS_RECENT_ID } from "@/lib/types";
import { HomeRow } from "./home-row";

/**
 * 최근 자료·업무 — "필요할 때 꺼내 쓰는 것".
 *
 * 왼쪽(내 확인이 필요한 일)은 지금 나를 기다리는 것이라 먼저 그려야 하지만, 이쪽은 늦게
 * 와도 된다. 그래서 최근 목록을 서버가 **await 하지 않고 Promise 로 내려보내** 이 구역만
 * 따로 스트리밍한다 — 가장 느린 읽기 하나가 홈 전체를 붙잡지 않는다.
 * `tasks` 는 다른 곳에서도 쓰므로 다시 읽지 않고 이미 받은 값을 쓴다.
 */
export function HomeSide({ recent, tasks }: { recent: Promise<RecentItem[]>; tasks: Task[] }) {
  return (
    <Suspense fallback={<HomeSideSkeleton />}>
      <HomeSideContent recent={recent} tasks={tasks} />
    </Suspense>
  );
}

function HomeSideContent({ recent: recentPromise, tasks }: { recent: Promise<RecentItem[]>; tasks: Task[] }) {
  const router = useRouter();
  const recent = use(recentPromise);

  /** "3건 남음" 같은 문구는 실제 목록에서 센다 — 고정값이면 금방 사실과 어긋난다. */
  const remainingTasks = tasks.filter((t) => t.status !== "done").length;

  return (
    <>
      <SecTitle>최근 자료·업무</SecTitle>
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
    </div>
  );
}
