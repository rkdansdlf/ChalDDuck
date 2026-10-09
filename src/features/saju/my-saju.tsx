"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Btn, Field, Input, Note, Panel, SecTitle, Sheet, Undecided } from "@/components/ui";
import type { MySaju } from "@/data/api";
import { cn } from "@/lib/cn";
import {
  BRANCHES,
  ELEMENTS,
  ELEMENT_KO,
  STEMS,
  pillarElements,
  pillarHanja,
  type Element,
  type Pillar,
  type PillarTenGods,
} from "@/lib/saju/engine";
import {
  BOUNDARY_NOTICE,
  DAY_MASTER_COPY,
  ELEMENT_WORD,
  LATE_NIGHT_NOTICE,
  NO_TIME_NOTICE,
  SAJU_NOTICE,
  SAJU_PRIVACY,
  TEN_GOD_MEANING,
} from "@/lib/saju/copy";
import { BIRTH_BLOCK_MESSAGE } from "@/lib/saju/input";
import { clearMyBirth, saveMyBirth } from "@/server/actions/saju";

/**
 * 내 사주 — 생년월일(시)을 등록하고, 거기서 계산한 사주를 본다.
 *
 * ## 어디에 붙나
 *
 * MBTI(`team-mbti.tsx`)와 같은 자리, **계정과 기기** 화면이다. 둘 다 내 계정의 값이고,
 * 07 역할 조율 화면에 두면 "사주가 배정에 영향을 주었다" 고 읽힌다. 영향을 주지 않는다.
 *
 * ## 이 화면이 하는 말
 *
 * 계산된 것(네 기둥·오행 수·음양 수·십성의 뜻)은 **사실**로 보여 주고, 해석 문구는 고정 사전에서
 * 일간으로 골라 `재미 해석` 이라는 이름표 아래 둔다. 오행 막대는 "많다/적다"를 평가하지 않고
 * 센 수만 그린다 — 부족한 오행이 있다고 해서 무엇이 모자란다고 말하지 않는다.
 */
export function MySajuCard({ saju }: { saju: MySaju | null }) {
  const [sheet, setSheet] = useState<"form" | "detail" | null>(null);

  const master = saju ? DAY_MASTER_COPY[saju.chart.dayMaster.stem] : null;

  return (
    <>
      <SecTitle note="생년월일로 보는 재미 해석입니다. 역할 배정과는 관계없습니다">내 사주</SecTitle>
      <Panel s="cream" pad={16} className="mb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="t-cap-strong text-txt-muted">내 일간</div>
            {saju && master ? (
              <div className="mt-0.5 flex items-baseline gap-2">
                <span className="text-[15px] font-extrabold text-txt-strong">{master.name}</span>
                <span className="t-body keep-all truncate text-txt-muted">{master.image}</span>
              </div>
            ) : (
              <div className="t-body mt-0.5 text-txt-strong">아직 등록하지 않았습니다</div>
            )}
          </div>
          <div className="flex flex-none gap-2">
            {saju ? (
              <Btn v="outline" size="sm" onClick={() => setSheet("detail")}>
                보기
              </Btn>
            ) : null}
            <Btn v="outline" size="sm" onClick={() => setSheet("form")}>
              {saju ? "변경" : "등록"}
            </Btn>
          </div>
        </div>
      </Panel>

      {/* 닫혀 있을 땐 마운트하지 않는다 — 열 때마다 저장된 값으로 입력칸이 다시 채워진다. */}
      {sheet === "form" ? <BirthSheet saju={saju} onClose={() => setSheet(null)} /> : null}
      {sheet === "detail" && saju ? <DetailSheet saju={saju} onClose={() => setSheet(null)} /> : null}
    </>
  );
}

/* ── 등록 ──────────────────────────────────────────────────── */

