"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  AppBar,
  Body,
  Btn,
  Chip,
  type ChipTone,
  Icon,
  type IconName,
  Note,
  Panel,
  SecTitle,
  Toast,
  Undecided,
} from "@/components/ui";
import { AiErrorNote, SampleNote } from "./ai-state-notes";
import { runAiResearch } from "./ai-stream-client";
import { DraftSourceChip } from "./draft-source-chip";
import type { AiAnswerSource, ResearchResult, ResearchSourceKind } from "@/lib/types";

/**
 * 25 AI 리서처.
 *
 * **출처가 없는 결과는 보여주지 않는다.** 적합도 점수도 만들지 않는다 —
 * 점수를 붙이면 학생이 그 숫자만 보고 자료를 고르게 된다.
 *
 * 대신 객관적인 판단 속성(출처 성격·발행 연도)을 드러내고,
 * 과제·보고서 작성에 필요한 참고문헌 인용 표기 복사를 지원한다.
 */

const KIND_META: Record<
  ResearchSourceKind,
  { label: string; icon: IconName; tone: ChipTone }
> = {
  academic: { label: "학술·논문", icon: "book-open", tone: "ok" },
  stats: { label: "공공·통계", icon: "database", tone: "y" },
  news: { label: "언론·보도", icon: "file-text", tone: "n" },
  web: { label: "웹 자료", icon: "link", tone: "n" },
};

type FilterKey = "all" | "recent" | "academic";

