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
  Sheet,
  Toast,
} from "@/components/ui";
import { AiErrorNote, SampleNote } from "./ai-state-notes";
import { runAiResearch } from "./ai-stream-client";
import { DraftSourceChip } from "./draft-source-chip";
// ⚠️ **양쪽 다 필요하다.** main 은 리서처에 "공유하기/드라이브로 저장" 과 출처 종류
// (`ResearchSourceKind`) 를 붙였고, 2단계-c 는 팀 문맥에서 뽑은 검색어 후보(`QuerySuggestion`)를
// 붙였다. **같은 import 자리를 서로 쓰고 있었다** — 어느 한쪽을 고르면 그 기능이 조용히 사라진다.
import { RESEARCH_CURATED_SUGGESTIONS } from "@/data/catalog";
import { shareResearchToChat } from "@/server/actions/chat";
import {
  getMyTeamSubmissionBoxesForSelect,
  saveResearchToDrive,
} from "@/server/actions/drive";
import type { AiAnswerSource, ResearchResult, ResearchSourceKind } from "@/lib/types";
import type { QuerySuggestion } from "./research-query";

/**
 * 25 AI 리서처.
 *
 * **출처가 없는 결과는 보여주지 않는다.** 적합도 점수도 만들지 않는다 —
 * 점수를 붙이면 학생이 그 숫자만 보고 자료를 고르게 된다.
 *
 * 대신 객관적인 판단 속성(출처 성격·발행 연도)을 드러내고,
 * 과제·보고서 작성에 필요한 참고문헌 인용 표기 복사와
 * 팀 단톡방 공유 및 드라이브 제출함 저장을 지원한다.
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

type SubmissionBoxOption = {
  id: string;
  name: string;
  role: string;
};

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
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");

  /** 드라이브 저장 시트 상태 */
  const [targetForDrive, setTargetForDrive] = useState<ResearchResult | null>(null);
  const [boxes, setBoxes] = useState<SubmissionBoxOption[]>([]);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [driveSaving, setDriveSaving] = useState(false);

  const search = async (overrideQuery?: string) => {
    const q = (overrideQuery ?? query).trim();
    if (!q || working) return;
    if (overrideQuery) setQuery(overrideQuery);
    setWorking(true);
    setError(null);
    setPhase(null);
    try {
      const { value, source: made_by } = await runAiResearch({
        query: q,
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

  const shareToChat = async (result: ResearchResult) => {
    if (sharingId) return;
    setSharingId(result.id);
    try {
      const res = await shareResearchToChat({
        title: result.title,
        source: result.source,
        snippet: result.snippet,
        url: result.url,
        year: result.year,
      });
      if (res.ok) {
        setToastMsg("팀 단톡방에 자료 카드를 공유했습니다.");
      } else {
        setToastMsg(res.error || "단톡방 공유에 실패했습니다.");
      }
    } catch (cause: unknown) {
      setToastMsg(cause instanceof Error ? cause.message : "공유에 실패했습니다.");
    } finally {
      setSharingId(null);
      setTimeout(() => setToastMsg(null), 2500);
    }
  };

  const openDriveSheet = async (result: ResearchResult) => {
    setTargetForDrive(result);
    if (boxes.length === 0) {
      try {
        const list = await getMyTeamSubmissionBoxesForSelect();
        setBoxes(list);
        if (list.length > 0 && !selectedBoxId) {
          setSelectedBoxId(list[0].id);
        }
      } catch {
        // 세션 없거나 조회 실패 시
      }
    }
  };

  const saveToDrive = async () => {
    if (!targetForDrive || !selectedBoxId || driveSaving) return;
    setDriveSaving(true);
    try {
      const res = await saveResearchToDrive(selectedBoxId, {
        title: targetForDrive.title,
        source: targetForDrive.source,
        snippet: targetForDrive.snippet,
        url: targetForDrive.url,
        year: targetForDrive.year,
        citation: targetForDrive.citation,
      });
      if (res.ok) {
        setToastMsg(`드라이브 ${res.boxName}에 자료가 저장되었습니다.`);
        setTargetForDrive(null);
      } else {
        setToastMsg(res.error || "드라이브 저장에 실패했습니다.");
      }
    } catch (cause: unknown) {
      setToastMsg(cause instanceof Error ? cause.message : "저장에 실패했습니다.");
    } finally {
      setDriveSaving(false);
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

        {/* 큐레이션 추천 검색어 칩 (Track 1) */}
        <div className="mb-3.5 flex flex-wrap items-center gap-1.5" aria-label="추천 검색어">
          <span className="t-cap flex-none font-medium text-txt-muted">추천:</span>
          {RESEARCH_CURATED_SUGGESTIONS.map((item) => (
            <button
              key={item.tag}
              type="button"
              disabled={working}
              onClick={() => search(item.query)}
              className="inline-flex items-center gap-1 rounded-control border border-line bg-card px-2.5 py-1 text-[12px] font-medium text-txt hover:bg-fill active:scale-[0.98] transition-all disabled:opacity-50"
            >
              <span>{item.tag}</span>
              <Icon name="arrow-right" size={10} className="text-txt-muted" />
            </button>
          ))}
        </div>

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

                {/* 하단 협업 및 유틸리티 동작 */}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-1.5 border-t border-line-subtle pt-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => copyCitation(result)}
                      className="inline-flex items-center gap-1 rounded-[8px] bg-fill px-2 py-1 text-[12px] font-medium text-txt hover:bg-fill-hover active:scale-[0.98] transition-all"
                      aria-label="참고문헌 인용 표기 복사"
                    >
                      <Icon
                        name={copiedId === result.id ? "check" : "copy"}
                        size={12}
                        className={copiedId === result.id ? "text-ok" : "text-txt-muted"}
                      />
                      <span>{copiedId === result.id ? "인용 복사됨" : "인용 복사"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => shareToChat(result)}
                      disabled={sharingId === result.id}
                      className="inline-flex items-center gap-1 rounded-[8px] bg-fill px-2 py-1 text-[12px] font-medium text-txt hover:bg-fill-hover active:scale-[0.98] transition-all disabled:opacity-50"
                      aria-label="팀 단톡방에 공유"
                    >
                      <Icon name="messages-square" size={12} className="text-txt-muted" />
                      <span>{sharingId === result.id ? "공유 중…" : "팀에 공유"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openDriveSheet(result)}
                      className="inline-flex items-center gap-1 rounded-[8px] bg-fill px-2 py-1 text-[12px] font-medium text-txt hover:bg-fill-hover active:scale-[0.98] transition-all"
                      aria-label="드라이브에 저장"
                    >
                      <Icon name="folder-open" size={12} className="text-txt-muted" />
                      <span>드라이브 저장</span>
                    </button>
                  </div>

                  <span className="text-[11px] text-txt-faint">
                    {result.url ? "원문 검증 완료" : "데모 예시"}
                  </span>
                </div>
              </Panel>
            );
          })}
        </div>

        {/* AI 연관 검색어 칩 (Track 2) */}
        {results.length > 0 && results[0]?.relatedQueries && results[0].relatedQueries.length > 0 ? (
          <Panel s="fill" pad={14} r={16} className="mb-4">
            <div className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-txt-strong">
              <Icon name="sparkles" size={14} className="text-primary" />
              <span>이어서 찾아볼 만한 연관 주제</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {results[0].relatedQueries.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={working}
                  onClick={() => search(q)}
                  className="inline-flex items-center gap-1.5 rounded-control border border-line-strong bg-card px-3 py-1.5 text-[12.5px] font-medium text-txt hover:border-primary hover:bg-fill active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <Icon name="search" size={12} className="text-txt-muted" />
                  <span>{q}</span>
                </button>
              ))}
            </div>
          </Panel>
        ) : null}

        <Note tone="info" icon="shield" className="mb-3">
          결과는 <b>찾아온 자료</b>일 뿐입니다. 어떤 자료를 쓸지, 어떻게 인용할지는 직접 판단해야
          합니다.
        </Note>

        {/* 정책 확정:
            원문 링크는 항상 보여 주고, 출처가 없는 결과는 아예 보여 주지 않는다 (적합도 점수도 만들지 않는다).
            최신성(발행 연도)과 출처 성격(학술·통계·언론·웹)을 객관적 속성으로 노출하고,
            표준 참고문헌 인용 복사, 팀 단톡방 공유, 드라이브 제출함 저장, 2-Track 추천 키워드 칩 고도화 완료. */}
      </Body>

      {/* 드라이브 제출함 선택 Sheet */}
      <Sheet
        open={Boolean(targetForDrive)}
        title="드라이브에 저장"
        onClose={() => setTargetForDrive(null)}
        footer={
          <div className="flex items-center gap-2">
            <Btn
              v="outline"
              className="flex-1"
              onClick={() => setTargetForDrive(null)}
              disabled={driveSaving}
            >
              취소
            </Btn>
            <Btn
              className="flex-1"
              icon="folder-open"
              onClick={saveToDrive}
              disabled={!selectedBoxId || driveSaving}
            >
              {driveSaving ? "저장 중…" : "제출함에 저장"}
            </Btn>
          </div>
        }
      >
        <div className="space-y-3 py-1">
          <div className="keep-all rounded-control bg-fill p-3 text-[13px] leading-[1.5] text-txt-muted">
            <span className="font-semibold text-txt-strong">선택한 자료:</span>{" "}
            {targetForDrive?.title} ({targetForDrive?.source})
          </div>

          <div className="text-[13.5px] font-bold text-txt-strong">저장할 제출함 선택</div>

          {boxes.length === 0 ? (
            <div className="rounded-control border border-dashed border-line p-4 text-center text-[13px] text-txt-muted">
              등록된 제출함이 없습니다. 팀 드라이브에서 제출함을 먼저 만들어 주세요.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {boxes.map((box) => (
                <button
                  key={box.id}
                  type="button"
                  onClick={() => setSelectedBoxId(box.id)}
                  className={`flex items-center justify-between rounded-control border p-3 text-left transition-colors ${
                    selectedBoxId === box.id
                      ? "border-line-strong bg-fill-strong text-txt-strong"
                      : "border-line bg-card text-txt hover:bg-fill"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[14px] leading-[1.4]">{box.name}</div>
                    <div className="text-[12px] text-txt-muted">역할: {box.role}</div>
                  </div>
                  <div className="flex-none pl-2">
                    <Icon
                      name={selectedBoxId === box.id ? "circle-check" : "circle"}
                      size={18}
                      className={selectedBoxId === box.id ? "text-primary" : "text-line"}
                    />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </Sheet>

      <Toast msg={toastMsg} />
    </>
  );
}
