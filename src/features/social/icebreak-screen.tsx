"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { usePoll } from "@/lib/use-poll";
import {
  AppBar,
  Body,
  Btn,
  Chip,
  Dock,
  Icon,
  Input,
  Note,
  Panel,
  Rows,
  SecTitle,
  Sheet,
  Toast,
  Undecided,
  type IconName,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import type { IceGame, IceGameKey, IcePhase, IceRole, IceView } from "@/lib/types";
import {
  castIceVote,
  closeIceVote,
  endIceRound,
  markIceNightOut,
  pollIce,
  restartIceRound,
  startIceRound,
  startIceVote,
  submitLiarGuess,
  type IceResult,
} from "@/server/actions/ice";

/**
 * 28 아이스브레이킹 — 라이어 게임·마피아.
 *
 * 둘 다 **각자 자기 폰으로 자기 카드만 보고, 대화는 한자리(회의·단톡방)에서** 하는 게임이다.
 * 앱은 비밀을 나누고, 순서를 안내하고, 투표를 받고, 결과를 공개하는 일만 한다. 비밀은 서버가
 * 나누고 보는 사람마다 자기 것만 내려보낸다(`server/ice/view.ts`).
 *
 * ## 라이어 판은 네 단계로 간다
 *
 * ```
 * clue  카드 확인        ← 투표가 아직 열리지 않는다
 * vote  비밀 투표
 * liar_guess 최종 추측   ← 라이어에게 제시어가 여기서도 내려가지 않는다
 * revealed 결과
 * ```
 *
 * 예전에는 `play` / `revealed` 두 단계뿐이라 ① 카드 확인 직후 투표가 열리고 ② 라이어에게
 * 마지막 추측을 받을 자리가 없었다. 두 가지 다 게임 규칙의 결함이었다.
 *
 * 다른 팀원이 판을 열거나 투표하면 몇 초 안에 보이도록 화면에 있는 동안만 묻는다.
 */
const POLL_MS = 3000;

const ROLE_LABEL: Record<IceRole, string> = {
  liar: "라이어",
  citizen: "시민",
  mafia: "마피아",
  police: "경찰",
  doctor: "의사",
};

export type IceRosterEntry = { id: string; name: string };

export function IceBreakScreen({
  games,
  initial,
  roster,
}: {
  games: IceGame[];
  initial: IceView | null;
  /** 이번 판에 앉을 사람 고르기용. 지금 팀에 남아 있는 사람 전부. */
  roster: IceRosterEntry[];
}) {
  const router = useRouter();
  const [view, setView] = useState<IceView | null>(initial);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3000);
  };

  /**
   * 내가 직접 뭔가를 한 횟수.
   *
   * 폴링의 `inFlight` 는 **요청이 겹치는 것**만 막는다. 내가 투표하는 순간 진행 중이던
   * 폴링은 투표 **전** 시점의 화면을 들고 돌아오므로, 그 결과가 나중에 풀려 나면 방금
   * 고른 것까지 되돌린다 — "내 선택" 칩이 잠깐 떴다가 사라지고, 다음 3초 뒤에야 다시 뜬다.
   * 읽는 사람에게는 "내 표가 안 먹혔다"로 보인다.
   *
   * 그래서 폴링을 시작할 때 이 값을 기억해 두고, **그 사이에 내가 아무것도 하지 않았다면
   * 만** 결과를 반영한다. 액션이 갱신할 때마다 하나씩 올리면 된다.
   */
  const acted = useRef(0);

  usePoll(
    async () => {
      const stamp = acted.current;
      const next = await pollIce();
      // 그 사이에 내가 뭔가를 했다면 이 결과는 이미 과거다 — 덮어쓰지 않는다.
      if (stamp === acted.current) setView(next);
    },
    POLL_MS,
  );

  /** 액션은 바뀐 뒤의 내 화면을 돌려준다 — 다음 폴링을 기다리지 않는다. */
  const run = async (action: () => Promise<IceResult>) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await action();
      // 진행 중이던 폴링 결과는 이제 전부 과거다 — 다음 폴링이 새 값을 물어온다.
      acted.current += 1;
      setView(result.view);
      if (result.message) flash(result.message);
    } catch {
      flash("처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AppBar
        title="아이스브레이킹"
        sub={view ? `${gameName(games, view.game)} · 사회자 ${view.hostName}` : "팀 분위기를 풀어보는 시간"}
        onBack={() => router.push("/team")}
      />

      {view ? (
        <RoundView games={games} view={view} busy={busy} run={run} />
      ) : (
        <Picker games={games} roster={roster} busy={busy} onStart={(key, ids) => run(() => startIceRound(key, ids))} />
      )}

      <Toast msg={toast} />
    </>
  );
}

