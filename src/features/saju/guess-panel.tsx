"use client";

import { useMemo, useState } from "react";
import { Btn, Icon, Panel, Rows } from "@/components/ui";
import type { TeamSajuMember } from "@/data/api";
import {
  DAY_MASTER_COPY,
  GUESS_INTRO,
  GUESS_NEED_MORE_NOW,
  GUESS_NO_ROUND,
  GUESS_PREVIEW_CAPTION,
} from "@/lib/saju/copy";
import { ELEMENTS, ELEMENT_KO } from "@/lib/saju/engine";
import { MIN_GUESS_PLAYERS, buildGuessRounds } from "@/lib/saju/play";

/** 연·월·일 여섯 글자의 오행 수 다섯 칸. 문제와 미리 보기가 같은 모양을 쓴다. */
function ElementCounts({ elements }: { elements: TeamSajuMember["elements"] }) {
  return (
    <ul className="m-0 mt-2.5 grid list-none grid-cols-5 gap-1.5 p-0" aria-label="연·월·일 여섯 글자의 오행 수">
      {ELEMENTS.map((e) => (
        <li key={e} className="rounded-xl bg-fill px-1 py-2 text-center">
          <div className="t-cap text-txt-muted">{ELEMENT_KO[e]}</div>
          <div className="t-title text-txt-strong">{elements[e]}</div>
        </li>
      ))}
    </ul>
  );
}

/**
 * 사주 맞히기 — 한 팀원의 연·월·일 **오행 수만** 보고 누구인지 맞힌다.
 *
 * 문제는 오늘 날짜로 정해진다(같은 날·같은 사람이면 새로고침해도 같다). 보기는 나를 뺀 등록한 팀원 전부다.
 * 힌트로 일간을 볼 수 있다. 정답과 일간은 이미 팀 사주 화면이 보여 주는 값이라 이 놀이가 새로 드러내는
 * 정보는 없다. 혼자 하는 놀이라 서버에 아무것도 남기지 않는다.
 *
 * 등록한 팀원이 모자라 문제를 못 내는 동안에는 **내 오행 수로 문제가 어떻게 생겼는지** 미리 보여 준다 —
 * 혼자일 때 빈 안내문만 보이지 않게 한다. 내 값이라 새로 드러나는 것도 없다.
 */
export function GuessPanel({
  members,
  me,
  today,
}: {
  members: TeamSajuMember[];
  me: TeamSajuMember;
  today: string;
}) {
  const rounds = useMemo(() => buildGuessRounds(members, me.id, today), [members, me.id, today]);
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<(string | null)[]>([]);
  const [hint, setHint] = useState(false);

  if (rounds.length === 0) {
    const enough = members.length >= MIN_GUESS_PLAYERS;
    return (
      <Panel s="cream" pad={16} className="mb-4">
        <p className="text-pretty-keep m-0 t-card text-txt">
          {enough ? GUESS_NO_ROUND : GUESS_NEED_MORE_NOW(members.length)}
        </p>
        <ElementCounts elements={me.elements} />
        <p className="t-cap text-pretty-keep m-0 mt-2 text-txt-muted">{GUESS_PREVIEW_CAPTION}</p>
      </Panel>
    );
  }

  if (!started) {
    return (
      <Panel s="cream" pad={16} className="mb-4">
        <p className="text-pretty-keep m-0 mb-3 t-card text-txt">{GUESS_INTRO}</p>
        <Btn
          full
          v="soft"
          icon="search"
          onClick={() => {
            setStarted(true);
            setIndex(0);
            setAnswers([]);
            setHint(false);
          }}
        >
          시작하기 · {rounds.length}문제
        </Btn>
      </Panel>
    );
  }

  const done = index >= rounds.length;
  if (done) {
    const right = rounds.filter((r, i) => answers[i] === r.targetId).length;
    return (
      <Panel s="card" pad={16} className="mb-4">
        <div className="t-title text-txt-strong">
          {rounds.length}문제 중 {right}문제 맞혔어요
        </div>
        <p className="t-cap mt-1 mb-3 text-txt-muted">같은 날에는 같은 문제가 나와요. 내일 다시 해 보세요.</p>
        <Btn full v="outline" icon="rotate-ccw" onClick={() => setStarted(false)}>
          처음으로
        </Btn>
      </Panel>
    );
  }

  const round = rounds[index]!;
  const target = byId.get(round.targetId)!;
  const answered = answers[index] !== undefined;
  const picked = answers[index] ?? null;
  const correct = picked === round.targetId;

  return (
    <Panel s="card" pad={16} className="mb-4">
      <div className="t-cap-strong text-txt-muted">
        문제 {index + 1} / {rounds.length}
      </div>
      <div className="mt-1 t-sec text-txt-strong">이 오행 수는 누구의 사주일까요?</div>

      <ElementCounts elements={target.elements} />

      {hint || answered ? (
        <p className="t-cap mt-2 mb-0 text-txt-muted">
          힌트 · 일간은 {DAY_MASTER_COPY[target.stem].name}({DAY_MASTER_COPY[target.stem].image})
        </p>
      ) : (
        <button
          type="button"
          onClick={() => setHint(true)}
          className="t-cap-strong mt-2 cursor-pointer border-none bg-transparent p-0 text-link"
        >
          힌트 보기 · 일간
        </button>
      )}

      <Rows className="mt-3">
        {round.optionIds.map((id) => {
          const opt = byId.get(id)!;
          const isAnswer = id === round.targetId;
          const isPick = id === picked;
          return (
            <button
              key={id}
              type="button"
              disabled={answered}
              aria-pressed={isPick}
              onClick={() => setAnswers((prev) => [...prev.slice(0, index), id])}
              className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 px-4 py-2 text-left hover:bg-fill disabled:cursor-default disabled:hover:bg-transparent"
            >
              <span className="t-body-strong text-txt-strong">{opt.name}</span>
              {answered && isAnswer ? (
                <span className="t-cap-strong flex items-center gap-1 text-txt-strong">
                  <Icon name="check" size={15} />
                  정답
                </span>
              ) : answered && isPick ? (
                <span className="t-cap-strong flex items-center gap-1 text-txt-muted">
                  <Icon name="x" size={15} />
                  내 선택
                </span>
              ) : null}
            </button>
          );
        })}
      </Rows>

      {answered ? (
        <div className="mt-3">
          <p role="status" className="m-0 mb-2.5 t-card-title text-txt-strong">
            {correct ? "맞아요!" : `아쉬워요. 정답은 ${target.name} 님이에요.`}
          </p>
          <Btn
            full
            v="soft"
            iconRight="arrow-right"
            onClick={() => {
              setIndex(index + 1);
              setHint(false);
            }}
          >
            {index + 1 >= rounds.length ? "결과 보기" : "다음 문제"}
          </Btn>
        </div>
      ) : null}
    </Panel>
  );
}
