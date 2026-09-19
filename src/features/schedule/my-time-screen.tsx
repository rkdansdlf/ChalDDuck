"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  AppBar,
  Body,
  Btn,
  Dock,
  Icon,
  Note,
  Panel,
  Rows,
  SecTitle,
  Toast,
  Undecided,
  type IconName,
} from "@/components/ui";
import { saveMyBusyBlocks } from "@/data/api";
import { cn } from "@/lib/cn";
import type { BusyBlock, BusyKind, BusyKindKey, Team } from "@/lib/types";

type View = "list" | "grid";

const VIEWS: Array<{ key: View; label: string; icon: IconName }> = [
  { key: "list", label: "목록으로 담기", icon: "list" },
  { key: "grid", label: "주간 격자", icon: "layout-grid" },
];

const LENGTHS = [1, 2, 3, 4];

let blockSeq = 0;
const nextBlockId = () => `local-${(blockSeq += 1)}`;

/**
 * 08 내 가능한 시간.
 *
 * 시간표는 **"안 되는 시간"만** 표시한다 — 표시하지 않은 시간은 가능한 시간이다.
 * 사유(수업·아르바이트·시험)는 본인 화면에만 보이고, 팀원에게는 가능/불가만 공유된다.
 *
 * 입력 방식이 두 가지인데 **목록형이 기본**이다. 좁은 화면(600px 미만)의 주간 격자는 칸이
 * 30px 이라 최소 탭 영역 44px 을 못 지키기 때문이다 — 그 폭에서 칸을 키우면 한 주가
 * 한눈에 안 들어와 격자를 둘 이유가 없어진다. 600px 부터는 칸이 44px 로 커져 예외가 사라진다.
 */