function gameName(games: IceGame[], key: IceGameKey) {
  return games.find((g) => g.key === key)?.name ?? "";
}

/* ── 판을 열기 전 — 게임 고르기 ──────────────────────────────── */

function Picker({
  games,
  roster,
  busy,
  onStart,
}: {
  games: IceGame[];
  roster: IceRosterEntry[];
  busy: boolean;
  onStart: (key: IceGameKey, ids: string[]) => void;
}) {
  const [picked, setPicked] = useState<IceGameKey | null>(null);
  const [ids, setIds] = useState<string[]>(() => roster.map((m) => m.id));
  const game = games.find((g) => g.key === picked) ?? null;

  const toggle = (id: string) => setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const tooFew = game !== null && ids.length < game.minPlayers;

  return (
    <>
      <Body dense>
        <div role="radiogroup" aria-label="게임 고르기" className="mb-4 flex flex-col gap-2">
          {games.map((item) => {
            const on = picked === item.key;
            return (
              <button
                key={item.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setPicked(item.key)}
                className={cn(
                  "box-border flex w-full cursor-pointer items-center gap-3 rounded-2xl px-[15px] py-[13px] text-left",
                  on ? "border-[1.5px] border-yellow-500 bg-yellow-100" : "border-[1.5px] border-line bg-card",
                )}
              >
                <span className="grid size-[38px] flex-none place-items-center rounded-xl bg-fill text-txt-muted">
                  <Icon name={item.icon as IconName} size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="t-label block text-txt-strong">{item.name}</span>
                  <span className="t-cap keep-all mt-0.5 block text-txt-muted">
                    {item.desc} · {item.minPlayers}명부터
                  </span>
                </span>
                {item.playable ? null : <Chip icon="circle-dashed">준비 중</Chip>}
              </button>
            );
          })}
        </div>

        {game ? (
          <>
            <SecTitle>게임 방법</SecTitle>
            <Panel s="fill" className="mb-3">
              <ol className="t-note m-0 flex list-decimal flex-col gap-1.5 pl-5 text-txt">
                {game.howTo.map((line) => (
                  <li key={line} className="text-pretty-keep">
                    {line}
                  </li>
                ))}
              </ol>
            </Panel>

            {/*
              참가자를 고르는 이유를 화면에도 적는다. 예전에는 팀에 등록된 사람 **전원**이
              자동으로 들어와, 오늘 회의에 오지 않은 사람이 라이어가 되는 일이 실제로 났다.
            */}
            <SecTitle note={`${ids.length}명 참가`}>이번 판에 참여하는 사람</SecTitle>
            <Panel s="fill" className="mb-3">
              <div role="group" aria-label="이번 판에 참여하는 사람" className="flex flex-col">
                {roster.map((m) => {
                  const on = ids.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggle(m.id)}
                      className="flex min-h-[48px] cursor-pointer items-center gap-3 border-none bg-transparent px-1 py-2 text-left"
                    >
                      <span
                        className={cn(
                          "grid size-[22px] flex-none place-items-center rounded-md text-ink-900 transition-all duration-150",
                          on ? "scale-105 border-[1.5px] border-transparent bg-yellow-400" : "border-[1.5px] border-line-strong bg-card",
                        )}
                      >
                        {on ? (
                          <span className="animate-pop inline-flex">
                            <Icon name="check" size={14} />
                          </span>
                        ) : null}
                      </span>
                      <span className={cn("t-body flex-1", on ? "text-txt-strong" : "text-txt-faint line-through")}>
                        {m.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Panel>

            {tooFew ? (
              <Note tone="warn" icon="user-minus" className="mb-3">
                {game.name}은 <b>{game.minPlayers}명</b>부터 진행할 수 있습니다. 지금 {ids.length}명입니다.
              </Note>
            ) : (
              <Note tone="info" icon="eye-off" className="mb-3">
                고른 {ids.length}명에게 알림이 가고, 각자 폰에서 <b>자기 카드만</b> 볼 수 있습니다. 여는
                사람이 사회자가 됩니다.
              </Note>
            )}
          </>
        ) : null}

        <Undecided>
          게임 목록(라이어 게임·마피아), 최소 인원(둘 다 3명), 마피아 역할 구성(3명은 마피아 1·의사 1,
          4~5명은 마피아 1·경찰 1, 6명부터 마피아 2·경찰 1·의사 1), 라이어 제시어 목록은 기획안에
          없어 임시로 정했습니다.
        </Undecided>
      </Body>

      {game?.playable ? (
        <Dock>
          <Btn
            full
            size="lg"
            icon="dices"
            disabled={busy || tooFew}
            onClick={() => onStart(game.key, ids)}
          >
            {busy ? "카드 나누는 중…" : tooFew ? `${game.minPlayers}명 이상 고르세요` : `${game.name} 시작하기`}
          </Btn>
        </Dock>
      ) : null}
    </>
  );
}

/* ── 판이 열린 뒤 ─────────────────────────────────────────────── */

/** 이번 판이 어디까지 왔는지. 라이어는 네 단계, 마피아는 두 단계. */
function phaseOf(view: IceView): { step: number; total: number; label: string } {
  if (view.game === "mafia") {
    return view.phase === "revealed"
      ? { step: 2, total: 2, label: "결과" }
      : { step: 1, total: 2, label: "진행 중" };
  }
  const order: IcePhase[] = ["clue", "vote", "liar_guess", "revealed"];
  const names: Record<IcePhase, string> = {
    clue: "카드 확인",
    vote: "투표",
    liar_guess: "최종 추측",
    revealed: "결과",
    play: "진행 중",
  };
  const step = order.indexOf(view.phase);
  return { step: step < 0 ? 0 : step, total: order.length, label: names[view.phase] };
}

function RoundView({
  games,
  view,
  busy,
  run,
}: {
  games: IceGame[];
  view: IceView;
  busy: boolean;
  run: (action: () => Promise<IceResult>) => Promise<void>;
}) {
  const [nightOpen, setNightOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const mafia = view.game === "mafia";
  const playing = view.phase !== "revealed";
  const voting = (mafia ? view.phase === "play" : view.phase === "vote") && view.me !== null && view.me.alive;
  const { step, total, label } = phaseOf(view);
  const name = gameName(games, view.game);

  return (
    <>
      <Body dense>
        <div className="mb-4 flex items-center gap-2">
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              aria-hidden
              className={cn(
                "h-[5px] flex-1 rounded-full transition-colors duration-300",
                i <= step ? "bg-yellow-500" : "bg-line",
              )}
            />
          ))}
          <span className="t-cap flex-none text-txt-muted">{label}</span>
        </div>

        {view.me ? (
          <SecretCard key={view.roundId} me={view.me} game={view.game} phase={view.phase} />
        ) : (
          <Note tone="info" icon="eye" className="mb-4">
            판이 시작된 뒤에 들어와 이번 판은 <b>구경만</b> 할 수 있습니다. 다음 판부터 함께할 수 있습니다.
          </Note>
        )}

        {/* 라이어에게 내려가는 마지막 기회. 여기서도 제시어는 화면에 없다. */}
        {view.phase === "liar_guess" ? <LiarGuessPanel view={view} busy={busy} run={run} /> : null}

        {view.result ? <ResultPanel view={view} /> : null}

        {/*
          설명 순서. **누가 말을 끝냈는지는 앱이 모른다** — 대화는 오프라인에서 하고 앱은
          순서만 알려 준다. "누가 먼저 하지" 로 한 번도 넘어가지 않게 하려고.
        */}
        {view.turn.length > 0 && view.phase !== "revealed" ? (
          <>
            <SecTitle>설명 순서</SecTitle>
            <Panel s="fill" className="mb-4">
              <ol className="m-0 flex list-none flex-col gap-0 p-0">
                {view.turn.map((p, i) => (
                  <li
                    key={p.id}
                    className={cn(
                      "t-body flex items-center gap-2.5 py-1.5",
                      p.id === view.meId ? "text-txt-strong" : "text-txt",
                    )}
                  >
                    <span className="t-cap w-[18px] flex-none text-txt-faint">{i + 1}.</span>
                    <span className={cn("flex-1", p.id === view.meId && "font-semibold")}>{p.name}</span>
                    {p.id === view.meId ? <Chip>나</Chip> : null}
                  </li>
                ))}
              </ol>
            </Panel>
          </>
        ) : null}

        {mafia && view.eliminated.length > 0 ? (
          <>
            <SecTitle>탈락한 사람</SecTitle>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {view.eliminated.map((out, i) => (
                <Chip key={out.name} icon={out.how === "night" ? "moon" : "thumbs-up"}>
                  {i + 1}. {out.name} · {out.how === "night" ? "밤" : "투표"}
                </Chip>
              ))}
            </div>
          </>
        ) : null}

        {/*
          라이어의 `clue` 단계에는 투표 목록을 아예 그리지 않는다. 눌러야 하는데 아무 일도
          일어나지 않는 것보다, 아직 하지 않은 단계임을 아는 편이 낫다.
        */}
        {voting || (playing && !mafia && view.phase === "clue") ? (
          <>
            <SecTitle note={view.phase === "clue" ? "아직 닫혀 있습니다" : `${view.votes.cast} / ${view.votes.total}명 투표함`}>
              {mafia ? "탈락시킬 사람" : "라이어라고 생각하는 사람"}
            </SecTitle>
            <Rows className="mb-3">
              {view.players.map((p) => {
                const isMe = p.id === view.meId;
                const chosen = view.me?.voteForId === p.id;
                const disabled = !voting || isMe || !p.alive || busy;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={chosen}
                    disabled={disabled}
                    onClick={() => run(() => castIceVote(p.id))}
                    className={cn(
                      "box-border flex min-h-[52px] w-full items-center gap-3 border-none px-[15px] py-3 text-left select-none transition-all duration-150",
                      chosen ? "bg-yellow-100 shadow-2xs" : "bg-transparent hover:bg-cr-50",
                      disabled ? "cursor-default" : "cursor-pointer active:scale-[0.985]",
                    )}
                  >
                    <span className={cn("t-label flex-1", p.alive ? "text-txt-strong" : "text-txt-faint line-through")}>
                      {p.name}
                      {isMe ? <span className="t-cap ml-1.5 text-txt-muted">나</span> : null}
                    </span>
                    {chosen ? (
                      <Chip tone="y" icon="check" iconClassName="animate-pop">
                        내 선택
                      </Chip>
                    ) : !p.alive ? (
                      <Chip icon="user-minus">탈락</Chip>
                    ) : null}
                  </button>
                );
              })}
            </Rows>
            <p className="t-cap m-0 mb-4 text-txt-muted">
              {view.phase === "clue"
                ? "설명이 끝나면 사회자가 투표를 엽니다. 설명하는 동안 카드를 다시 보지 마세요."
                : `누가 누구를 골랐는지는 ${mafia ? "투표를 마감할 때까지" : "결과를 공개할 때까지"} 보이지 않습니다. 같은 사람을 다시 누르면 취소됩니다.`}
            </p>
          </>
        ) : null}

        {view.canHost && mafia && playing ? (
          <Btn full v="outline" icon="moon" disabled={busy} onClick={() => setNightOpen(true)} className="mb-3">
            밤 결과 적기
          </Btn>
        ) : null}

        {!view.canHost ? (
          <p className="t-cap m-0 text-txt-muted">
            {view.phase === "liar_guess"
              ? `${view.hostName}님이 기다리고 있습니다. 라이어가 최종 답을 냅니다.`
              : view.phase === "revealed"
                ? `다음 판은 ${view.hostName}님이 이 판을 끝내면 열 수 있습니다.`
                : `${mafia ? "투표 마감은" : "결과 공개는"} 사회자 ${view.hostName}님이 합니다.`}
          </p>
        ) : null}
      </Body>

      {view.canHost ? (
        <Dock>
          {/* 라이어: 카드 확인 → 투표 열기 → 마감 → (결과). */}
          {!mafia && view.phase === "clue" ? (
            <Btn full size="lg" icon="thumbs-up" disabled={busy} onClick={() => run(startIceVote)}>
              투표 시작하기
            </Btn>
          ) : voting ? (
            <Btn full size="lg" icon="thumbs-up" disabled={busy} onClick={() => setCloseOpen(true)}>
              투표 마감하기
            </Btn>
          ) : view.phase === "liar_guess" ? (
            <Btn full size="lg" icon="eye" disabled>
              라이어의 답을 기다립니다
            </Btn>
          ) : view.phase === "revealed" ? (
            <Btn full size="lg" icon="rotate-ccw" disabled={busy} onClick={() => run(restartIceRound)}>
              한 판 더
            </Btn>
          ) : null}

          {view.phase === "revealed" ? (
            <Btn full v="ghost" size="sm" disabled={busy} onClick={() => run(endIceRound)}>
              이 판 끝내기
            </Btn>
          ) : (
            <Btn full v="ghost" size="sm" disabled={busy} onClick={() => run(endIceRound)}>
              결과 없이 {name} 그만하기
            </Btn>
          )}
        </Dock>
      ) : null}

      {/*
        전원이 투표하지 않았는데 마감하려 한다면 한 번 확인한다. 동점 · 0표는 승패가 아니라
        재투표가 되므로, 마감했을 때 무엇이 일어나는지 사용자가 미리 알고 있어야 한다.
      */}
      <Sheet open={closeOpen} title="투표 마감" onClose={() => setCloseOpen(false)}>
        <p className="t-note m-0 mb-3 text-txt">
          {view.votes.cast < view.votes.total ? (
            <>
              <b>{view.votes.total - view.votes.cast}명</b>이 아직 투표하지 않았습니다. 그래도 마감할까요? 마감하면{" "}
              {mafia ? "지금까지 모인 표로" : "지금까지 모인 표로"} 판이 진행됩니다.
            </>
          ) : (
            "모두가 투표했습니다. 표를 모아 진행합니다."
          )}
        </p>
        <p className="t-cap m-0 mb-3 text-txt-muted">
          동점이면 누구도 탈락하지 않습니다(라이어) — 다시 이야기한 뒤 다시 투표하면 됩니다.
        </p>
        <div className="flex gap-2">
          <Btn full v="outline" disabled={busy} onClick={() => setCloseOpen(false)}>
            더 기다리기
          </Btn>
          <Btn
            full
            disabled={busy}
            onClick={async () => {
              setCloseOpen(false);
              await run(closeIceVote);
            }}
          >
            마감하기
          </Btn>
        </div>
      </Sheet>

      <Sheet open={nightOpen} title="밤에 탈락한 사람" onClose={() => setNightOpen(false)}>
        <p className="t-note m-0 mb-3 text-txt">
          밤 진행은 사회자가 말로 합니다. 마피아에게 지목되고 의사가 살리지 못한 사람을 고르세요. 아무도
          탈락하지 않았으면 그냥 닫으면 됩니다.
        </p>
        <Rows>
          {view.players
            .filter((p) => p.alive)
            .map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={busy}
                onClick={async () => {
                  setNightOpen(false);
                  await run(() => markIceNightOut(p.id));
                }}
                className="t-label box-border flex min-h-[52px] w-full cursor-pointer items-center justify-between border-none bg-transparent px-[15px] py-3 text-left text-txt-strong"
              >
                {p.name}
                <Icon name="user-minus" size={17} className="text-txt-muted" />
              </button>
            ))}
        </Rows>
      </Sheet>
    </>
  );
}

