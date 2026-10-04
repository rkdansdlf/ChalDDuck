"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AppBar,
  Body,
  Btn,
  Icon,
  Note,
  Panel,
  SecTitle,
  Undecided,
} from "@/components/ui";
import { AiErrorNote, SampleNote } from "./ai-state-notes";
import { runAiResearch } from "./ai-stream-client";
import { DraftSourceChip } from "./draft-source-chip";
import type { AiAnswerSource, ResearchResult } from "@/lib/types";
import type { QuerySuggestion } from "./research-query";

/**
 * 25 AI 리서처.
 *
 * **출처가 없는 결과는 보여주지 않는다.** 적합도 점수도 만들지 않는다 —
 * 점수를 붙이면 학생이 그 숫자만 보고 자료를 고르게 된다.
 */
export function ResearcherScreen({
  sampleQuery,
  initialResults,
  aiReady,
  suggestions,
}: {
  sampleQuery: string;
  initialResults: ResearchResult[];
  aiReady: boolean;
  /**
   * 팀 문맥에서 뽑은 **검색어 후보**(2단계-c). **입력창을 채우지 않는다.**
   *
   * 리서처 결과는 그대로 주소로 쓰이므로 "왜 이 결과가 나왔지" 를 물으면 **뭘 넣었는지가
   * 답**이다. 프로그램이 대신 정하면 그 답이 사라진다. 그래서 칩을 보여 주고 **누가 누른다**.
   *
   * ⚠️ **빈 배열일 수 있다** — 팀 이름도 역할도 없는 경우다. 그때 아무것도 그리지 않는다
   * ("추천이 없습니다" 를 보여 주는 것은 답이 없다는 뜻처럼 들린다).
   */
  suggestions: readonly QuerySuggestion[];
}) {
  const router = useRouter();

  const [query, setQuery] = useState(sampleQuery);
  const [results, setResults] = useState(initialResults);
  /** 화면에 지금 떠 있는 결과가 예시인지 AI 검색인지. 서버가 같이 보내 준 값이다. */
  const [source, setSource] = useState<AiAnswerSource>("sample");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 지금 어느 단계인가. 서버가 알려 준 것만 보여 준다 — 화면이 시간으로 짐작하지 않는다. */
  const [phase, setPhase] = useState<"searching" | "shaping" | null>(null);

  const search = async () => {
    if (!query.trim() || working) return;
    setWorking(true);
    setError(null);
    setPhase(null);
    try {
      const { value, source: made_by } = await runAiResearch({
        query: query.trim(),
        onPhase: setPhase,
      });
      setResults(value);
      setSource(made_by);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "AI 응답을 받지 못했습니다.");
    } finally {
      setWorking(false);
      setPhase(null);
    }
  };

  return (
    <>
      <AppBar title="AI 리서처" sub="출처와 함께 찾습니다" onBack={() => router.push("/tools")} />

      <Body dense>
        {aiReady ? null : <SampleNote className="mb-3.5" />}
        {error ? <AiErrorNote message={error} className="mb-3.5" /> : null}

        {suggestions.length > 0 ? (
          /**
           * **추천 검색어** — 누르면 칸에 **넣기만 하고** 검색은 하지 않는다.
           *
           * 검색까지 해버리면 사람이 고르기 전에 결과가 나오고, 그 결과가 화면을 차지해서
           * 다른 후보를 못 보게 된다. **넣기만 하는 것이 초안의 전부다.**
           */
          <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
            <span className="t-cap-strong mr-0.5 font-bold text-txt-muted">이 팀에서 찾아볼 것</span>
            {suggestions.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setQuery(s.text)}
                aria-label={`검색어에 넣기: ${s.text}`}
                className="cursor-pointer rounded-full border border-line bg-card px-2.5 py-1 font-medium text-[12px] text-txt-strong select-none transition-colors duration-150 hover:bg-cr-50 active:scale-95"
              >
                {s.text}
              </button>
            ))}
          </div>
        ) : null}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
          className="mb-4 flex items-center gap-2"
        >
          <span className="flex min-h-[50px] min-w-0 flex-1 items-center gap-2 rounded-control border-[1.5px] border-line-strong bg-card px-3.5">
            <span className="flex-none text-txt-faint">
              <Icon name="search" size={17} />
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // 한글 조합 중의 Enter 는 글자를 확정하는 키다.
                if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                e.preventDefault();
                search();
              }}
              placeholder="찾고 싶은 자료를 적어 주세요"
              aria-label="검색어"
              className="t-input min-w-0 flex-1 border-none bg-transparent text-txt-strong outline-none"
            />
          </span>
          <Btn type="submit" icon="search" disabled={!query.trim() || working}>
            {working ? "찾는 중" : "찾기"}
          </Btn>
        </form>

        {/* 한 번에 수십 초가 걸린다 — 멈춘 것이 아니라 어느 단계인지를 알린다. 첫 단계 알림이
            오기 전에는 말하지 않는다(모르는 것을 지어내지 않는다). */}
        {working && phase ? (
          <div role="status" aria-live="polite" className="t-cap mb-3 text-txt-muted">
            {phase === "searching" ? "웹에서 자료를 찾는 중…" : "찾은 자료를 카드로 정리하는 중…"}
          </div>
        ) : null}

        <div className="mb-1 flex items-center gap-2">
          <SecTitle note="출처가 없는 결과는 보여주지 않습니다" className="m-0 flex-1">
            결과 {results.length}건
          </SecTitle>
          <DraftSourceChip
            source={source}
            working={working}
            aiLabel="AI 검색 결과"
          />
        </div>

        {results.length === 0 ? (
          <Note tone="warn" icon="search-x" className="mb-4">
            찾은 자료가 없습니다. 말하려던 것을 조금 다르게 적어 다시 찾아 보세요.
          </Note>
        ) : null}

        <div className="mt-2 mb-4 flex flex-col gap-[9px]">
          {results.map((result) => (
            <Panel
              key={result.id}
              s={result.url ? "card" : "fill"}
              pad={14}
              r={16}
            >
              <div className="keep-all font-bold text-[14.5px] leading-[1.4] text-txt-strong">
                {result.title}
              </div>
              {/* 열 수 없는 출처는 확인할 수 없는 출처다 — 주소가 있으면 링크로 건다. */}
              {result.url ? (
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block font-mono font-semibold text-[12.5px] leading-[1.4] text-link underline"
                >
                  {result.source}
                </a>
              ) : (
                <div className="mt-1 font-mono font-semibold text-[12.5px] leading-[1.4] text-link">
                  {result.source}
                </div>
              )}
              <div className="text-pretty-keep mt-1.5 text-[13.5px] leading-[1.55] text-txt-muted">
                {result.snippet}
              </div>
            </Panel>
          ))}
        </div>

        <Note tone="info" icon="shield" className="mb-3">
          결과는 <b>찾아온 자료</b>일 뿐입니다. 어떤 자료를 쓸지, 어떻게 인용할지는 직접 판단해야
          합니다.
        </Note>

        <Undecided>
          **원문 링크는 항상 보여 주고, 출처가 없는 결과는 아예 보여 주지 않는다**(적합도 점수도
          만들지 않는다 — 점수를 매기면 사람이 그 표지를 믿게 된다). 걸러내는 기준이 아니라 **보이게
          하는 규칙**으로 정했다. 남은 것은 **최신성** 판단이다 — 언제 정보인지가 결과에 없다.
        </Undecided>
      </Body>
    </>
  );
}
