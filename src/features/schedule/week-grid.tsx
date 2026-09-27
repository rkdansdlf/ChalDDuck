"use client";

import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { BusyBlock } from "@/lib/types";
import { blockAt } from "./busy-blocks";
import type { MeetingCell } from "./meeting-cell";
import type { ReasonLook } from "./reason";

/**
 * 격자의 열. 시간 열은 "18" 이 들어가는 만큼만(20px) 두고 나머지를 요일에 준다 — 7열이면
 * 375px 화면에서 칸이 약 42px 이다. 높이는 44px 을 지킨다.
 */
const GRID_COLUMNS = (days: number) => `20px repeat(${days},minmax(0,1fr))`;

/** 요일 머리글 색. 달력 관례대로 토요일은 파랑, 일요일은 빨강 — 글자(토·일)가 함께 있어 색에만 기대지 않는다. */
function dayTone(day: number) {
  return day === 5 ? "text-info" : day === 6 ? "text-coral-700" : "text-txt-muted";
}

/**
 * 확정·제안된 회의를 칸 위에 얹는다.
 *
 * **빈칸 위에 겹쳐 그리는 요소**라 블록(안 되는 시간)보다 위에 올린다 — 회의 시간에
 * "안 되는 시간"을 적어 둔 경우 둘 다 보여야 하기 때문이다. 그래서 08 에서도 칸 버튼이
 * 아니라 이 요소를 겹친다(칸 버튼에 테두리를 그리면 블록에 가려진다).
 *
 * 기다리는 중(`proposed`)과 정해진(`confirmed`)을 **점선/실선**으로 나눈다 — 이 화면은
 * 이미 "이 주만" 블록을 점선으로 그린다. 색이 아니라 선으로 구분하고, 아이콘과 아래 한 줄
 * 설명이 함께 있으므로 어느 쪽인지 색 없이도 읽힌다.
 */
function MeetingMarkCell({ cell }: { cell: MeetingCell | null }) {
  if (!cell) return null;
  const settled = cell.stage === "confirmed";

  return (
    <span
      // 그림일 뿐이다 — 아래 한 줄 설명이 글로 말해 주고, 칸 누르기는 그대로 칠하기로 남아 있어야 한다.
      aria-hidden
      className={cn(
        "pointer-events-none relative z-30 rounded-md transition-all",
        settled
          ? "ring-2 ring-ink-900 ring-inset"
          : "outline-2 outline-dashed outline-ink-900 -outline-offset-2 animate-pulse-subtle",
      )}
      style={{ gridRow: cell.hour + 2, gridColumn: cell.day + 2 }}
    >
      {/* 칸이 약 42px 라 단어는 못 넣고 아이콘만 둔다. 말은 격자 아래 한 줄에 쓴다. */}
      <span
        className={cn(
          "absolute top-0.5 right-0.5 grid size-4 place-items-center rounded-[5px] bg-card text-ink-900 ring-1 ring-line",
          settled ? "animate-pop" : "animate-pulse-subtle",
        )}
      >
        <Icon name={settled ? "calendar-check" : "clock"} size={11} />
      </span>
    </span>
  );
}

/**
 * 칠하기 손 동작이 **격자 전체**에 붙는 것들.
 *
 * 칸마다 붙는 손(누르기, 누른 채 끄기)은 `WeekGrid` 가 직접 다룬다. 여기 있는 것은
 * 포인터가 격자 어디로 가도 받아야 하는 것뿐이다 — 마우스는 칸 밖으로 나가도 칠하기가
 * 계속되어야 하고, 길게 눌렀을 때 뜨는 브라우저 메뉴가 끄기를 가로막으면 안 되기
 * 때문이다. 칠하지 않는 화면(팀 겹쳐보기)은 이 묶음을 아예 주지 않는다.
 */
type GridPaint = {
  ref: RefObject<HTMLDivElement | null>;
  onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: () => void;
  onContextMenu: (e: ReactMouseEvent<HTMLDivElement>) => void;
};

