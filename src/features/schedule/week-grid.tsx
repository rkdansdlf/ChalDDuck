"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { BusyBlock } from "@/lib/types";
import { blockAt } from "./busy-blocks";
import type { ReasonLook } from "./reason";

/** 손가락을 이만큼 누르고 있어야 칠하기가 시작된다. 그보다 짧게 움직이면 스크롤이다. */
const LONG_PRESS_MS = 320;
/** 누른 채 이보다 멀리 움직이면 칠하기가 아니라 스크롤로 본다. */
const MOVE_TOLERANCE = 8;

type Drag = { day: number; anchor: number; current: number };

/**
 * 08 내 시간표의 주간 격자.
 *
 * - 빈 칸을 **탭**하면 1시간이 들어간다. 맞닿은 같은 사유는 합쳐지므로 연달아 누르면 늘어난다.
 * - **끌면** 한 요일 안에서 여러 시간을 한 번에 칠한다. 마우스·펜은 바로, 터치는 길게 누른 뒤부터다 —
 *   격자가 화면 대부분을 덮어서, 터치로 바로 칠하게 하면 격자 위에서는 스크롤할 수 없다.
 * - 칠해진 블록을 누르면 `onEdit` — 바로 지우지 않는다. 잘못 눌러 지운 것은 되돌릴 방법이 없다.
 *
 * 칸은 모든 폭에서 44px 이다(최소 탭 영역). 10시간 × 44px 이라 좁은 화면에서도 한 번 스크롤이면 다 보인다.
 */
