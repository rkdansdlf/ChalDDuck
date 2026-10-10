"use client";

import { useState } from "react";
import { Btn, Field, Icon, Input, Panel } from "@/components/ui";
import { clearBirth, setBirth } from "@/features/onboarding/onboarding-state";
import type { MbtiType } from "@/lib/mbti";
import { DAY_MASTER_COPY, ELEMENT_WORD, SAJU_NOTICE, SAJU_PRIVACY } from "@/lib/saju/copy";
import { ELEMENT_KO, calculateSaju, type SajuChart } from "@/lib/saju/engine";
import { BIRTH_BLOCK_MESSAGE, parseBirth } from "@/lib/saju/input";

/**
 * 온보딩 "내 찰떡 프로필" 의 사주 칸 — **선택**이다.
 *
 * 05 캐릭터 화면 안에 둔다. 단계를 하나 더 만들면 "n / 4단계" 가 전 화면에서 바뀌고, 사주를 건너뛰고
 * 싶은 사람에게 건너뛸 단계가 하나 더 생긴다. 여기서는 입력하지 않아도 아래 "희망 역할 고르기"가
 * 그대로 주 동작이다.
 *
 * ## 출처를 섞지 않는다
 *
 * MBTI 는 **내가 고른 자기 서술**이고 사주는 **생년월일로 계산한 재미 해석**이다. 결과 줄은
 * "ENFP × 병화"처럼 둘을 나란히 두지만 각각의 출처를 한 줄씩 적는다. 둘 다 역할 배정에 쓰지 않는다.
 *
 * 계산은 이 기기 안에서만 한다(`engine.ts` 는 순수 함수). 입력값은 지금 팀에 들어갈 때 서버로 한 번
 * 가고, 팀원에게는 일간·오행 분포만 보인다.
 */
export function OnboardingSaju({
  mbti,
  birthDate,
  birthTime,
}: {
  mbti: MbtiType;
  birthDate: string;
  birthTime: string;
}) {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(birthDate);
  const [time, setTime] = useState(birthTime);
  const [error, setError] = useState<string | null>(null);

  // 저장된 값이 아직 계산 가능한 모양인지 — 아니면(깨진 값) 입력이 없는 것처럼 보여 준다.
  const saved = birthDate ? parseBirth(birthDate, birthTime || null) : null;
  const chart: SajuChart | null = saved && saved.ok ? calculateSaju(saved.input) : null;

  const save = () => {
    const parsed = parseBirth(date, time || null);
    if (!parsed.ok) {
      setError(BIRTH_BLOCK_MESSAGE[parsed.reason]);
      return;
    }
    setError(null);
    setBirth(parsed.date, parsed.time ?? "");
    setEditing(false);
  };

  if (chart && !editing) {
    const master = DAY_MASTER_COPY[chart.dayMaster.stem];
    return (
      <Panel s="card" pad={16} r={18} className="mt-3 shadow-xs border border-yellow-200/70">
        <div className="t-cap-strong text-yellow-800">내 찰떡 프로필</div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
          <span className="font-mono text-[18px] font-extrabold text-txt-strong">{mbti}</span>
          <span className="text-[16px] text-txt-muted">×</span>
          <span className="text-[18px] font-extrabold text-txt-strong">{master.name}</span>
        </div>
        <div className="t-cap mt-0.5 text-txt-muted">
          {master.image} · {ELEMENT_KO[chart.dayMaster.element]} {ELEMENT_WORD[chart.dayMaster.element].hanja}
        </div>
        <p className="text-pretty-keep m-0 mt-2 text-[14px] leading-[1.55] text-txt">{master.nature}</p>

        <dl className="m-0 mt-3 flex flex-col gap-1.5 border-t border-line/60 pt-3">
          <div className="flex gap-2">
            <dt className="t-cap-strong w-12 flex-none text-txt-muted">MBTI</dt>
            <dd className="t-cap m-0 text-txt">내가 고른 유형이에요</dd>
          </div>
          <div className="flex gap-2">
            <dt className="t-cap-strong w-12 flex-none text-txt-muted">사주</dt>
            <dd className="t-cap m-0 text-txt">생년월일로 계산한 재미 해석이에요</dd>
          </div>
        </dl>

        <div className="mt-3 flex gap-3">
          <button
            type="button"
            onClick={() => {
              setDate(birthDate);
              setTime(birthTime);
              setEditing(true);
            }}
            className="t-cap-strong cursor-pointer border-none bg-transparent p-0 text-link"
          >
            바꾸기
          </button>
          <button
            type="button"
            onClick={() => {
              clearBirth();
              setDate("");
              setTime("");
            }}
            className="t-cap-strong cursor-pointer border-none bg-transparent p-0 text-txt-muted underline underline-offset-2"
          >
            사주 빼기
          </button>
        </div>
        <p className="t-cap text-pretty-keep m-0 mt-2 text-txt-muted">{SAJU_NOTICE}</p>
      </Panel>
    );
  }

  if (!editing) {
    return (
      <Panel s="cream" pad={14} r={16} className="mt-3" onClick={() => setEditing(true)}>
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2.5">
            <Icon name="sparkles" size={17} className="flex-none text-yellow-700" />
            <span className="min-w-0">
              <span className="block text-[14.5px] font-bold text-txt-strong">사주도 더해 볼까요? · 선택</span>
              <span className="t-cap block text-txt-muted">생년월일을 넣으면 내 일간을 함께 보여 드려요</span>
            </span>
          </span>
          <Icon name="chevron-right" size={16} className="flex-none text-txt-muted" />
        </div>
      </Panel>
    );
  }

  return (
    <Panel s="card" pad={16} r={18} className="mt-3 shadow-xs border border-yellow-200/70">
      <div className="t-note-title mb-1 flex items-center gap-1.5 text-yellow-800">
        <Icon name="sparkles" size={16} />
        <span>찰떡 사주 · 선택</span>
      </div>
      <p className="text-pretty-keep m-0 mb-3 text-[13.5px] leading-[1.55] text-txt-muted">{SAJU_PRIVACY}</p>

      <Field label="생년월일" required error={error}>
        {(props) => <Input {...props} type="date" value={date} onChange={setDate} error={Boolean(error)} />}
      </Field>
      <Field label="태어난 시각" hint="모르면 비워 두세요. 시주만 빼고 계산해요.">
        {(props) => <Input {...props} type="time" value={time} onChange={setTime} />}
      </Field>

      <div className="flex gap-2">
        <Btn
          full
          v="outline"
          onClick={() => {
            setError(null);
            setEditing(false);
          }}
        >
          취소
        </Btn>
        <Btn full v="soft" disabled={date === ""} onClick={save}>
          사주 더하기
        </Btn>
      </div>
    </Panel>
  );
}
