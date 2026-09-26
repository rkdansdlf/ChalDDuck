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
  Sheet,
  Toast,
  Undecided,
} from "@/components/ui";
import { saveMyBusyBlocks } from "@/server/actions/schedule";
import { cn } from "@/lib/cn";
import type { BusyBlock, BusyKind, ScheduleWeek } from "@/lib/types";
import {
  blocksInWeek,
  blocksShape,
  customLabels,
  nextBlockId,
  placeBlock,
  sortBlocks,
} from "./busy-blocks";
import { lookOf, type Reason } from "./reason";
import { ReasonPicker } from "./reason-picker";
import { ScheduleTabs } from "./schedule-tabs";
import { dateOfDay } from "./week";
import { WeekGrid } from "./week-grid";
import { WeekPicker } from "./week-picker";

const LENGTHS = [1, 2, 3, 4];

type Repeat = "weekly" | "once";

/**
 * 사유마다 처음 골라 둘 반복 방식. 시험 기간은 끝나는 일정이라 "이 주만", 나머지는 매주.
 * 고른 뒤에는 사용자가 바꿀 수 있다 — 기본값일 뿐 규칙이 아니다.
 */
const DEFAULT_REPEAT: Record<string, Repeat> = { exam: "once" };

type Draft = Omit<BusyBlock, "id">;

/** 열려 있는 시트. 추가는 새 블록을, 편집은 고칠 블록의 id 를 갖는다. */
type Editing = { mode: "add"; draft: Draft } | { mode: "edit"; id: string; draft: Draft };

/**
 * 08 내 가능한 시간.
 *
 * 시간표는 **"안 되는 시간"만** 표시한다 — 표시하지 않은 시간은 가능한 시간이다.
 * 사유(수업·아르바이트·시험, 그리고 직접 입력한 사유)는 본인 화면에만 보이고,
 * 팀원에게는 가능/불가만 공유된다.
 *
 * **주간 격자가 기본**이다. 칸을 모든 폭에서 44px 로 키워 최소 탭 영역을 지키고,
 * 탭·끌기로 바로 칠한다. HANDOFF 08 의 "목록으로 담기"(작은 화면·확대 설정 대안)는
 * 토글 대신 `시간 추가` 시트로 옮겼다 — 요일 → 시간 → 길이 순서는 그대로이고,
 * 키보드·스크린리더도 이 길로 들어온다.
 *
 * 블록은 **매주** 반복하거나 **그 주에만** 있다. 격자는 한 번에 한 주를 보여 주고
 * (매주 + 그 주에만), 저장은 볼 수 있는 모든 주의 블록을 한꺼번에 한다.
 */
