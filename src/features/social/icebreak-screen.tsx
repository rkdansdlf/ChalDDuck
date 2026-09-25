"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AppBar,
  Body,
  Btn,
  Chip,
  Dock,
  Icon,
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
import type { IceGame, IceGameKey, IceRole, IceView } from "@/lib/types";
import {
  castIceVote,
  closeIceVote,
  endIceRound,
  markIceNightOut,
  pollIce,
  startIceRound,
  type IceResult,
} from "@/server/actions/ice";

/**
 * 28 아이스브레이킹 — 라이어 게임·마피아.
 *
 * 둘 다 **각자 자기 폰으로 자기 카드만 보고, 대화는 한자리(회의·단톡방)에서** 하는 게임이다.
 * 앱은 비밀을 나누고, 투표를 받고, 결과를 공개하는 일만 한다. 비밀은 서버가 나누고
 * 보는 사람마다 자기 것만 내려보낸다(`server/ice/view.ts`).
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

export function IceBreakScreen({ games, initial }: { games: IceGame[]; initial: IceView | null }) {
  const router = useRouter();
  const [view, setView] = useState<IceView | null>(initial);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    let inFlight = false;
    const tick = async () => {
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        setView(await pollIce());
      } catch {
        // 다음 차례에 다시 묻는다 — 화면은 마지막으로 받은 모습을 그대로 둔다.
      } finally {
        inFlight = false;
      }
    };
    const timer = window.setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  /** 액션은 바뀐 뒤의 내 화면을 돌려준다 — 다음 폴링을 기다리지 않는다. */
  const run = async (action: () => Promise<IceResult>) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await action();
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
        <Picker games={games} busy={busy} onStart={(key) => run(() => startIceRound(key))} />
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
  busy,
  onStart,
}: {
  games: IceGame[];
  busy: boolean;
  onStart: (key: IceGameKey) => void;
}) {
  const [picked, setPicked] = useState<IceGameKey | null>(null);
  const game = games.find((g) => g.key === picked) ?? null;

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
            <Note tone="info" icon="eye-off" className="mb-3">
              시작하면 팀원 모두에게 알림이 가고, 각자 폰에서 <b>자기 카드만</b> 볼 수 있습니다. 여는
              사람이 사회자가 됩니다.
            </Note>
          </>
        ) : null}

        <Undecided>
          게임 목록(라이어 게임·마피아), 최소 인원(라이어 3명·마피아 4명), 마피아 역할 구성(4~5명은
          마피아 1·경찰 1, 6명부터 마피아 2·경찰 1·의사 1), 라이어 제시어 목록은 기획안에 없어 임시로
          정했습니다.
        </Undecided>
      </Body>

      {game?.playable ? (
        <Dock>
          <Btn full size="lg" icon="dices" disabled={busy} onClick={() => onStart(game.key)}>
            {busy ? "카드 나누는 중…" : `${game.name} 시작하기`}
          </Btn>
        </Dock>
      ) : null}
    </>
  );
}

