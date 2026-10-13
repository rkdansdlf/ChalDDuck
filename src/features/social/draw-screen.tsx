"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import {
  AppBar,
  Body,
  Btn,
  Chip,
  DiceClashStage,
  DrawStage,
  Icon,
  Note,
  Toast,
  type IconName,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import type { DiceClashRound, RandomTool } from "@/lib/types";
import { useAction } from "@/lib/use-action";
import { rollDiceClash, saveDrawOptions, shareDrawToChat, spinMenu } from "@/server/actions/social";

/**
 * 이 화면이 어디까지 왔는지.
 *
 * 세 단계로 나눈 이유는 **각 단계의 소유자가 다르기 때문**이다. `waiting` 의 끝은 서버가
 * 정하고, `rolling` 의 끝은 연출(=`DrawStage`·`DiceClashStage`, 자기 타이머)이 정하고,
 * `done` 은 사람이 다음을 누를 때까지다.
 */
type Spin =
  | { at: "waiting" }
  | { at: "rolling"; tool: RandomTool; pick: string; rounds?: DiceClashRound[] }
  | { at: "done"; tool: RandomTool; pick: string; rounds?: DiceClashRound[] };

/**
 * 29 친목 · 팀 추첨.
 *
 * **결정은 팀에 하나다.** 서버가 한 번 뽑아 저장하고 모두가 그 값을 본다.
 *
 * 후보는 **목록 하나**다. 정하고 싶은 것을 직접 적는다 — 기본값도 예시도 없다.
 * 목록을 바꾸면 팀에 바로 저장되므로, 다음에 들어온 팀원도 같은 목록을 본다.
 * 도구는 룰렛·주사위·제비뽑기·사다리타기 네 가지인데, 주사위만 후보 뽑기가 아니라
 * 팀원 전원이 굴려 눈이 가장 높은 사람이 이기는 게임이다.
 */