export function MyTimeScreen({
  kinds,
  customKind,
  days,
  hours,
  weeks,
  initialBlocks,
}: {
  kinds: BusyKind[];
  customKind: BusyKind;
  days: string[];
  hours: string[];
  /** 고를 수 있는 주. 첫 주가 기본. */
  weeks: ScheduleWeek[];
  initialBlocks: BusyBlock[];
}) {
  const router = useRouter();

  const [reason, setReason] = useState<Reason>({ kind: "class", label: null });
  const [repeat, setRepeat] = useState<Repeat>("weekly");
  const [week, setWeek] = useState(weeks[0].key);
  const [blocks, setBlocks] = useState<BusyBlock[]>(initialBlocks);
  // 방금 만들고 아직 칠하지 않은 사유 이름. 블록에 쓰이기 전에도 칩으로 남아 있어야 한다.
  const [newLabels, setNewLabels] = useState<string[]>([]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /** 칩 줄에 보일 내 사유 이름들 — 블록에 쓰인 것 + 방금 만든 것. */
  const labels = useMemo(
    () => [...new Set([...customLabels(blocks), ...newLabels])],
    [blocks, newLabels],
  );
  const look = (r: Reason) => lookOf(r, kinds, customKind);

  /** 사유를 고른다. 새로 만든 이름이면 칩 줄에 남긴다. */
  const remember = (r: Reason) => {
    const label = r.label;
    if (r.kind === "custom" && label && !labels.includes(label)) {
      setNewLabels((prev) => [...prev, label]);
    }
  };
  const pickReason = (r: Reason) => {
    remember(r);
    setReason(r);
    setRepeat(DEFAULT_REPEAT[r.kind] ?? "weekly");
  };

  const weekNameOf = (key: string) => weeks.find((w) => w.key === key)?.name ?? key;
  const viewed = weeks.find((w) => w.key === week) ?? weeks[0];

  /** "월 10시~12시", 그 주에만이면 "수(10/1) 10시~12시". */
  const rangeText = (b: Draft) => {
    const from = Number(hours[b.startHour]);
    const day = b.weekOf ? `${days[b.day]}(${dateOfDay(b.weekOf, b.day)})` : days[b.day];
    return `${day} ${from}시~${from + b.hours}시`;
  };
  const repeatText = (b: Draft) => (b.weekOf ? `${weekNameOf(b.weekOf)}만` : "매주");

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2000);
  };

  const paint = (day: number, startHour: number, length: number) => {
    setBlocks((prev) =>
      placeBlock(prev, {
        id: nextBlockId(),
        day,
        startHour,
        hours: length,
        ...reason,
        weekOf: repeat === "once" ? week : null,
      }),
    );
  };

  const openAdd = () =>
    setEditing({
      mode: "add",
      draft: { day: 0, startHour: 1, hours: 2, ...reason, weekOf: repeat === "once" ? week : null },
    });

  const openEdit = (block: BusyBlock) => {
    const { id, ...draft } = block;
    setEditing({ mode: "edit", id, draft });
  };

  const setDraft = (patch: Partial<Draft>) =>
    setEditing((prev) => {
      if (!prev) return prev;
      const draft = { ...prev.draft, ...patch };
      // 시작을 늦추면 길이가 시간표 밖으로 넘칠 수 있다 — 끝에 맞춰 줄인다.
      draft.hours = Math.min(draft.hours, hours.length - draft.startHour);
      return { ...prev, draft };
    });

  const applyEditing = () => {
    if (!editing) return;
    const id = editing.mode === "edit" ? editing.id : nextBlockId();
    setBlocks((prev) => placeBlock(prev, { id, ...editing.draft }));
    flash(
      editing.mode === "add"
        ? `추가했습니다 · ${rangeText(editing.draft)}`
        : `고쳤습니다 · ${rangeText(editing.draft)}`,
    );
    setEditing(null);
  };

  const removeEditing = () => {
    if (editing?.mode !== "edit") return;
    setBlocks((prev) => prev.filter((b) => b.id !== editing.id));
    flash(`지웠습니다 · ${rangeText(editing.draft)}`);
    setEditing(null);
  };

  /** 등록한 불가 시간의 총 칸 수. */
  const filled = useMemo(() => blocks.reduce((sum, b) => sum + b.hours, 0), [blocks]);
  const sorted = useMemo(() => sortBlocks(blocks), [blocks]);
  const visible = useMemo(() => blocksInWeek(blocks, week), [blocks, week]);

  const dirty = useMemo(
    () => blocksShape(blocks) !== blocksShape(initialBlocks),
    [blocks, initialBlocks],
  );

  const saveAndGo = async (href: string) => {
    if (saving) return;
    setSaving(true);
    try {
      await saveMyBusyBlocks(blocks);
      router.push(href);
    } finally {
      setSaving(false);
    }
  };

  const save = () => saveAndGo("/schedule/slots");

  const draft = editing?.draft;

  return (
    <>
      <AppBar title="내 시간표" sub="안 되는 시간만 표시" />
      <Body dense>
        <ScheduleTabs
          current="mine"
          onLeave={(href, e) => {
            // 팀 겹쳐보기에는 저장된 내 시간표가 보인다 — 적어 둔 것을 두고 가면
            // 방금 칠한 시간이 팀 화면에 없어 헷갈린다. 저장하고 넘어간다.
            if (!dirty) return;
            e.preventDefault();
            void saveAndGo(href);
          }}
        />
        <p className="text-pretty-keep m-0 mb-3 text-[14.5px] leading-[1.6] text-txt">
          <b>안 되는 시간</b>을 눌러 표시해 주세요. 표시하지 않은 시간은 가능한 시간으로 봅니다.
        </p>

        {/* 칠할 사유 */}
        <ReasonPicker
          kinds={kinds}
          customKind={customKind}
          labels={labels}
          value={reason}
          onChange={pickReason}
          className="mb-2"
        />
        <ChoiceRow
          label="반복"
          options={[
            { value: "weekly", text: "매주 반복" },
            { value: "once", text: `${viewed.name}만` },
          ]}
          value={repeat}
          onChange={setRepeat}
          stretch
        />

        <WeekPicker weeks={weeks} value={week} onChange={setWeek} />

        <Panel s="card" pad={12} r={16} className="mb-2">
          <WeekGrid
            days={days}
            dayNotes={days.map((_, i) => dateOfDay(week, i))}
            hours={hours}
            blocks={visible}
            lookFor={look}
            paintLook={look(reason)}
            onPaint={paint}
            onEdit={openEdit}
          />
        </Panel>
        <p className="t-cap keep-all m-0 mb-3 text-txt-muted">
          빈 칸을 누르면 1시간, 누른 채 위아래로 끌면 여러 시간이 한 번에 들어갑니다(터치는 길게 누른 뒤
          끌기). 칠한 시간을 누르면 고치거나 지울 수 있습니다. 점선 테두리는 그 주에만 있는 시간입니다.
        </p>

        <Btn full v="outline" icon="plus" onClick={openAdd} className="mb-3.5">
          요일·시간을 골라 추가
        </Btn>

        {/* 범례 */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          {kinds.map((k) => (
            <span
              key={k.key}
              className="t-cap-strong inline-flex items-center gap-[5px] text-txt-muted"
            >
              <span className="size-2.5 rounded-[3px]" style={{ background: k.color }} />
              {k.name}
            </span>
          ))}
          {labels.length > 0 ? (
            <span className="t-cap-strong inline-flex items-center gap-[5px] text-txt-muted">
              <span
                className="size-2.5 rounded-[3px]"
                style={{ background: look({ kind: "custom", label: null }).swatch }}
              />
              직접 입력
            </span>
          ) : null}
          <span className="t-cap-strong inline-flex items-center gap-[5px] text-txt-muted">
            <span className="size-2.5 rounded-[3px] border border-line bg-cr-100" />
            가능
          </span>
        </div>

        <SecTitle note="눌러서 고칠 수 있습니다">등록한 불가 시간 {blocks.length}건</SecTitle>
        {sorted.length > 0 ? (
          <Rows className="mb-3">
            {sorted.map((block) => {
              const k = look(block);
              return (
                <button
                  key={block.id}
                  type="button"
                  onClick={() => openEdit(block)}
                  aria-label={`${rangeText(block)} · ${k.name} · ${repeatText(block)} 고치기`}
                  className="box-border flex min-h-12 w-full cursor-pointer items-center gap-2.5 border-none bg-transparent px-[15px] py-3 text-left"
                >
                  <span
                    className="size-2.5 flex-none rounded-[3px]"
                    style={{ background: k.swatch }}
                  />
                  <span className="min-w-0 flex-1 font-semibold text-[14px] leading-[1.4] text-txt-strong">
                    {rangeText(block)} · {k.name}
                  </span>
                  <span
                    className={cn(
                      "t-cap-strong flex-none rounded-full px-2 py-0.5",
                      block.weekOf ? "bg-yellow-100 text-yellow-700" : "bg-fill text-txt-muted",
                    )}
                  >
                    {repeatText(block)}
                  </span>
                  <span className="flex-none text-txt-faint">
                    <Icon name="chevron-right" size={15} />
                  </span>
                </button>
              );
            })}
          </Rows>
        ) : (
          <Panel s="fill" pad={16} className="mb-3">
            <p className="t-note keep-all m-0 text-center text-txt-muted">
              아직 등록한 시간이 없습니다. 모든 시간이 가능한 것으로 봅니다.
            </p>
          </Panel>
        )}

        <Note tone="info" icon="users-round">
          팀원에게는 <b>가능 / 불가</b>만 보입니다. 수업명, 근무지, 시험 과목과 직접 입력한 사유 이름은
          공유되지 않습니다.
        </Note>

        <Undecided>
          <b>직접 입력 사유의 색은 임시값</b>입니다(<code>--busy-custom</code> = 크림 400). 디자인팀 확정 전까지
          사선 무늬 + 이름표로 구분합니다.
          <br />
          <b>09 회의 후보에는 기본 사유가 그대로 보입니다</b>(예: “박지호 · 아르바이트”, 핸드오프 원본 그대로).
          08의 “사유는 본인에게만”과 어긋나는데, 직접 입력 사유만은 이름 대신 “개인 일정”으로 내보내
          민감한 이름이 새지 않게 했습니다. 기본 사유까지 가릴지는 팀 확인이 필요합니다.
          <br />
          <b>볼 수 있는 주는 2주</b>이고, <b>토요일부터는 다음 주가 첫 주</b>입니다(격자가 월~금이라).
          회의 후보는 첫 주 기준입니다. 시험 기간을 고르면 반복이 “이 주만”으로 먼저 골라집니다.
        </Undecided>
      </Body>

      <Dock>
        <Btn full size="lg" onClick={save} iconRight="arrow-right" disabled={saving}>
          {saving ? "저장 중…" : `${filled}칸 저장하고 회의 시간 보기`}
        </Btn>
      </Dock>

      <Sheet
        open={editing !== null}
        title={editing?.mode === "edit" ? "안 되는 시간 고치기" : "안 되는 시간 추가"}
        onClose={() => setEditing(null)}
      >
        {draft ? (
          <>
            <Label>사유</Label>
            <ReasonPicker
              kinds={kinds}
              customKind={customKind}
              labels={labels}
              value={{ kind: draft.kind, label: draft.label }}
              onChange={(r) => {
                remember(r);
                setDraft({ kind: r.kind, label: r.label });
              }}
              className="mb-3"
            />

            <Label>반복</Label>
            <ChoiceRow
              label="반복"
              options={[
                { value: "", text: "매주" },
                ...weeks.map((w) => ({ value: w.key, text: `${w.name}만` })),
              ]}
              value={draft.weekOf ?? ""}
              onChange={(v) => setDraft({ weekOf: v || null })}
              stretch
            />

            <Label>요일</Label>
            <ChoiceRow
              label="요일"
              options={days.map((d, i) => ({
                value: i,
                // 그 주에만이면 날짜가 있어야 어느 날인지 안다.
                text: draft.weekOf ? `${d} ${dateOfDay(draft.weekOf, i)}` : d,
              }))}
              value={draft.day}
              onChange={(day) => setDraft({ day })}
              stretch
            />

            <Label>시작 시간</Label>
            <ChoiceRow
              label="시작 시간"
              options={hours.map((h, i) => ({ value: i, text: `${h}시` }))}
              value={draft.startHour}
              onChange={(startHour) => setDraft({ startHour })}
              mono
            />

            <Label>길이</Label>
            <ChoiceRow
              label="길이"
              options={LENGTHS.filter((n) => draft.startHour + n <= hours.length).map((n) => ({
                value: n,
                text: `${n}시간`,
              }))}
              value={draft.hours}
              onChange={(n) => setDraft({ hours: n })}
              stretch
            />

            <div className="mt-1 flex flex-col gap-2">
              <Btn full onClick={applyEditing}>
                {rangeText(draft)} · {editing?.mode === "edit" ? "이대로 고치기" : "추가하기"}
              </Btn>
              {editing?.mode === "edit" ? (
                <Btn full v="outline" icon="trash-2" onClick={removeEditing}>
                  지우기
                </Btn>
              ) : null}
            </div>
          </>
        ) : null}
      </Sheet>

      <Toast msg={toast} />
    </>
  );
}

function Label({ children }: { children: string }) {
  return <div className="t-cap-strong mb-2 font-bold text-txt-muted">{children}</div>;
}

function ChoiceRow<T extends string | number>({
  label,
  options,
  value,
  onChange,
  stretch,
  mono,
}: {
  label: string;
  options: Array<{ value: T; text: string }>;
  value: T;
  onChange: (value: T) => void;
  /** 선택지가 적어 한 줄을 나눠 채울 때. 많으면 가로로 스크롤한다. */
  stretch?: boolean;
  mono?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="mb-3 flex gap-[5px] overflow-x-auto">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-11 cursor-pointer rounded-[10px] border-none font-bold text-[13px] leading-none",
            stretch ? "flex-1" : "flex-none px-3",
            mono && "font-mono",
            value === o.value ? "bg-yellow-400 text-ink-900" : "bg-fill text-txt",
          )}
        >
          {o.text}
        </button>
      ))}
    </div>
  );
}