/**
 * 라이어의 최종 추측.
 *
 * **라이어 본인이 입력한다.** 예전에는 "라이어가 제시어를 맞혀 보세요" 문구만 있고 받을 입구가
 * 없어서 사회자가 맞았다/틀렸다를 눌러야 했다. 그러면 사회자도 모르는 판을 임의로 확정하게
 * 된다. 서버가 판정하고 **한 번만** 받는다.
 */
function LiarGuessPanel({
  view,
  busy,
  run,
}: {
  view: IceView;
  busy: boolean;
  run: (action: () => Promise<IceResult>) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const me = view.me;
  const iAmLiar = me?.role === "liar";
  const submitted = me?.guessSubmitted ?? false;

  if (!me) return null;

  if (!iAmLiar) {
    return (
      <Note tone="info" icon="clock" className="mb-4">
        라이어로 지목된 사람이 최종 답을 내고 있습니다.
      </Note>
    );
  }

  if (submitted) {
    return (
      <Note tone="info" icon="check" className="mb-4">
        최종 답을 냈습니다. 결과를 기다리세요.
      </Note>
    );
  }

  return (
    <>
      <Panel s="yellow" pad={18} r={18} className="mb-3">
        <div className="t-cap-strong mb-1.5 text-yellow-700">당신이 라이어로 지목됐습니다</div>
        <p className="t-note m-0 text-txt">
          마지막 기회입니다. 주제 <b>{me.topic}</b>에서 지금 대화하고 있는 단어는 무엇이었을까요?
        </p>
      </Panel>
      <div className="mb-4">
        <Input
          value={text}
          onChange={setText}
          maxLength={20}
          placeholder="제시어를 적어 주세요"
          aria-label="제시어 최종 답"
        />
      </div>
      <Btn full size="lg" icon="send" disabled={busy || !text.trim()} onClick={() => run(() => submitLiarGuess(text))}>
        최종 답 제출
      </Btn>
    </>
  );
}

/**
 * 내 카드. **처음에는 가려 둔다** — 한자리에 모여 폰을 들고 있으면 옆 사람 화면이 보인다.
 * 판이 바뀌면(`key`) 다시 가린다.
 */
function SecretCard({
  me,
  game,
  phase,
}: {
  me: NonNullable<IceView["me"]>;
  game: IceGameKey;
  phase: IcePhase;
}) {
  const [shown, setShown] = useState(false);

  return (
    <Panel s={shown ? "yellow" : "fill"} pad={18} r={18} className="mb-4 text-center transition-all duration-300">
      <div className="t-cap-strong mb-2 text-txt-muted">내 카드</div>
      {shown ? (
        <div className="animate-pop">
          <div className="t-h1-sm text-ink-900 font-extrabold animate-jelly">{ROLE_LABEL[me.role]}</div>
          {game === "liar" ? (
            <p className="t-body m-0 mt-2 text-txt animate-slide-up">
              주제 <b>{me.topic}</b>
              {me.word ? (
                <>
                  {" "}
                  · 제시어 <b>{me.word}</b>
                </>
              ) : phase === "revealed" ? null : (
                <> · 제시어를 모릅니다. 들키지 않게 설명해 보세요.</>
              )}
            </p>
          ) : me.allies.length > 0 ? (
            <p className="t-body m-0 mt-2 text-txt animate-slide-up">
              같은 편 마피아: <b>{me.allies.join(", ")}</b>
            </p>
          ) : null}
          {!me.alive ? (
            <div className="mt-2">
              <Chip icon="user-minus">탈락했습니다 — 말하지 않고 지켜봐 주세요</Chip>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="t-note m-0 text-txt-muted">옆 사람이 보지 않을 때 여세요.</p>
      )}
      <Btn size="sm" v={shown ? "ghost" : "outline"} icon={shown ? "eye-off" : "eye"} className="mt-3" onClick={() => setShown(!shown)}>
        {shown ? "카드 가리기" : "내 카드 슬쩍 보기"}
      </Btn>
    </Panel>
  );
}

function ResultPanel({ view }: { view: IceView }) {
  const result = view.result!;
  return (
    <div className="animate-slide-up">
      <Panel s="yellow" pad={18} r={18} className="mb-3">
        <div className="t-cap-strong mb-1.5 text-yellow-700">결과</div>
        <p className="t-body-strong m-0 text-ink-900">{result.outcome}</p>
        {result.word ? (
          <p className="t-note m-0 mt-1.5 text-txt">
            이번 판의 제시어 · <b>{result.word}</b>
          </p>
        ) : null}
        {result.guess ? (
          <p className="t-note m-0 mt-1.5 text-txt">
            라이어의 마지막 답 · <b>{result.guess.text}</b> {result.guess.correct ? "(맞음)" : "(틀림)"}
          </p>
        ) : null}
      </Panel>

      <SecTitle>모두의 카드</SecTitle>
      <Rows className="mb-3">
        {result.roles.map((r) => (
          <div key={r.name} className="flex min-h-[48px] items-center justify-between gap-3 px-[15px] py-2.5">
            <span className="t-label text-txt-strong">{r.name}</span>
            <Chip tone={r.role === "liar" || r.role === "mafia" ? "err" : "n"} icon={r.role === "liar" || r.role === "mafia" ? "drama" : "user-round"}>
              {ROLE_LABEL[r.role]}
            </Chip>
          </div>
        ))}
      </Rows>

      {result.tally.length > 0 ? (
        <>
          <SecTitle>{view.game === "mafia" ? "마지막 투표" : "투표 결과"}</SecTitle>
          <p className="t-note m-0 mb-4 text-txt">
            {result.tally.map((t) => `${t.name} ${t.votes}표`).join(" · ")}
          </p>
        </>
      ) : null}
    </div>
  );
}