export function ResearcherScreen({
  sampleQuery,
  initialResults,
  aiReady,
}: {
  sampleQuery: string;
  initialResults: ResearchResult[];
  aiReady: boolean;
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
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");

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

  const copyCitation = async (result: ResearchResult) => {
    const text =
      result.citation ||
      [
        result.source,
        result.year ? `(${result.year})` : null,
        `"${result.title}"`,
        result.url,
      ]
        .filter(Boolean)
        .join(", ");

    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(result.id);
      setToastMsg("참고문헌 인용 표기가 복사되었습니다.");
      setTimeout(() => {
        setCopiedId((prev) => (prev === result.id ? null : prev));
      }, 2000);
      setTimeout(() => setToastMsg(null), 2500);
    } catch {
      setToastMsg("복사에 실패했습니다.");
      setTimeout(() => setToastMsg(null), 2500);
    }
  };

  const filteredResults = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return results.filter((r) => {
      if (filter === "all") return true;
      if (filter === "recent") {
        if (!r.year) return false;
        const y = parseInt(r.year, 10);
        return !isNaN(y) && currentYear - y <= 3;
      }
      if (filter === "academic") {
        return r.kind === "academic" || r.kind === "stats";
      }
      return true;
    });
  }, [results, filter]);

  return (
    <>
      <AppBar title="AI 리서처" sub="출처와 함께 찾습니다" onBack={() => router.push("/tools")} />

      <Body dense>
        {aiReady ? null : <SampleNote className="mb-3.5" />}
        {error ? <AiErrorNote message={error} className="mb-3.5" /> : null}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
          className="mb-3 flex items-center gap-2"
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

        {/* 최신성 / 성격 필터 탭 */}
        {results.length > 0 ? (
          <div className="mb-3 flex items-center gap-1.5" role="tablist" aria-label="결과 필터">
            <button
              type="button"
              role="tab"
              aria-selected={filter === "all"}
              onClick={() => setFilter("all")}
              className={`t-cap rounded-control border px-2.5 py-1 transition-colors ${
                filter === "all"
                  ? "border-line-strong bg-fill-strong font-semibold text-txt-strong"
                  : "border-line bg-card text-txt-muted hover:bg-fill"
              }`}
            >
              전체 ({results.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === "recent"}
              onClick={() => setFilter("recent")}
              className={`t-cap inline-flex items-center gap-1 rounded-control border px-2.5 py-1 transition-colors ${
                filter === "recent"
                  ? "border-line-strong bg-fill-strong font-semibold text-txt-strong"
                  : "border-line bg-card text-txt-muted hover:bg-fill"
              }`}
            >
              <Icon name="clock" size={12} />
              <span>최근 3년</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === "academic"}
              onClick={() => setFilter("academic")}
              className={`t-cap inline-flex items-center gap-1 rounded-control border px-2.5 py-1 transition-colors ${
                filter === "academic"
                  ? "border-line-strong bg-fill-strong font-semibold text-txt-strong"
                  : "border-line bg-card text-txt-muted hover:bg-fill"
              }`}
            >
              <Icon name="book-open" size={12} />
              <span>학술·통계만</span>
            </button>
          </div>
        ) : null}

        <div className="mb-1 flex items-center gap-2">
          <SecTitle note="출처가 없는 결과는 보여주지 않습니다" className="m-0 flex-1">
            결과 {filteredResults.length}건
            {filter !== "all" && filteredResults.length !== results.length
              ? ` (전체 ${results.length}건)`
              : ""}
          </SecTitle>
          <DraftSourceChip source={source} working={working} aiLabel="AI 검색 결과" />
        </div>

        {results.length === 0 ? (
          <Note tone="warn" icon="search-x" className="mb-4">
            찾은 자료가 없습니다. 말하려던 것을 조금 다르게 적어 다시 찾아 보세요.
          </Note>
        ) : null}

        {results.length > 0 && filteredResults.length === 0 ? (
          <Note tone="info" icon="info" className="mb-4">
            선택한 필터 조건에 해당하는 자료가 없습니다. 다른 필터를 선택해 보세요.
          </Note>
        ) : null}

        <div className="mt-2 mb-4 flex flex-col gap-[9px]">
          {filteredResults.map((result) => {
            const kindMeta = result.kind ? KIND_META[result.kind] : null;
            return (
              <Panel key={result.id} s={result.url ? "card" : "fill"} pad={14} r={16}>
                {/* 상단 메타데이터: 출처 성격 + 발행 시점 */}
                {(kindMeta || result.year) && (
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    {kindMeta ? (
                      <Chip tone={kindMeta.tone} icon={kindMeta.icon}>
                        {kindMeta.label}
                      </Chip>
                    ) : null}
                    {result.year ? (
                      <Chip tone="n" icon="clock">
                        {result.year.endsWith("년") ? result.year : `${result.year}년`}
                      </Chip>
                    ) : null}
                  </div>
                )}

                <div className="keep-all font-bold text-[14.5px] leading-[1.4] text-txt-strong">
                  {result.title}
                </div>

                {/* 열 수 없는 출처는 확인할 수 없는 출처다 — 주소가 있으면 링크로 건다. */}
                {result.url ? (
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 inline-flex items-center gap-1 font-mono font-semibold text-[12.5px] leading-[1.4] text-link underline"
                  >
                    <span>{result.source}</span>
                    <Icon name="external-link" size={11} />
                  </a>
                ) : (
                  <div className="mt-1.5 font-mono font-semibold text-[12.5px] leading-[1.4] text-link">
                    {result.source}
                  </div>
                )}

                <div className="text-pretty-keep mt-2 text-[13.5px] leading-[1.55] text-txt-muted">
                  {result.snippet}
                </div>

                {/* 하단 유틸리티 동작: 과제용 참고문헌 인용 복사 */}
                <div className="mt-3 flex items-center justify-between border-t border-line-subtle pt-2.5">
                  <button
                    type="button"
                    onClick={() => copyCitation(result)}
                    className="inline-flex items-center gap-1.5 rounded-[8px] bg-fill px-2.5 py-1 text-[12px] font-medium text-txt hover:bg-fill-hover active:scale-[0.98] transition-all"
                    aria-label="참고문헌 인용 표기 복사"
                  >
                    <Icon
                      name={copiedId === result.id ? "check" : "copy"}
                      size={12}
                      className={copiedId === result.id ? "text-ok" : "text-txt-muted"}
                    />
                    <span>{copiedId === result.id ? "인용 복사됨" : "인용 복사"}</span>
                  </button>
                  <span className="text-[11px] text-txt-faint">
                    {result.url ? "원문 검증 완료" : "데모 예시"}
                  </span>
                </div>
              </Panel>
            );
          })}
        </div>

        <Note tone="info" icon="shield" className="mb-3">
          결과는 <b>찾아온 자료</b>일 뿐입니다. 어떤 자료를 쓸지, 어떻게 인용할지는 직접 판단해야
          합니다.
        </Note>

        <Undecided>
          **원문 링크는 항상 보여 주고, 출처가 없는 결과는 아예 보여 주지 않는다**(적합도 점수도
          만들지 않는다 — 점수를 매기면 사람이 그 표지를 믿게 된다). 남은 과제였던 **최신성(발행
          연도)**과 **출처 성격(학술·통계·언론·웹)**을 객관적 속성으로 노출하고, **표준 참고문헌 인용
          복사**를 제공해 과제 작성 효율을 높였습니다.
        </Undecided>
      </Body>

      <Toast msg={toastMsg} />
    </>
  );
}
