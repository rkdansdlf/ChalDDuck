"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AppBar,
  Body,
  Btn,
  Chip,
  Icon,
  Note,
  Panel,
  SecTitle,
  Undecided,
} from "@/components/ui";
import { searchResearch } from "@/data/api";
import type { ResearchResult } from "@/lib/types";

/**
 * 25 AI 리서처.
 *
 * **출처가 없는 결과는 보여주지 않는다.** 적합도 점수도 만들지 않는다 —
 * 점수를 붙이면 학생이 그 숫자만 보고 자료를 고르게 된다.
 */
export function ResearcherScreen({
  sampleQuery,
  initialResults,
}: {
  sampleQuery: string;
  initialResults: ResearchResult[];
}) {
  const router = useRouter();

  const [query, setQuery] = useState(sampleQuery);
  const [results, setResults] = useState(initialResults);
  const [working, setWorking] = useState(false);

  const search = async () => {
    if (!query.trim() || working) return;
    setWorking(true);
    try {
      setResults(await searchResearch(query.trim()));
    } finally {
      setWorking(false);
    }
  };

  return (
    <>
      <AppBar title="AI 리서처" sub="출처와 함께 찾습니다" onBack={() => router.push("/tools")} />

      <Body dense>
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

        <div className="mb-1 flex items-center gap-2">
          <SecTitle note="출처가 없는 결과는 보여주지 않습니다" className="m-0 flex-1">
            결과 {results.length}건
          </SecTitle>
          <Chip tone="warn" icon="flask-conical">
            샘플 결과
          </Chip>
        </div>

        <div className="mt-2 mb-4 flex flex-col gap-[9px]">
          {results.map((result) => (
            <Panel key={result.id} s="card" pad={14} r={16}>
              <div className="keep-all font-bold text-[14.5px] leading-[1.4] text-txt-strong">
                {result.title}
              </div>
              <div className="mt-1 font-mono font-semibold text-[12.5px] leading-[1.4] text-link">
                {result.source}
              </div>
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
          검색 결과의 최신성·신뢰도를 어떻게 걸러낼지, 원문 링크를 그대로 보여줄지가 기획안에 없어
          다루지 않았습니다.
        </Undecided>
      </Body>
    </>
  );
}