/* ── 판이 열린 뒤 ─────────────────────────────────────────────── */

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
  const mafia = view.game === "mafia";
  const playing = view.phase === "play";
  const canVote = playing && view.me !== null && view.me.alive;

  return (
    <>
      <Body dense>
        {view.me ? (
          <SecretCard key={view.roundId} me={view.me} game={view.game} />
        ) : (
          <Note tone="info" icon="eye" className="mb-4">
            판이 시작된 뒤에 들어와 이번 판은 <b>구경만</b> 할 수 있습니다. 다음 판부터 함께할 수 있습니다.
          </Note>
        )}

        {view.result ? <ResultPanel view={view} /> : null}

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

        {playing ? (
          <>
            <SecTitle note={`${view.votes.cast} / ${view.votes.total}명 투표함`}>
              {mafia ? "탈락시킬 사람" : "라이어라고 생각하는 사람"}
            </SecTitle>
            <Rows className="mb-3">
              {view.players.map((p) => {
                const isMe = p.id === view.meId;
                const chosen = view.me?.voteForId === p.id;
                const disabled = !canVote || isMe || !p.alive || busy;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={chosen}
                    disabled={disabled}
                    onClick={() => run(() => castIceVote(p.id))}
                    className={cn(
                      "box-border flex min-h-[52px] w-full items-center gap-3 border-none px-[15px] py-3 text-left",
                      chosen ? "bg-yellow-100" : "bg-transparent",
                      disabled ? "cursor-default" : "cursor-pointer",
                    )}
                  >
                    <span className={cn("t-label flex-1", p.alive ? "text-txt-strong" : "text-txt-faint line-through")}>
                      {p.name}
                      {isMe ? <span className="t-cap ml-1.5 text-txt-muted">나</span> : null}
                    </span>
                    {chosen ? (
                      <Chip tone="y" icon="check">
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
              누가 누구를 골랐는지는 {mafia ? "투표를 마감할 때까지" : "결과를 공개할 때까지"} 보이지 않습니다.
              같은 사람을 다시 누르면 취소됩니다.
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
            {playing
              ? `${mafia ? "투표 마감은" : "결과 공개는"} 사회자 ${view.hostName}님이 합니다.`
              : `다음 판은 사회자 ${view.hostName}님이 이 판을 끝내면 열 수 있습니다.`}
          </p>
        ) : null}
      </Body>

      {view.canHost ? (
        <Dock>
          {playing ? (
            <Btn full size="lg" icon={mafia ? "thumbs-up" : "eye"} disabled={busy} onClick={() => run(closeIceVote)}>
              {mafia ? "투표 마감하기" : "결과 공개하기"}
            </Btn>
          ) : (
            <Btn full size="lg" icon="rotate-ccw" disabled={busy} onClick={() => run(endIceRound)}>
              이 판 끝내기
            </Btn>
          )}
          {playing ? (
            <Btn full v="ghost" size="sm" disabled={busy} onClick={() => run(endIceRound)}>
              결과 없이 {gameName(games, view.game)} 그만하기
            </Btn>
          ) : null}
        </Dock>
      ) : null}

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
 * 내 카드. **처음에는 가려 둔다** — 한자리에 모여 폰을 들고 있으면 옆 사람 화면이 보인다.
 * 판이 바뀌면(`key`) 다시 가린다.
 */
function SecretCard({ me, game }: { me: NonNullable<IceView["me"]>; game: IceGameKey }) {
  const [shown, setShown] = useState(false);

  return (
    <Panel s={shown ? "yellow" : "fill"} pad={18} r={18} className="mb-4 text-center">
      <div className="t-cap-strong mb-2 text-txt-muted">내 카드</div>
      {shown ? (
        <>
          <div className="t-h1-sm text-ink-900">{ROLE_LABEL[me.role]}</div>
          {game === "liar" ? (
            <p className="t-body m-0 mt-2 text-txt">
              주제 <b>{me.topic}</b>
              {me.word ? (
                <>
                  {" "}
                  · 제시어 <b>{me.word}</b>
                </>
              ) : (
                <> · 제시어를 모릅니다. 들키지 않게 설명해 보세요.</>
              )}
            </p>
          ) : me.allies.length > 0 ? (
            <p className="t-body m-0 mt-2 text-txt">
              같은 편 마피아: <b>{me.allies.join(", ")}</b>
            </p>
          ) : null}
          {!me.alive ? (
            <div className="mt-2">
              <Chip icon="user-minus">탈락했습니다 — 말하지 않고 지켜봐 주세요</Chip>
            </div>
          ) : null}
        </>
      ) : (
        <p className="t-note m-0 text-txt-muted">옆 사람이 보지 않을 때 여세요.</p>
      )}
      <Btn size="sm" v="outline" icon={shown ? "eye-off" : "eye"} className="mt-3" onClick={() => setShown(!shown)}>
        {shown ? "카드 가리기" : "내 카드 보기"}
      </Btn>
    </Panel>
  );
}

function ResultPanel({ view }: { view: IceView }) {
  const result = view.result!;
  return (
    <>
      <Panel s="yellow" pad={18} r={18} className="mb-3">
        <div className="t-cap-strong mb-1.5 text-yellow-700">결과</div>
        <p className="t-body-strong m-0 text-ink-900">{result.outcome}</p>
        {result.word ? (
          <p className="t-note m-0 mt-1.5 text-txt">
            이번 판의 제시어 · <b>{result.word}</b>
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
    </>
  );
}
