"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Icon, Panel, type IconName } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { BriefingLine } from "./briefing";

/**
 * "오늘의 브리핑" 한 장.
 *
 * ## **아무 말도 없으면 그리지 않는다**
 *
 * 할 일이 없는 팀에 "오늘 다 괜찮아요" 라는 빈 상자를 띄우면 그게 잡음이 된다 — 그리고 그
 * 상태를 사용자가 "앱이 뭔가 말 안 하네" 로 오해한다. 위 "내 확인이 필요한 일" 의 빈 상태
 * 패널이 이미 그 자리를 하고 있다. **두 곳에 "괜찮아요" 를 쓰지 않는다.**
 *
 * ## 숫자를 여기서 만들지 않는다
 *
 * `lines` 는 `briefing.ts` 가 만든 **문자열**이고, 이 컴포넌트는 그것을 그릴 뿐이다.
 * 개수를 다시 세지 않는 이유는 그 숫자의 근거가 화면 안에 갇히면 안 되기 때문이다.
 */
export function BriefingCard({ lines, onOpen }: { lines: BriefingLine[]; onOpen: (href: string) => void }) {
  if (lines.length === 0) return null;
  const urgent = lines.filter((line) => line.tone === "warn").length;

  return (
    <Panel s="cream" pad={14} r={18} className="heroCard mb-[18px]">
      <div className="mb-2.5 flex items-baseline gap-2">
        <span className="t-cap-strong keep-all font-bold text-txt-strong">오늘의 브리핑</span>
        {/* "확인이 필요한 일이 N건" 을 다시 쓰지 않는다 — 카드가 이미 그걸 말하고 있다. */}
        <span className="keep-all flex items-center gap-1.5 font-medium text-[12px] text-txt-muted">
          {urgent > 0 ? (
            <>
              <span className="relative flex size-2 items-center justify-center">
                <span className="size-1.5 rounded-full bg-amber-500" />
                <span className="heroPulse absolute inset-0 rounded-full text-amber-500" />
              </span>
              <span>
                오늘 확인할 것 <strong className="font-bold text-amber-700">{urgent}가지</strong>
              </span>
            </>
          ) : (
            "오늘은 조용합니다"
          )}
        </span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {lines.map((line) => {
          const isWarn = line.tone === "warn";
          return (
            <li key={line.key}>
              <button
                type="button"
                onClick={() => onOpen(line.href)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2.5 rounded-xl border-none bg-transparent px-1 py-1.5 text-left select-none",
                  "transition-colors duration-150 hover:bg-cr-50 active:scale-[0.99]",
                )}
              >
                <span
                  className={cn(
                    "relative grid size-[26px] flex-none place-items-center rounded-lg",
                    isWarn ? "bg-yellow-200 text-yellow-700" : "bg-fill text-txt-muted",
                  )}
                >
                  {isWarn ? (
                    <span className="heroPulse absolute inset-0 rounded-lg text-yellow-500 pointer-events-none" />
                  ) : null}
                  <Icon name={line.icon} size={14} className="relative z-1" />
                </span>
                <span className="keep-all min-w-0 flex-1 font-medium text-[13.5px] leading-[1.45] text-txt-strong">
                  {line.text}
                </span>
                <Icon name="chevron-right" size={15} className="flex-none text-txt-muted" />
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/** 홈 "바로가기" 한 칸. `surface` 는 아이콘 칩의 면·글자 색(`Todo.surface` 와 같은 규칙). */
export type HomeShortcut = {
  key: string;
  icon: IconName;
  label: string;
  href: string;
  surface: string;
  /** 0 이거나 없으면 배지를 그리지 않는다. 숫자는 호출한 쪽이 실제 목록에서 센 값이다. */
  badge?: number;
};

/**
 * 홈의 바로가기 네 칸 — 자주 가는 곳으로 바로 들어가는 자리.
 *
 * AI 도구는 전용 탭이 없고 여기서만 들어간다(도구 목록은 `/tools`).
 */
export function HomeShortcuts({ items, onOpen }: { items: HomeShortcut[]; onOpen: (href: string) => void }) {
  return (
    <div className="mb-[18px] grid grid-cols-4 gap-2">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onOpen(item.href)}
          className="flex min-h-11 cursor-pointer flex-col items-center gap-[7px] border-none bg-transparent py-1 select-none"
        >
          <span
            className={cn(
              "relative grid size-14 place-items-center rounded-[18px] transition-transform duration-150 hover:scale-105",
              item.surface,
            )}
          >
            <Icon name={item.icon} size={24} />
            {item.badge ? (
              <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-coral-400 px-[5px] font-bold text-[12px] leading-none text-ink-900">
                {item.badge}
              </span>
            ) : null}
          </span>
          <span className="keep-all font-semibold text-[13px] leading-[1.3] text-txt-strong">{item.label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * "내 확인이 필요한 일"을 만드는 몫들을 한 줄로.
 *
 * 목록의 네 줄(겹친 역할·회의 응답·기여 확인·승인 대기)은 내비게이션 배지가 30초마다
 * 이미 세고 있는 것과 같은 것이다. 그래서 홈을 위해 따로 묻지 않고, 배지가 세어 온
 * 몫과 이 화면이 그려질 때의 몫을 **견주기만** 한다.
 */
export function homeFingerprint(parts: {
  clashes: number;
  consent: number;
  cal: number;
  contribAwaitingMe: number;
  approvals: number;
}): string {
  // **`consent` 를 빼면 목록이 따라오지 않는다.** 동의는 알림으로 오고 배지도 오르지만,
  // 지문이 같으면 새로 안 받으므로 목록에 "추첨 제안에 응답"이 뜨지 않는다.
  return `${parts.clashes}:${parts.consent}:${parts.cal}:${parts.contribAwaitingMe}:${parts.approvals}`;
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
export function useRefreshWhenStale(rendered: string, polled: string | null) {
  const router = useRouter();
  const refreshedFor = useRef<string | null>(null);

  useEffect(() => {
    if (polled === null || polled === rendered) return;
    if (refreshedFor.current === polled) return;
    refreshedFor.current = polled;
    router.refresh();
  }, [rendered, polled, router]);
}

/**
 * 가까운 회의 한 칸 — 09/10 화면의 제안 상태를 그대로 비춘다.
 *
 * 요일과 시간이 정해진 회의(제안·확정)는 요일 칩으로 보여 주고, 제안 중이면 동의 현황을 점으로 함께 둔다.
 * 아직 정해지지 않은 상태는 칩 없이 한 줄로 말한다.
 */
export function UpcomingMeeting({
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
  const isActionable = stage === "proposed" || (stage === "confirmed" && Boolean(day && time));
  const scheduled = (stage === "proposed" || stage === "confirmed") && Boolean(day && time);
  const content =
    stage === "proposed" && day && time
      ? { title: `${day}요일 ${time}`, note: `제안 대기 중 · 동의 ${agreed}명 / 미응답 ${pending}명` }
      : stage === "confirmed" && day && time
        ? { title: `${day}요일 ${time}`, note: "확정 · 60분" }
        : stage === "carried"
          ? { title: "다음 주로 이월했습니다", note: "이번 주 회의는 열리지 않습니다" }
          : { title: "아직 정해진 회의가 없습니다", note: "후보를 골라 팀에 제안해 보세요" };

  return (
    <Panel
      s={scheduled ? "card" : "fill"}
      pad={14}
      r={20}
      className={cn("heroCard mb-[18px] flex items-center gap-3.5", isActionable && "cursor-pointer")}
      onClick={onOpen}
    >
      {scheduled ? (
        <span className="w-14 flex-none rounded-[14px] bg-yellow-100 py-2 text-center">
          <span className="block font-extrabold text-[20px] leading-[1.25] text-txt-strong">{day}</span>
          <span className="block font-semibold text-[12px] leading-[1.2] text-yellow-700">요일</span>
        </span>
      ) : (
        <span className="relative flex-none text-txt-muted">
          {stage === "proposed" ? (
            <span className="heroPulse absolute -inset-1 rounded-full text-yellow-500 pointer-events-none" />
          ) : null}
          <Icon name="calendar-clock" size={17} className="relative z-1" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="keep-all block font-bold text-[15px] leading-[1.4] text-txt-strong">
          {scheduled ? time : content.title}
        </span>
        <span className="mt-1 flex items-center gap-2">
          {stage === "proposed" && scheduled ? (
            <span className="flex flex-none gap-1" aria-hidden>
              {Array.from({ length: agreed }, (_, i) => (
                <span key={`ok-${i}`} className="size-2.5 rounded-full bg-ok" />
              ))}
              {Array.from({ length: pending }, (_, i) => (
                <span key={`off-${i}`} className="size-2.5 rounded-full bg-cr-200" />
              ))}
            </span>
          ) : null}
          <span className="keep-all min-w-0 font-medium text-[12.5px] leading-[1.4] text-txt-muted">
            {content.note}
          </span>
        </span>
      </span>
      <span className="flex-none text-txt-muted">
        <Icon name="chevron-right" size={16} />
      </span>
    </Panel>
  );
}