/**
 * 주간 격자의 **틀** — 열과 행, 요일 머리글, 시각 열, 회의 표식.
 *
 * 08(내 시간표)과 팀 겹쳐보기가 같은 주간 격자를 그린다. 달라지는 것은 칸에 무엇을
 * 그리는지뿐이다(안 되는 시간을 칠한다 / 그 시간에 되는 사람 수). 그래서 틀은 여기
 * 하나에 두고 **칸 내용은 두 종류로 갈라 그린다**(`WeekGrid`, `CountGrid`) — 마크업을
 * 손으로 두 번 적어 두면 열이 늘거나 칸 높이가 바뀔 때 한쪽만 고쳐져 두 화면의
 * 시간표가 어긋난다.
 *
 * 칸은 그리는 순서와 상관없이 제자리에 놓인다(`GridCell` 가 자리를 박는다) — 회의
 * 표식과 블록이 칸 위로 겹쳐 올라오기 때문에 칸이 자리를 지켜야 그 둘이 지킬 곳이
 * 생긴다.
 */
export function GridShell({
  days,
  dayNotes,
  hours,
  mark,
  paint,
  children,
}: {
  days: string[];
  /** 요일 아래 작은 글씨 — 보고 있는 주의 날짜("9/28"). */
  dayNotes?: string[];
  hours: string[];
  /** 확정·제안된 회의가 있는 칸. 없으면 그리지 않는다. */
  mark?: MeetingCell | null;
  /** 칠하기 손 동작. 칠하지 않는 화면은 주지 않는다. */
  paint?: GridPaint;
  /** 칸들. `GridCell` 로 자리를 맞춘다. */
  children?: ReactNode;
}) {
  return (
    <div
      ref={paint?.ref}
      onPointerMove={paint?.onPointerMove}
      onPointerUp={paint?.onPointerUp}
      onPointerCancel={paint?.onPointerCancel}
      onContextMenu={paint?.onContextMenu}
      className={cn("grid gap-[2px]", paint && "select-none [-webkit-touch-callout:none]")}
      style={{
        gridTemplateColumns: GRID_COLUMNS(days.length),
        gridTemplateRows: `auto repeat(${hours.length},44px)`,
      }}
    >
      <span />
      {days.map((day, i) => (
        <span
          key={day}
          className={cn("pb-1.5 text-center font-bold text-[13px] leading-none", dayTone(i))}
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

      {children}

      {/* 회의 표식. 칸과 블록보다 위에 올려야 "회의 시간에 안 되는 시간을 적어 둔" 경우에도 둘 다 보인다. */}
      <MeetingMarkCell cell={mark ?? null} />
    </div>
  );
}

/**
 * 칸 하나. **자리는 여기서만 정한다** — 모서리·여백과 `gridRow`/`gridColumn` 을 한 곳에
 * 두면 칸을 그리는 두 화면의 크기가 어긋나지 않는다.
 *
 * 칸 위에 겹쳐 그리는 것(블록, 회의 표식)과 달리 `position` 과 `z` 는 두는 쪽이 정한다.
 */
export function GridCell({
  day,
  hour,
  className,
  style,
  ...rest
}: { day: number; hour: number } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      data-cell=""
      data-day={day}
      data-hour={hour}
      className={cn("rounded-md border-none p-0", className)}
      style={{ gridRow: hour + 2, gridColumn: day + 2, ...style }}
    />
  );
}

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
 * 칸 높이는 모든 폭에서 44px 이다(최소 탭 영역). 10시간 × 44px 이라 좁은 화면에서도 한 번
 * 스크롤이면 다 보인다. 폭은 주말까지 7열이라 375px 에서 약 42px 이다.
 */
export function WeekGrid({
  days,
  dayNotes,
  hours,
  blocks,
  mark,
  lookFor,
  paintLook,
  onPaint,
  onEdit,
}: {
  days: string[];
  dayNotes?: string[];
  hours: string[];
  blocks: BusyBlock[];
  /** 확정·제안된 회의가 있는 칸. 없으면 그리지 않는다. */
  mark?: MeetingCell | null;
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

  const onContextMenu = (e: ReactMouseEvent<HTMLDivElement>) => {
    // 길게 누르면 뜨는 OS 메뉴가 칠하기를 가로막는다.
    if (dragRef.current || pressRef.current) e.preventDefault();
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
    <GridShell
      days={days}
      dayNotes={dayNotes}
      hours={hours}
      mark={mark}
      paint={{
        ref: gridRef,
        onPointerMove,
        onPointerUp,
        onPointerCancel,
        onContextMenu,
      }}
    >
      {/* 빈 칸. 블록이 덮은 칸도 그려 두되 블록이 위에 올라간다. */}
      {days.map((day, dayIndex) =>
        hours.map((hour, hourIndex) => {
          const covered = Boolean(blockAt(blocks, dayIndex, hourIndex));
          const painting = inDrag(dayIndex, hourIndex);
          return (
            <GridCell
              key={`${day}-${hour}`}
              day={dayIndex}
              hour={hourIndex}
              tabIndex={covered ? -1 : 0}
              aria-hidden={covered || undefined}
              aria-label={`${day} ${hour}시 — 안 되는 시간으로 표시`}
              onPointerDown={(e) => onCellPointerDown(e, dayIndex, hourIndex)}
              onClick={() => onCellClick(dayIndex, hourIndex)}
              className={cn(
                "cursor-pointer transition-colors duration-150 hover:brightness-95 active:scale-[0.98]",
                painting && "relative z-20 ring-2 ring-ink-900 ring-inset",
              )}
              style={{ background: painting ? paintLook.background : "var(--cr-100)" }}
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
              "relative flex cursor-pointer items-start justify-center overflow-hidden rounded-md border-none p-[3px] transition-transform duration-150 hover:brightness-95 active:scale-[0.98]",
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
            {/* 좁은 화면의 칸(약 42px)에 "아르바이트"가 한 줄로 안 들어간다 — 말줄임 대신 줄을 접는다. */}
            <span
              className={cn(
                "t-grid-tag max-w-full break-all rounded-[4px] bg-card px-0.5 py-0.5 text-center text-txt-strong",
                // 1시간짜리 블록(44px)은 두 줄, 더 긴 블록은 세 줄까지.
                block.hours > 1 ? "line-clamp-3" : "line-clamp-2",
              )}
            >
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
    </GridShell>
  );
}

/**
 * 팀 겹쳐보기의 주간 격자 — **칸 내용 두 번째**로, 칸마다 그 시간에 되는 사람 수를 적는다.
 *
 * 같은 틀(`GridShell`) 위에 칠하지 않는다 — 누르면 그 칸에 누가 되는지 보는 것이지
 * 시간을 표시하는 것이 아니기 때문이다. 그래서 칠하기 손 동작도, 사유도, 블록도 없다.
 * 몇 명인지·진하기·칸 설명은 팀 화면이 정한다(`cell`) — 세는 방법은 그 화면에만 있다.
 */
export function CountGrid({
  days,
  dayNotes,
  hours,
  mark,
  cell,
  onOpen,
}: {
  days: string[];
  dayNotes?: string[];
  hours: string[];
  mark?: MeetingCell | null;
  /** 칸에 적을 숫자, 그 진하기(배경·글자색), 스크린리더가 읽을 설명. */
  cell: (day: number, hour: number) => {
    count: number;
    level: { bg: string; text: string };
    label: string;
  };
  /** 칸을 누르면 그 시간에 누가 되는지 본다. */
  onOpen: (day: number, hour: number) => void;
}) {
  return (
    <GridShell days={days} dayNotes={dayNotes} hours={hours} mark={mark}>
      {days.map((day, dayIndex) =>
        hours.map((hour, hourIndex) => {
          const { count, level, label } = cell(dayIndex, hourIndex);
          return (
            <GridCell
              key={`${day}-${hour}`}
              day={dayIndex}
              hour={hourIndex}
              aria-label={label}
              onClick={() => onOpen(dayIndex, hourIndex)}
              className={cn(
                "relative grid cursor-pointer place-items-center font-mono font-bold text-[13px] leading-none",
                level.text,
              )}
              style={{ background: level.bg }}
            >
              {count}
            </GridCell>
          );
        }),
      )}
    </GridShell>
  );
}