export function MyTimeScreen({
  team,
  kinds,
  days,
  hours,
  initialBlocks,
}: {
  team: Team;
  kinds: BusyKind[];
  days: string[];
  hours: string[];
  initialBlocks: BusyBlock[];
}) {
  const router = useRouter();

  const [view, setView] = useState<View>("list");
  const [kind, setKind] = useState<BusyKindKey>("class");
  const [blocks, setBlocks] = useState<BusyBlock[]>(initialBlocks);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 목록형에서 담을 항목
  const [pickDay, setPickDay] = useState(0);
  const [pickStart, setPickStart] = useState(1);
  const [pickLength, setPickLength] = useState(2);

  const kindOf = (key: BusyKindKey) => kinds.find((k) => k.key === key) ?? kinds[0];

  /** 요일·시간대 좌표를 덮고 있는 블록. */
  const blockAt = (day: number, hour: number) =>
    blocks.find((b) => b.day === day && hour >= b.startHour && hour < b.startHour + b.hours);

  const toggleCell = (day: number, hour: number) => {
    const found = blockAt(day, hour);
    if (found) {
      // 여러 시간짜리 블록의 가운데를 눌러도 블록 전체가 지워진다 —
      // 칸 단위로 쪼개면 목록형에서 본 것과 결과가 달라진다.
      setBlocks((prev) => prev.filter((b) => b.id !== found.id));
    } else {
      setBlocks((prev) => [...prev, { id: nextBlockId(), day, startHour: hour, hours: 1, kind }]);
    }
  };

  const addFromList = () => {
    setBlocks((prev) => [
      ...prev,
      { id: nextBlockId(), day: pickDay, startHour: pickStart, hours: pickLength, kind },
    ]);
    setToast(`${days[pickDay]} ${hours[pickStart]}시부터 ${pickLength}시간을 담았습니다`);
    window.setTimeout(() => setToast(null), 2000);
  };

  const removeBlock = (id: string) => setBlocks((prev) => prev.filter((b) => b.id !== id));

  /** 등록한 불가 시간의 총 칸 수. */
  const filled = useMemo(() => blocks.reduce((sum, b) => sum + b.hours, 0), [blocks]);

  /** 목록은 요일 → 시작 시간 순으로 보여야 읽힌다(등록 순서는 의미가 없다). */
  const sorted = useMemo(
    () => [...blocks].sort((a, b) => a.day - b.day || a.startHour - b.startHour),
    [blocks],
  );

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await saveMyBusyBlocks(team.id, blocks);
      router.push("/schedule/slots");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <AppBar title="내 시간표" sub="안 되는 시간만 표시" />
      <Body dense>
        <p className="text-pretty-keep m-0 mb-3 text-[14.5px] leading-[1.6] text-txt">
          <b>안 되는 시간</b>을 표시해 주세요. 표시하지 않은 시간은 가능한 시간으로 봅니다.
        </p>

        {/* 입력 방식 */}
        <div role="tablist" aria-label="입력 방식" className="mb-3 flex gap-1.5">
          {VIEWS.map((v) => {
            const on = view === v.key;
            return (
              <button
                key={v.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setView(v.key)}
                className={cn(
                  "inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl font-bold text-[13px] leading-none",
                  on
                    ? "border border-transparent bg-action text-on-action"
                    : "border border-line bg-card text-txt",
                )}
              >
                <Icon name={v.icon} size={14} />
                {v.label}
              </button>
            );
          })}
        </div>

        {/* 사유 */}
        <div
          role="radiogroup"
          aria-label="안 되는 이유"
          className="mb-3 flex gap-1.5 overflow-x-auto"
        >
          {kinds.map((k) => {
            const on = kind === k.key;
            return (
              <button
                key={k.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setKind(k.key)}
                className={cn(
                  "inline-flex min-h-11 flex-none cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-xl px-[13px] font-bold text-[13.5px] leading-none",
                  on
                    ? "border border-transparent bg-action text-on-action"
                    : "border border-line bg-card text-txt",
                )}
              >
                <span
                  className="size-[9px] flex-none rounded-[3px]"
                  style={{ background: on ? "var(--y-400)" : k.color }}
                />
                {k.name}
              </button>
            );
          })}
        </div>

        {view === "list" ? (
          <>
            <Panel s="card" pad={14} r={16} className="mb-3">
              <div className="t-cap-strong mb-2 font-bold text-txt-muted">요일 선택</div>
              <div role="radiogroup" aria-label="요일" className="mb-3 flex gap-[5px]">
                {days.map((day, i) => (
                  <button
                    key={day}
                    type="button"
                    role="radio"
                    aria-checked={pickDay === i}
                    onClick={() => setPickDay(i)}
                    className={cn(
                      "min-h-11 flex-1 cursor-pointer rounded-[10px] border-none font-bold text-[13px] leading-none",
                      pickDay === i ? "bg-yellow-400 text-ink-900" : "bg-fill text-txt",
                    )}
                  >
                    {day}
                  </button>
                ))}
              </div>

              <div className="t-cap-strong mb-2 font-bold text-txt-muted">시작 시간</div>
              <div role="radiogroup" aria-label="시작 시간" className="mb-3 flex gap-[5px] overflow-x-auto">
                {hours.map((hour, i) => (
                  <button
                    key={hour}
                    type="button"
                    role="radio"
                    aria-checked={pickStart === i}
                    onClick={() => setPickStart(i)}
                    className={cn(
                      "min-h-11 flex-none cursor-pointer rounded-[10px] border-none px-3 font-mono font-bold text-[13px] leading-none",
                      pickStart === i ? "bg-yellow-400 text-ink-900" : "bg-fill text-txt",
                    )}
                  >
                    {hour}시
                  </button>
                ))}
              </div>

              <div className="t-cap-strong mb-2 font-bold text-txt-muted">길이</div>
              <div role="radiogroup" aria-label="길이" className="flex gap-[5px]">
                {LENGTHS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={pickLength === n}
                    onClick={() => setPickLength(n)}
                    className={cn(
                      "min-h-11 flex-1 cursor-pointer rounded-[10px] border-none font-bold text-[13px] leading-none",
                      pickLength === n ? "bg-yellow-400 text-ink-900" : "bg-fill text-txt",
                    )}
                  >
                    {n}시간
                  </button>
                ))}
              </div>
            </Panel>

            <Btn full icon="plus" onClick={addFromList} className="mb-3.5">
              {days[pickDay]} {hours[pickStart]}시부터 {pickLength}시간 추가
            </Btn>

            <SecTitle note="눌러서 지울 수 있습니다">등록한 불가 시간 {blocks.length}건</SecTitle>
            {sorted.length > 0 ? (
              <Rows>
                {sorted.map((block) => {
                  const k = kindOf(block.kind);
                  const from = Number(hours[block.startHour]);
                  return (
                    <button
                      key={block.id}
                      type="button"
                      onClick={() => removeBlock(block.id)}
                      aria-label={`${days[block.day]} ${from}시부터 ${block.hours}시간 · ${k.name} 지우기`}
                      className="box-border flex min-h-12 w-full cursor-pointer items-center gap-2.5 border-none bg-transparent px-[15px] py-3 text-left"
                    >
                      <span
                        className="size-2.5 flex-none rounded-[3px]"
                        style={{ background: k.color }}
                      />
                      <span className="min-w-0 flex-1 font-semibold text-[14px] leading-[1.4] text-txt-strong">
                        {days[block.day]} {from}시~{from + block.hours}시 · {k.name}
                      </span>
                      <span className="flex-none text-txt-faint">
                        <Icon name="x" size={15} />
                      </span>
                    </button>
                  );
                })}
              </Rows>
            ) : (
              <Panel s="fill" pad={16}>
                <p className="t-note keep-all m-0 text-center text-txt-muted">
                  아직 등록한 시간이 없습니다. 모든 시간이 가능한 것으로 봅니다.
                </p>
              </Panel>
            )}
          </>
        ) : (
          <Panel s="card" pad={12} r={16} className="mb-3">
            <div
              className="grid gap-[3px]"
              style={{ gridTemplateColumns: "26px repeat(5,minmax(0,1fr))" }}
            >
              <span />
              {days.map((day) => (
                <span
                  key={day}
                  className="pb-1.5 text-center font-bold text-[13px] leading-none text-txt-muted"
                >
                  {day}
                </span>
              ))}

              {hours.map((hour, hourIndex) => (
                <div key={hour} className="contents">
                  <span className="pt-[9px] pr-1 text-right font-mono font-medium text-[11.5px] leading-none text-txt-faint">
                    {hour}
                  </span>
                  {days.map((day, dayIndex) => {
                    const block = blockAt(dayIndex, hourIndex);
                    return (
                      <button
                        key={`${day}-${hour}`}
                        type="button"
                        aria-pressed={Boolean(block)}
                        aria-label={`${day} ${hour}시 ${block ? `— ${kindOf(block.kind).name}, 지우기` : "— 안 되는 시간으로 표시"}`}
                        onClick={() => toggleCell(dayIndex, hourIndex)}
                        // 600px 부터는 칸을 44px 로 키워 최소 탭 영역을 지킨다.
                        // 좁은 화면에서만 30px 로 두는 이유는 그래야 한 주가 한 번에 보이기 때문이고,
                        // 그 대신 기본 입력 방식이 목록형이다.
                        className="h-[30px] cursor-pointer rounded-md border-none p-0 sm:h-11"
                        style={{ background: block ? kindOf(block.kind).color : "var(--cr-100)" }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* 범례 */}
        <div className="mt-3 mb-3 flex flex-wrap gap-1.5">
          {kinds.map((k) => (
            <span
              key={k.key}
              className="t-cap-strong inline-flex items-center gap-[5px] text-txt-muted"
            >
              <span className="size-2.5 rounded-[3px]" style={{ background: k.color }} />
              {k.name}
            </span>
          ))}
          <span className="t-cap-strong inline-flex items-center gap-[5px] text-txt-muted">
            <span className="size-2.5 rounded-[3px] border border-line bg-cr-100" />
            가능
          </span>
        </div>

        <Note tone="info" icon="users-round">
          팀원에게는 <b>가능 / 불가</b>만 보입니다. 수업명, 근무지, 시험 과목은 공유되지 않습니다.
        </Note>

        <Undecided>
          <b>목록으로 담기</b>를 기본 입력 방식으로 확정했습니다. 주간 격자는 <b>600px 미만에서만</b> 칸이
          30px 이라 최소 탭 영역 44px 을 못 지킵니다 — 그 폭에서 격자는 한눈에 보는 보조 수단이고,
          실제 입력은 목록형으로 합니다.
        </Undecided>
      </Body>

      <Dock>
        <Btn full size="lg" onClick={save} iconRight="arrow-right" disabled={saving}>
          {saving ? "저장 중…" : `${filled}칸 저장하고 회의 시간 보기`}
        </Btn>
      </Dock>

      <Toast msg={toast} />
    </>
  );
}