export function WeekGrid({
  days,
  dayNotes,
  hours,
  blocks,
  lookFor,
  paintLook,
  onPaint,
  onEdit,
}: {
  days: string[];
  /** 요일 아래 작은 글씨 — 보고 있는 주의 날짜("9/28"). */
  dayNotes?: string[];
  hours: string[];
  blocks: BusyBlock[];
  /** 블록의 이름·배경. 기본 사유와 직접 입력 사유가 같은 규칙으로 그려지도록 부르는 쪽이 넘긴다. */
  lookFor: (block: BusyBlock) => ReasonLook;
  /** 지금 칠할 사유의 모양 — 끄는 동안 미리 보여 준다. */
  paintLook: ReasonLook;
  /** 요일 하나의 [startHour, startHour + length) 를 칠한다. */
  onPaint: (day: number, startHour: number, length: number) => void;
  onEdit: (block: BusyBlock) => void;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  // 이벤트 처리기끼리 주고받는 값. 화면에 그리는 값(`drag`)과 따로 둔다.
  const dragRef = useRef<Drag | null>(null);
  const pressRef = useRef<{ timer: number; x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);

  const updateDrag = (next: Drag | null) => {
    dragRef.current = next;
    setDrag(next);
  };

  const clearPress = () => {
    if (pressRef.current) window.clearTimeout(pressRef.current.timer);
    pressRef.current = null;
  };

  // 칠하는 동안에는 페이지가 스크롤되면 안 된다. React 의 터치 처리기는 passive 라서
  // preventDefault 가 듣지 않으므로 직접 붙인다.
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      if (dragRef.current) e.preventDefault();
    };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, []);

  useEffect(() => clearPress, []);

  /** 포인터 아래의 칸 좌표. 칸이 아니면 null. */
  const cellFromPoint = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-cell]");
    if (!el || !gridRef.current?.contains(el)) return null;
    return { day: Number(el.dataset.day), hour: Number(el.dataset.hour) };
  };

  const onCellPointerDown = (e: ReactPointerEvent, day: number, hour: number) => {
    if (e.button !== 0) return;
    const start: Drag = { day, anchor: hour, current: hour };

    if (e.pointerType === "touch") {
      clearPress();
      pressRef.current = {
        x: e.clientX,
        y: e.clientY,
        timer: window.setTimeout(() => {
          pressRef.current = null;
          updateDrag(start);
        }, LONG_PRESS_MS),
      };
      return;
    }

    // 마우스는 누른 칸 밖으로 나가도 계속 받아야 한다.
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    updateDrag(start);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const press = pressRef.current;
    if (press) {
      // 길게 누르기 전에 움직였으면 스크롤하려는 것이다.
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_TOLERANCE) clearPress();
      return;
    }
    const current = dragRef.current;
    if (!current) return;
    // 버튼을 뗀 뒤의 움직임(격자 밖에서 뗀 경우 등)은 칠하기가 아니다.
    if (e.pointerType !== "touch" && e.buttons === 0) {
      updateDrag(null);
      return;
    }
    const cell = cellFromPoint(e.clientX, e.clientY);
    // 칠하기는 한 요일 안에서만 — 요일을 넘어가면 마지막 칸에 멈춘다.
    if (cell && cell.day === current.day && cell.hour !== current.current) {
      updateDrag({ ...current, current: cell.hour });
    }
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    clearPress();
    const current = dragRef.current;
    if (!current) return;
    updateDrag(null);

    // 마우스로 한 칸만 눌렀다 뗀 것은 탭이다 — 클릭 처리기에 맡긴다(키보드와 같은 길).
    if (e.pointerType !== "touch" && current.anchor === current.current) return;

    const from = Math.min(current.anchor, current.current);
    const to = Math.max(current.anchor, current.current);
    onPaint(current.day, from, to - from + 1);

    // 끈 뒤에 따라오는 click 이 한 칸을 또 칠하지 않게 한다.
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  };

  const onPointerCancel = () => {
    clearPress();
    updateDrag(null);
  };

  const onCellClick = (day: number, hour: number) => {
    if (suppressClickRef.current) return;
    onPaint(day, hour, 1);
  };

  const inDrag = (day: number, hour: number) =>
    drag !== null &&
    drag.day === day &&
    hour >= Math.min(drag.anchor, drag.current) &&
    hour <= Math.max(drag.anchor, drag.current);

  return (
    <div
      ref={gridRef}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={(e) => {
        // 길게 누르면 뜨는 OS 메뉴가 칠하기를 가로막는다.
        if (dragRef.current || pressRef.current) e.preventDefault();
      }}
      className="grid select-none gap-[3px] [-webkit-touch-callout:none]"
      style={{
        gridTemplateColumns: `26px repeat(${days.length},minmax(0,1fr))`,
        gridTemplateRows: `auto repeat(${hours.length},44px)`,
      }}
    >
      <span />
      {days.map((day, i) => (
        <span
          key={day}
          className="pb-1.5 text-center font-bold text-[13px] leading-none text-txt-muted"
        >
          {day}
          {dayNotes ? (
            <span className="mt-1 block font-mono font-medium text-[10.5px] text-txt-faint">
              {dayNotes[i]}
            </span>
          ) : null}
        </span>
      ))}

      {hours.map((hour, hourIndex) => (
        <span
          key={hour}
          className="pt-1 pr-1 text-right font-mono font-medium text-[11.5px] leading-none text-txt-faint"
          style={{ gridRow: hourIndex + 2, gridColumn: 1 }}
        >
          {hour}
        </span>
      ))}

      {/* 빈 칸. 블록이 덮은 칸도 그려 두되 블록이 위에 올라간다. */}
      {days.map((day, dayIndex) =>
        hours.map((hour, hourIndex) => {
          const covered = Boolean(blockAt(blocks, dayIndex, hourIndex));
          const painting = inDrag(dayIndex, hourIndex);
          return (
            <button
              key={`${day}-${hour}`}
              type="button"
              data-cell=""
              data-day={dayIndex}
              data-hour={hourIndex}
              tabIndex={covered ? -1 : 0}
              aria-hidden={covered || undefined}
              aria-label={`${day} ${hour}시 — 안 되는 시간으로 표시`}
              onPointerDown={(e) => onCellPointerDown(e, dayIndex, hourIndex)}
              onClick={() => onCellClick(dayIndex, hourIndex)}
              className={cn(
                "cursor-pointer rounded-md border-none p-0",
                painting && "relative z-20 ring-2 ring-ink-900 ring-inset",
              )}
              style={{
                gridRow: hourIndex + 2,
                gridColumn: dayIndex + 2,
                background: painting ? paintLook.background : "var(--cr-100)",
              }}
            />
          );
        }),
      )}

      {/* 칠해진 블록. 여러 시간이 한 덩어리로 보여야 목록과 같은 단위로 읽힌다.
          "이 주만" 블록은 매주 블록 위에 그린다(뒤에 그리고 z 를 한 칸 높인다). */}
      {[...blocks].sort((a, b) => Number(a.weekOf !== null) - Number(b.weekOf !== null)).map((block) => {
        const look = lookFor(block);
        const from = Number(hours[block.startHour]);
        const once = block.weekOf !== null;
        return (
          <button
            key={block.id}
            type="button"
            onPointerDown={(e) => {
              // 블록 위에서 시작한 끌기는 칠하기가 아니다 — 누르면 편집이다.
              e.stopPropagation();
            }}
            onClick={() => {
              if (suppressClickRef.current) return;
              onEdit(block);
            }}
            aria-label={`${days[block.day]} ${from}시부터 ${block.hours}시간 · ${look.name}${once ? " · 이 주만" : ""} — 고치기`}
            className={cn(
              "relative flex cursor-pointer items-start justify-center overflow-hidden rounded-md border-none p-1",
              // "이 주만"은 점선 테두리 + 달력 아이콘. 색만으로 매주/이 주만을 나누지 않는다.
              once ? "z-[11] outline-2 outline-ink-900 outline-dashed -outline-offset-2" : "z-10",
              // 칠하는 중에는 블록을 지나가도 아래 칸이 포인터를 받아야 한다(elementFromPoint).
              drag && "pointer-events-none",
            )}
            style={{
              gridRow: `${block.startHour + 2} / span ${block.hours}`,
              gridColumn: block.day + 2,
              background: look.background,
            }}
          >
            {/* 색만으로 사유를 구분하지 않는다 — 이름을 함께 둔다. 글자는 밝은 바탕 위에 올려 대비를 지킨다. */}
            {/* 좁은 화면의 칸(약 55px)에 "아르바이트"가 한 줄로 안 들어간다 — 말줄임 대신 두 줄로 접는다. */}
            <span className="t-cap-strong line-clamp-2 max-w-full break-all rounded-[5px] bg-card px-1 py-0.5 text-center text-txt-strong">
              {once ? (
                <span className="mr-0.5 inline-block align-[-1px]">
                  <Icon name="calendar-clock" size={10} />
                </span>
              ) : null}
              {look.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