function BirthSheet({ saju, onClose }: { saju: MySaju | null; onClose: () => void }) {
  const router = useRouter();
  const [date, setDate] = useState(saju?.birthDate ?? "");
  const [time, setTime] = useState(saju?.birthTime ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await saveMyBirth(date, time === "" ? null : time);
      if (result === "ok") {
        onClose();
        router.refresh();
      } else if (result === "invalid") {
        setError("로그인이 풀렸어요. 다시 들어온 뒤 시도해 주세요.");
      } else {
        setError(BIRTH_BLOCK_MESSAGE[result]);
      }
    } catch {
      setError("저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setSaving(true);
    setError(null);
    try {
      await clearMyBirth();
      onClose();
      router.refresh();
    } catch {
      setError("지우지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open
      title={saju ? "내 사주 변경" : "내 사주 등록"}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Btn full v="outline" disabled={saving} onClick={onClose}>
            취소
          </Btn>
          <Btn full disabled={saving || date === ""} onClick={save}>
            {saving ? "저장 중…" : "저장"}
          </Btn>
        </div>
      }
    >
      <p className="text-pretty-keep m-0 mb-3.5 text-[14.5px] leading-[1.6] text-txt">{SAJU_PRIVACY}</p>

      <Field label="생년월일" required error={error}>
        {(props) => <Input {...props} type="date" value={date} onChange={setDate} error={Boolean(error)} />}
      </Field>
      <Field label="태어난 시각" hint="모르면 비워 두세요. 시주만 빼고 계산해요.">
        {(props) => <Input {...props} type="time" value={time} onChange={setTime} />}
      </Field>

      {saju ? (
        <button
          type="button"
          disabled={saving}
          onClick={clear}
          className="t-cap-strong mb-1 cursor-pointer border-none bg-transparent p-0 text-txt-muted underline underline-offset-2"
        >
          등록한 생년월일 지우기
        </button>
      ) : null}
    </Sheet>
  );
}

/* ── 보기 ──────────────────────────────────────────────────── */

function DetailSheet({ saju, onClose }: { saju: MySaju; onClose: () => void }) {
  const { chart } = saju;
  const master = DAY_MASTER_COPY[chart.dayMaster.stem];
  const lateNight = saju.birthTime !== null && (Number(saju.birthTime.slice(0, 2)) >= 23 || saju.birthTime.startsWith("00"));

  return (
    <Sheet open title="내 사주" onClose={onClose}>
      <p className="text-pretty-keep m-0 mb-3.5 text-[13.5px] leading-[1.6] text-txt-muted">{SAJU_NOTICE}</p>

      <PillarTable chart={chart} />

      <Panel s="card" pad={16} className="mb-3.5">
        <div className="t-cap-strong text-txt-muted">재미 해석 · 일간</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-[16px] font-extrabold text-txt-strong">{master.name}</span>
          <span className="t-body keep-all text-txt-muted">{master.image}</span>
        </div>
        <p className="text-pretty-keep m-0 mt-2 text-[14.5px] leading-[1.6] text-txt">{master.nature}</p>
        <p className="text-pretty-keep m-0 mt-1.5 text-[14.5px] leading-[1.6] text-txt">
          <b>회의에서는</b> {master.meetingTip}
        </p>
      </Panel>

      <SecTitle note={`${chart.characters}글자를 오행별로 센 값입니다`}>오행 분포</SecTitle>
      <Panel s="card" pad={16} className="mb-3.5 flex flex-col gap-2.5">
        {ELEMENTS.map((e) => (
          <ElementBar
            key={e}
            element={e}
            count={chart.elementCounts[e]}
            percent={chart.elementPercent[e]}
            top={chart.dominant.includes(e)}
          />
        ))}
        <p className="t-cap m-0 text-txt-muted">
          양 {chart.yang} · 음 {chart.yin}
        </p>
      </Panel>

      {saju.birthTime === null ? (
        <Note tone="info" icon="clock" className="mb-3">
          {NO_TIME_NOTICE}
        </Note>
      ) : null}
      {chart.boundary ? (
        <Note tone="warn" icon="circle-alert" className="mb-3">
          {BOUNDARY_NOTICE[chart.boundary]}
        </Note>
      ) : null}
      {lateNight ? (
        <Note tone="info" icon="moon" className="mb-3">
          {LATE_NIGHT_NOTICE}
        </Note>
      ) : null}

      <Undecided>
        사주 계산의 갈림길 세 가지를 정하지 않았습니다 — ① 밤 11시에 날이 바뀌는지, 자정에 바뀌는지
        ② 출생지 경도 보정(서울 −30분)을 하는지 ③ 팀 사주에서 시각을 모르는 사람을 어떻게 셀지. 지금은
        ① 11시 ② 보정 없음으로 계산합니다.
      </Undecided>
    </Sheet>
  );
}

const COLUMNS: { key: "hour" | "day" | "month" | "year"; label: string }[] = [
  { key: "hour", label: "시주" },
  { key: "day", label: "일주" },
  { key: "month", label: "월주" },
  { key: "year", label: "연주" },
];

/** 네 기둥. 만세력 관례대로 시·일·월·연 순으로 왼쪽에서 오른쪽. 일간 자리를 짚어 둔다. */
function PillarTable({ chart }: { chart: MySaju["chart"] }) {
  return (
    <table className="mb-3.5 w-full table-fixed border-separate border-spacing-1.5 text-center">
      <caption className="sr-only">사주 원국 — 시주, 일주, 월주, 연주</caption>
      <thead>
        <tr>
          {COLUMNS.map((c) => (
            <th key={c.key} scope="col" className="t-cap-strong pb-0.5 font-bold text-txt-muted">
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          {COLUMNS.map((c) => (
            <PillarCell key={c.key} pillar={chart[c.key]} gods={chart.tenGods[c.key]} master={c.key === "day"} />
          ))}
        </tr>
      </tbody>
    </table>
  );
}

function PillarCell({ pillar, gods, master }: { pillar: Pillar | null; gods: PillarTenGods | null; master: boolean }) {
  if (!pillar) {
    return (
      <td className="rounded-xl border border-dashed border-line px-1 py-3 align-top">
        <div className="t-cap text-txt-muted">모름</div>
      </td>
    );
  }
  const el = pillarElements(pillar);
  return (
    <td
      className={cn(
        "rounded-xl border px-1 py-2.5 align-top",
        master ? "border-yellow-600 bg-yellow-100" : "border-line bg-card",
      )}
    >
      <div className="text-[22px] font-extrabold leading-none text-txt-strong">{pillarHanja(pillar)}</div>
      <div className="t-cap mt-1 text-txt">
        {STEMS[pillar.stem]}
        {BRANCHES[pillar.branch]}
      </div>
      <div className="t-cap mt-1 text-txt-muted">
        {ELEMENT_KO[el.stem]} · {ELEMENT_KO[el.branch]}
      </div>
      <div className="t-cap-strong mt-1.5 text-txt-strong">
        {master ? "일간" : (gods?.stem ?? "")}
      </div>
      <div className="t-cap text-txt-muted" title={gods ? TEN_GOD_MEANING[gods.branch] : undefined}>
        {gods?.branch ?? ""}
      </div>
    </td>
  );
}

function ElementBar({
  element,
  count,
  percent,
  top,
}: {
  element: Element;
  count: number;
  percent: number;
  top: boolean;
}) {
  const w = ELEMENT_WORD[element];
  return (
    <div>
      <div className="mb-1 flex justify-between text-[12px] font-medium text-txt-muted">
        <span className={cn(top && "font-bold text-txt-strong")}>
          {ELEMENT_KO[element]} {w.hanja} · {w.keyword}
        </span>
        <span>
          {count}글자 · {percent}%
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-line">
        <div
          className={cn("h-full transition-all duration-300", top ? "bg-yellow-500" : "bg-amber-200")}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