export function DrawScreen({
  options,
  tools,
  tool,
  members = [],
}: {
  /** 팀의 추첨 후보 — 팀이 적어 둔 값 그대로. 없으면 빈 목록이다. */
  options: string[];
  tools: RandomTool[];
  /** 팀이 마지막으로 쓴 도구. 없으면 목록의 첫 도구다. */
  tool: string | null;
  members?: string[];
}) {
  const router = useRouter();
  const { toast, busy, run } = useAction();

  const [spin, setSpin] = useState<Spin | null>(null);
  const [toolKey, setToolKey] = useState<string>(tool ?? tools[0]?.key ?? "roulette");

  /** 팀의 후보 목록. 바꾸면 서버에 바로 저장된다 — 팀에 하나이므로. */
  const [list, setList] = useState<string[]>(options);
  /** 추첨에서 뺀 후보. 저장하지 않는다 — 이번 돌림에만 적용되는 가벼운 제외다. */
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [newLabel, setNewLabel] = useState("");
  const [shared, setShared] = useState(false);

  /**
   * 서버 값이 바뀌면(다른 팀원이 목록을 고쳤다) 따라간다. 제외 표는 남은 후보에만
   * 남긴다 — 사라진 후보의 제외는 의미가 없다. 렌더 중에 조정한다(이펙트가 아니라):
   * 내용이 같으면 손대지 않으므로 연출·입력 도중에 덮어쓰지 않는다.
   */
  const optionsKey = JSON.stringify(options);
  const [syncedKey, setSyncedKey] = useState(optionsKey);
  if (optionsKey !== syncedKey) {
    setSyncedKey(optionsKey);
    setList(options);
    setExcluded((prev) => new Set([...prev].filter((name) => options.includes(name))));
  }

  const fired = useRef(false);

  const chosen = tools.find((t) => t.key === toolKey);
  const spinning = spin !== null && spin.at !== "done";
  /**
   * 이번에 돌려 끝낸 결과. 저장된 지난 결과는 첫 화면에 보여주지 않는다 —
   * 들어오자마자 옛 당첨이 뜨면 "지금 정한 것"으로 읽힌다. 돌린 뒤의 표시는
   * 이 자리에서 끝낸 것에만 붙는다.
   */
  const doneResult = spin !== null && spin.at === "done" ? spin : null;

  const activeCandidates = useMemo(() => list.filter((item) => !excluded.has(item)), [list, excluded]);
  const candidates = useMemo(() => activeCandidates.map((name) => ({ name })), [activeCandidates]);

  /**
   * 주사위는 후보 뽑기가 아니라 전원 굴림이다. 후보 목록과 무관하게 팀원 전원이
   * 굴리고 눈이 가장 높은 사람이 이긴다(`rollDiceClash`) — 서버가 팀원 명단으로 굴린다.
   */
  const isDiceMode = chosen?.key === "dice";
  /** 이번 굴림의 라운드 — 연출과 단톡방 공유가 같은 값을 본다. */
  const spinRounds = spin !== null && spin.at !== "waiting" ? (spin.rounds ?? null) : null;

  /** 실패해도 반드시 빠져나갈 수 있는 유일한 자리 — 실제 실패는 `run` 의 `false` 다. */
  const release = (ok: boolean) => {
    if (ok) return;
    fired.current = false;
    setSpin(null);
  };

  /** 후보 토글 (제외 / 포함) — 둘은 남긴다. 하나면 추첨이 아니라 지명이다. */
  const toggleCandidate = (name: string) => {
    if (spinning) return;
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        if (list.length - next.size <= 2) return prev;
        next.add(name);
      }
      return next;
    });
  };

  /** 후보 추가 — 곧바로 팀에 저장한다. 실패하면 화면도 되돌린다. */
  const handleAddCandidate = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newLabel.trim();
    if (!trimmed || spinning || list.includes(trimmed)) return;
    const prev = list;
    const next = [...prev, trimmed];
    setList(next);
    setNewLabel("");
    void run("edit", () => saveDrawOptions(next), "추가하지 못했습니다.").then((ok) => {
      if (!ok) {
        setList(prev);
        setNewLabel(trimmed);
      }
      router.refresh();
    });
  };

  /** 후보 지우기 — 다 지우면 빈 목록이다. 실패하면 화면도 되돌린다. */
  const handleRemoveCandidate = (name: string) => {
    if (spinning) return;
    const prev = list;
    const next = prev.filter((item) => item !== name);
    setList(next);
    setExcluded((old) => {
      const copy = new Set(old);
      copy.delete(name);
      return copy;
    });
    void run("edit", () => saveDrawOptions(next), "지우지 못했습니다.").then((ok) => {
      if (!ok) setList(prev);
      router.refresh();
    });
  };

  // 추첨 실행 — 주사위는 전원 굴림, 나머지는 후보 중 하나를 뽑는다.
  const spinMenuPick = () => {
    if (fired.current || !chosen || spinning) return;
    if (chosen.key === "dice") {
      const toolToUse = chosen;
      fired.current = true;
      setSpin({ at: "waiting" });
      setShared(false);

      void run(
        "spin",
        async () => {
          const result = await rollDiceClash();
          setSpin({ at: "rolling", tool: toolToUse, pick: result.winner, rounds: result.rounds });
          router.refresh();
        },
        "굴리지 못했습니다. 잠시 뒤 다시 눌러 주세요.",
      ).then(release);
      return;
    }
    if (activeCandidates.length < 2) return;
    const toolToUse = chosen;
    fired.current = true;
    setSpin({ at: "waiting" });
    setShared(false);

    void run(
      "spin",
      async () => {
        const picked = await spinMenu(toolToUse.name, activeCandidates);
        setSpin({ at: "rolling", tool: toolToUse, pick: picked });
        router.refresh();
      },
      "정하지 못했습니다. 잠시 뒤 다시 눌러 주세요.",
    ).then(release);
  };

  const onLanded = () => {
    fired.current = false;
    setSpin((prev) =>
      prev?.at === "rolling" ? { at: "done", tool: prev.tool, pick: prev.pick, rounds: prev.rounds } : prev,
    );
  };

  // 팀 단톡방에 공유하기 — 주사위는 마지막 라운드의 참가자를 후보로 적는다.
  const handleShareToChat = async () => {
    if (!doneResult || shared) return;
    const shareCandidates =
      doneResult.rounds && doneResult.rounds.length > 0
        ? (doneResult.rounds[doneResult.rounds.length - 1]?.rolls.map((r) => `${r.name}(${r.value})`) ?? [])
        : activeCandidates;
    await run(
      "share",
      async () => {
        const res = await shareDrawToChat({
          title: doneResult.tool.key === "dice" ? "주사위 게임" : "팀 추첨",
          toolName: doneResult.tool.name,
          pick: doneResult.pick,
          candidates: shareCandidates,
        });
        if (res.ok) {
          setShared(true);
        } else {
          throw new Error(res.error);
        }
      },
      "단톡방 공유에 실패했습니다.",
    );
  };

  return (
    <>
      <AppBar title="팀 추첨" sub={isDiceMode ? "주사위 게임" : "식사 메뉴 정하기"} onBack={() => router.push("/team")} />

      <Body dense className="flex flex-col">
        <p className="text-pretty-keep mt-1 mb-[18px] text-[14.5px] leading-[1.62] text-txt">
          여기서 정한 건 <b>팀에 하나</b>입니다. 후보를 직접 정할 수 있고, 바꾸면 팀 전체에 바로
          적용됩니다. 순위는 매기지 않습니다.
        </p>

        <p className="t-note-title keep-all mb-[9px] text-txt-strong">무엇으로 정할까요</p>
        <div className="mb-[18px] grid grid-cols-2 gap-[9px]">
          {tools.map((t) => {
            const on = t.key === toolKey;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setToolKey(t.key)}
                disabled={spinning}
                // 색만으로 "고른 것"을 말하지 않는다(공통 규칙) — 고른 타일에 체크를 함께 둔다.
                aria-pressed={on}
                className={cn(
                  "relative flex min-h-[76px] flex-col items-center justify-center gap-[7px] rounded-2xl border transition-colors duration-150",
                  on ? "border-line-strong bg-yellow-100 text-ink-900" : "border-line bg-card text-txt-strong",
                  spinning ? "cursor-default" : "cursor-pointer active:scale-[0.97]",
                )}
              >
                {on ? (
                  <span className="absolute right-2.5 top-2.5 text-yellow-700">
                    <Icon name="check" size={13} />
                  </span>
                ) : null}
                <Icon name={t.icon as IconName} size={24} />
                <span className="font-bold text-[14px] leading-none">{t.name}</span>
              </button>
            );
          })}
        </div>

        <div
          // 결과가 바뀌면 스크린 리더가 읽어 준다 — 애니메이션만으로는 알 수 없다.
          role="status"
          className="mb-[18px] flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-card bg-yellow-100 px-4 py-3 text-center transition-all duration-300"
        >
          {spin === null ? (
            toolKey === "ladder" && activeCandidates.length >= 2 ? (
              <div className="flex w-full flex-col items-center">
                <span className="t-cap-strong mb-1 text-yellow-700">🪜 사다리 발판 준비 완료</span>
                <DrawStage toolKey="ladder" candidates={candidates} preview />
              </div>
            ) : (
              <span className="font-semibold text-[14px] leading-[1.4] text-yellow-700">
                버튼을 눌러 정해요
              </span>
            )
          ) : spin.at === "waiting" ? (
            <div className="flex flex-col items-center gap-2">
              <span className="animate-spin text-yellow-700">
                <Icon name="loader-circle" size={26} />
              </span>
              <span className="font-extrabold text-[22px] leading-[1.3] text-ink-800 animate-pulse">
                고르는 중…
              </span>
            </div>
          ) : spin.tool.key === "dice" && spinRounds ? (
            <DiceClashStage rounds={spinRounds} winner={spin.pick} onLanded={onLanded} />
          ) : (
            <DrawStage toolKey={spin.tool.key} candidates={candidates} winner={spin.pick} onLanded={onLanded} />
          )}
        </div>

        {doneResult ? (
          <div className="mb-[18px] flex flex-col gap-2">
            <Note tone="info" icon="users-round">
              지금 정해진 건 <b>{doneResult.pick}</b> (<b>{doneResult.tool.name}</b>로) 입니다. 다시
              돌리면 전체가 함께 바뀝니다 — 지금 정한 대로 갈 수도 있습니다.
            </Note>

            <button
              type="button"
              onClick={handleShareToChat}
              disabled={busy.share || shared}
              className={cn(
                "flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border px-3 text-[14px] font-bold transition-all",
                shared
                  ? "border-ok bg-ok-bg text-ok cursor-default"
                  : "border-line bg-card text-txt-strong hover:bg-fill active:scale-[0.98] cursor-pointer",
              )}
            >
              <Icon name={shared ? "check" : "share-2"} size={16} />
              <span>{shared ? "단톡방에 공유 완료" : "팀 단톡방에 결과 공유하기"}</span>
            </button>
          </div>
        ) : null}

        {isDiceMode ? (
          <div className="mb-[18px]">
            <p className="t-note-title mb-2 text-txt-strong">참가자 ({members.length}명 전원)</p>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {members.map((name) => (
                <Chip key={name}>{name}</Chip>
              ))}
            </div>
            <Note tone="info" icon="dices">
              버튼을 누르면 <b>전원이 한 번씩 굴리고</b>, 눈이 가장 높은 사람이 이깁니다. 동점이면
              동점자끼리 다시 굴립니다.
            </Note>
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between">
              <p className="t-note-title text-txt-strong">
                {list.length === 0 ? "추첨 후보" : `추첨 후보 (${activeCandidates.length}개 선택됨)`}
              </p>
              {list.length > 0 ? (
                <span className="text-[12px] text-txt-muted">칩을 눌러 제외/포함</span>
              ) : null}
            </div>

            {list.length === 0 ? (
              <Note tone="info" icon="ticket" className="mb-3">
                아직 후보가 없습니다. 아래에 <b>두 개 이상</b> 적으면 바로 추첨할 수 있습니다.
              </Note>
            ) : (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {list.map((item) => {
                  const isExcluded = excluded.has(item);
                  const isWinner = doneResult !== null && item === doneResult.pick;
                  return (
                    <span key={item} className={cn("inline-flex items-center", isExcluded && "opacity-60")}>
                      <button
                        type="button"
                        onClick={() => toggleCandidate(item)}
                        disabled={spinning}
                        aria-pressed={!isExcluded}
                        title={isExcluded ? "다시 포함하기" : "이번 추첨에서 빼기"}
                        className="cursor-pointer transition-all active:scale-95 disabled:cursor-default"
                      >
                        <Chip tone={isWinner && !isExcluded ? "y" : undefined}>
                          <span className={cn(isExcluded && "line-through")}>{item}</span>
                        </Chip>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveCandidate(item)}
                        disabled={spinning || Boolean(busy.edit)}
                        aria-label={`${item} 지우기`}
                        className="ml-0.5 cursor-pointer rounded-full p-1 text-txt-faint hover:text-txt disabled:cursor-default disabled:opacity-40"
                      >
                        <Icon name="x" size={12} />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            <form onSubmit={handleAddCandidate} className="mb-[18px] flex gap-2">
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                disabled={spinning || Boolean(busy.edit)}
                placeholder={chosen?.key === "ladder" ? "사다리에 올릴 항목 추가 (예: 커피 사기, 1조)" : "새 후보 추가"}
                maxLength={20}
                aria-label="새 후보"
                className="flex-1 rounded-xl border border-line bg-card px-3 py-2 text-[13.5px] text-txt-strong outline-none focus:border-yellow-500"
              />
              <Btn type="submit" size="sm" v="outline" icon="plus" disabled={!newLabel.trim() || spinning}>
                추가
              </Btn>
            </form>

            {list.length > 0 && activeCandidates.length < 2 ? (
              <p className="mb-3 text-center text-xs font-semibold text-coral-600">
                추첨을 하려면 후보가 2개 이상 선택되어 있어야 합니다.
              </p>
            ) : null}
          </>
        )}

        <Btn
          full
          size="lg"
          icon={(chosen?.icon ?? "dices") as IconName}
          onClick={spinMenuPick}
          disabled={busy.spin || spinning || !chosen || (!isDiceMode && activeCandidates.length < 2)}
        >
          {spinning
            ? isDiceMode
              ? "굴리는 중…"
              : "정하는 중…"
            : isDiceMode
              ? doneResult
                ? "다시 전원 굴리기"
                : "전원 주사위 굴리기"
              : doneResult
                ? "다른 거로 다시 정하기"
                : `${chosen?.name ?? "제비뽑기"}로 정하기`}
        </Btn>
      </Body>

      <Toast msg={toast} />
    </>
  );
}
