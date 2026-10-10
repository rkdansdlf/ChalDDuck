"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { usePoll } from "@/lib/use-poll";
import {
  AppBar,
  AppFrame,
  Body,
  Btn,
  Dock,
  Icon,
  Input,
  Note,
  Panel,
  Progress,
  Toast,
} from "@/components/ui";
import { checkJoinApproval, joinTeam, type JoinBlock } from "@/server/actions/onboarding";
import { updateMemberEmail } from "@/server/actions/email-auth";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/cn";
import { ROLE_DECISION_HOW } from "@/features/roles/copy";
import type { Role, RoleKey } from "@/lib/types";
import { resetOnboarding, setVeto, setWant, toDraft, useOnboarding } from "./onboarding-state";
import { useOnboardingGate } from "./use-onboarding-gate";

/**
 * 06 희망 역할 · Veto — 온보딩의 마지막 단계.
 *
 * 역할은 **희망·Veto·경험·가능한 시간**으로만 조율한다. MBTI 유형은 배정 계산에 들어가지 않는다.
 * 같은 역할을 희망이면서 동시에 피할 수는 없으므로, 한쪽에서 고른 역할은 다른 쪽에서 잠근다.
 */
export function RoleScreen({ roles }: { roles: Role[] }) {
  const router = useRouter();
  const { teamCode, want, veto } = useOnboarding();

  const [blocked, setBlocked] = useState<JoinBlock | null>(null);
  const { toast, busy, run } = useAction();
  /** 들어간 뒤 한 번만 보여 주는 재입장 코드. 서버에는 해시만 남아 다시 볼 수 없다. */
  const [issued, setIssued] = useState<{ rejoinCode: string; isLeader: boolean } | null>(null);

  const ready = useOnboardingGate(!issued);
  const [waiting, setWaiting] = useState(false);
  const [stopped, setStopped] = useState<"taken" | "limited" | null>(null);

  const handleToggleWant = (key: RoleKey) => {
    if (want === key) {
      setWant(null);
    } else {
      setWant(key);
      if (veto === key) setVeto(null);
    }
  };

  const handleToggleVeto = (key: RoleKey) => {
    if (veto === key) {
      setVeto(null);
    } else {
      setVeto(key);
      if (want === key) setWant(null);
    }
  };

  const submit = async () => {
    if (!want || busy.submit) return;
    await run(
      "submit",
      async () => {
        setBlocked(null);
        const result = await joinTeam(teamCode ?? "", toDraft());
        if (result.status === "name-taken") {
          const query = new URLSearchParams({ code: teamCode ?? "", name: toDraft().name });
          router.push(`/join/rejoin?${query}`);
          return;
        }
        if (result.status === "invalid") {
          setBlocked(result.reason);
          return;
        }
        if (result.status === "requested") {
          setWaiting(true);
          return;
        }
        if (result.status === "taken") {
          setStopped("taken");
          return;
        }
        if (result.status === "limited") {
          setStopped("limited");
          return;
        }
        resetOnboarding();
        setIssued({ rejoinCode: result.rejoinCode, isLeader: result.isLeader });
      },
      "알리지 못했습니다. 잠시 뒤 다시 눌러 주세요.",
    );
  };

  if (issued) return <RejoinCodePanel {...issued} onDone={() => router.push("/team")} />;
  if (!ready) return null;
  if (stopped) return <JoinStoppedPanel reason={stopped} onRetry={() => setStopped(null)} />;
  if (waiting) return <WaitingPanel name={toDraft().name} onIssued={setIssued} />;

  const wantRole = roles.find((r) => r.key === want);
  const vetoRole = roles.find((r) => r.key === veto);

  return (
    <AppFrame label="06 희망 역할 · Veto">
      <AppBar title="맡고 싶은 일" sub="4 / 4단계" onBack={() => router.back()} />
      <Body dense>
        <Progress step={4} total={4} className="mt-1 mb-4" />

        <h1 className="t-h1-sm keep-all m-0 mb-1.5 text-txt-strong">어떤 일을 맡고 싶나요?</h1>
        <p className="text-pretty-keep m-0 mb-4 text-[14.5px] leading-[1.55] text-txt">
          맡을 일은 꼭 하나, 피할 일은 하나까지 골라요.
        </p>

        <div className="divide-y divide-line/60 rounded-[18px] border border-line bg-card overflow-hidden">
          {roles.map((role) => {
            const isWant = want === role.key;
            const isVeto = veto === role.key;

            return (
              <div
                key={role.key}
                className="flex items-center justify-between gap-3 px-4 py-3.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-[15.5px] leading-[1.3] text-txt-strong">
                    {role.name}
                  </div>
                  <div className="keep-all mt-0.5 text-[13px] leading-[1.4] text-txt-muted">
                    {role.note}
                  </div>
                </div>

                <div className="flex flex-none items-center gap-1.5">
                  <button
                    type="button"
                    aria-pressed={isWant}
                    onClick={() => handleToggleWant(role.key as RoleKey)}
                    className={cn(
                      "flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition-all duration-150 cursor-pointer active:scale-95",
                      isWant
                        ? "border-want bg-ok-bg text-want font-bold shadow-sm"
                        : "border-line bg-card text-txt hover:bg-fill active:bg-fill",
                    )}
                  >
                    <Icon
                      name={isWant ? "check" : "thumbs-up"}
                      size={13.5}
                      strokeWidth={isWant ? 2.5 : 2}
                      className={isWant ? "animate-check-bounce" : undefined}
                    />
                    <span>맡을래요</span>
                  </button>

                  <button
                    type="button"
                    aria-pressed={isVeto}
                    onClick={() => handleToggleVeto(role.key as RoleKey)}
                    className={cn(
                      "flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition-all duration-150 cursor-pointer active:scale-95",
                      isVeto
                        ? "border-veto bg-err-bg text-veto font-bold shadow-sm"
                        : "border-line bg-card text-txt hover:bg-fill active:bg-fill",
                    )}
                  >
                    <Icon
                      name={isVeto ? "check" : "ban"}
                      size={13.5}
                      strokeWidth={isVeto ? 2.5 : 2}
                      className={isVeto ? "animate-check-bounce" : undefined}
                    />
                    <span>피할래요</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-2 text-[13px] leading-[1.5] text-txt-muted">
          <Icon name="lock" size={14} className="flex-none" />
          <span>{ROLE_DECISION_HOW.join(" ")}</span>
        </div>

        {blocked ? <JoinBlockedNote reason={blocked} onGoToTeam={() => router.push("/team")} /> : null}
      </Body>

      <Toast msg={toast} />

      <Dock>
        <div className="mb-2.5 grid grid-cols-2 gap-2">
          <div className="rounded-[12px] bg-ok-bg/70 border border-want/20 px-3.5 py-2">
            <span className="t-cap-strong block text-txt-muted text-[11.5px]">맡을 일</span>
            <span className="font-bold text-[14px] text-txt-strong truncate block mt-0.5">
              {wantRole ? wantRole.name : "선택 안 됨"}
            </span>
          </div>
          <div className="rounded-[12px] bg-fill px-3.5 py-2 border border-line">
            <span className="t-cap-strong block text-txt-muted text-[11.5px]">피할 일</span>
            <span className="font-medium text-[14px] text-txt-strong truncate block mt-0.5">
              {vetoRole ? vetoRole.name : "없음 (선택)"}
            </span>
          </div>
        </div>

        <Btn
          full
          size="lg"
          disabled={!want || busy.submit}
          onClick={submit}
          iconRight="arrow-right"
        >
          {busy.submit ? "알리는 중…" : "팀에 알리기"}
        </Btn>
      </Dock>
    </AppFrame>
  );
}

/**
 * 첫 입장 직후 재입장 코드를 **한 번만** 보여 준다.
 * 개선안(Page 3): 이메일로 돌아오기(간편) 또는 재입장 코드 저장하기 중 하나를 선택.
 */
function RejoinCodePanel({
  rejoinCode,
  isLeader,
  onDone,
}: {
  rejoinCode: string;
  isLeader: boolean;
  onDone: () => void;
}) {
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast, flash } = useAction();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(rejoinCode);
      setCopied(true);
      flash("코드를 복사했습니다. 메모장에 붙여 두세요");
    } catch {
      flash("복사하지 못했습니다. 코드를 직접 옮겨 적어 주세요.");
    }
  };

  const hasEmail = email.trim().length > 3 && email.includes("@");
  const canProceed = hasEmail || copied;

  const handleFinish = async () => {
    if (!canProceed) return;
    if (hasEmail) {
      setSaving(true);
      try {
        await updateMemberEmail(email.trim());
      } catch {
        // 백그라운드 저장 실패해도 진행
      } finally {
        setSaving(false);
      }
    }
    onDone();
  };

  return (
    <AppFrame label="재입장 수단">
      <AppBar title="들어왔습니다" sub={isLeader ? "팀장" : undefined} />
      <Body>
        <h1 className="t-h1 keep-all m-0 mb-2 text-txt-strong">
          다른 기기에서 돌아올 방법을 하나 정해 주세요
        </h1>
        <p className="text-pretty-keep m-0 mb-6 text-[15px] leading-[1.62] text-txt">
          둘 중 하나만 해 두면 됩니다.
        </p>

        {/* 1. 이메일로 돌아오기 */}
        <div className="rounded-[18px] border border-line bg-card p-4">
          <div className="flex items-center gap-2">
            <span className="text-txt-strong">
              <Icon name="mail" size={18} />
            </span>
            <span className="font-bold text-[16px] text-txt-strong">이메일로 돌아오기</span>
            <span className="ml-auto rounded-full bg-yellow-100 px-2.5 py-0.5 font-bold text-[12px] text-yellow-800">
              간편
            </span>
          </div>
          <p className="t-note m-0 mt-1 mb-3 text-txt-muted">
            메일로 온 인증번호로 들어와요.
          </p>
          <Input
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="student@university.ac.kr"
          />
        </div>

        {/* 또는 구분선 */}
        <div className="my-4 flex items-center justify-center gap-3 text-txt-muted">
          <div className="h-px flex-1 bg-line" />
          <span className="text-[13px] font-medium">또는</span>
          <div className="h-px flex-1 bg-line" />
        </div>

        {/* 2. 재입장 코드 저장하기 */}
        <div className="rounded-[18px] border border-line bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-txt-strong">
              <Icon name="key-round" size={18} />
            </span>
            <span className="font-bold text-[16px] text-txt-strong">재입장 코드 저장하기</span>
          </div>

          <div className="flex items-center justify-between rounded-[14px] bg-yellow-100/90 px-4 py-3 border border-yellow-200">
            <span className="font-mono font-extrabold text-[18px] tracking-[.06em] text-ink-900">
              {rejoinCode}
            </span>
            <button
              type="button"
              onClick={copy}
              className="flex items-center gap-1.5 rounded-lg border border-line-strong/20 bg-card px-3 py-1.5 text-[13.5px] font-bold text-txt-strong shadow-2xs cursor-pointer active:scale-95"
            >
              <Icon name={copied ? "check" : "copy"} size={14} />
              <span>{copied ? "복사됨" : "복사"}</span>
            </button>
          </div>

          <div className="mt-3 flex items-start gap-2 text-[13px] leading-[1.45] text-txt-muted">
            <Icon name="lock" size={14} className="mt-0.5 flex-none" />
            <span>지금 한 번만 보여요. 잃어버리면 팀장 승인으로 들어와요.</span>
          </div>
        </div>
      </Body>

      <Dock>
        <Btn
          full
          size="lg"
          disabled={!canProceed || saving}
          onClick={handleFinish}
          iconRight={canProceed ? "arrow-right" : undefined}
        >
          {saving
            ? "저장 중…"
            : canProceed
              ? "팀으로 들어가기"
              : "이메일을 적거나 코드를 복사해 주세요"}
        </Btn>
      </Dock>

      <Toast msg={toast} />
    </AppFrame>
  );
}

/** 승인을 기다리는 동안 얼마나 자주 확인할지. */
const POLL_MS = 5000;

/**
 * 팀장의 승인을 기다리는 화면.
 *
 * 승인되는 순간이 아니라 **이 브라우저가 물어볼 때** 팀원이 된다 — 세션 쿠키를 심을 수
 * 있는 것은 여기뿐이라, 팀장의 브라우저에서 만들 수 없다.
 */
function WaitingPanel({
  name,
  onIssued,
}: {
  name: string;
  onIssued: (issued: { rejoinCode: string; isLeader: boolean }) => void;
}) {
  const router = useRouter();
  const [rejected, setRejected] = useState(false);
  /** 팀에 같은 이름이 이미 있다 — 예전엔 이 상태가 없어서 조용히 `/join` 으로 튕겼다. */
  const [nameTaken, setNameTaken] = useState(false);
  /** 승인을 확인하는 호출이 한 번 실패했다. 조용히 멈춘 게 아니라 말해 준다. */
  const [stalled, setStalled] = useState(false);

  // 승인을 기다리는 동안 주기적으로 확인한다. 팀장이 승인해도 **이 브라우저가** 세션을
  // 만들어야 하므로(쿠키를 심을 수 있는 건 여기뿐) 기다리는 쪽이 물어본다.
  //
  // `usePoll` 을 쓴다 — 예전에는 `setInterval` 을 직접 걸어서 그저 세 가지를 잃었다:
  // 실패 처리(한 번 실패하면 "확인하는 중…" 이 영영 끝나지 않음), 안 보이는 탭에서도 계속
  // 부름(5초마다 서버를 때림), 응답이 5초를 넘으면 겹쳐 쌓임. 셋 다 `use-poll.ts` 가 이미
  // 지키고 있다(`rejoin-screen` · `icebreak-screen` · `thread-list-poll` 도 그쪽을 쓴다).
  usePoll(
    async () => {
      try {
        const result = await checkJoinApproval();
        if (result.status === "approved") {
          // 팀원이 되었으니 로컬 초안을 버린다. `name` 은 prop 으로 이미 받아 두었다.
          resetOnboarding();
          onIssued({ rejoinCode: result.rejoinCode, isLeader: false });
        } else if (result.status === "rejected") {
          setRejected(true);
        } else if (result.status === "name-taken") {
          // 예전엔 여기가 없었다 — 서버가 이름을 지운 뒤 `none` 이 돌아와서 아무 설명 없이
          // `/join` 으로 튕겼다(2026-09-28 확인).
          setNameTaken(true);
        } else if (result.status === "none") {
          router.push("/join");
        }
        setStalled(false);
      } catch {
        // 실패는 **조용히 넘기지 않는다.** 예전엔 여기가 `try/catch` 없이 그대로 두여,
        // 한 번 실패하면 "확인하는 중…" 이 영영 끝나지 않았고 무엇이 잘못됐는지 알 길이
        // 없었다. 한 번 실패한 뒤 계속 물어보되, 그 사실을 말해 둔다.
        setStalled(true);
      }
    },
    POLL_MS,
    !rejected && !nameTaken,
  );

  return (
    <AppFrame label="팀장 승인 대기">
      <AppBar title="승인을 기다립니다" sub={name} />
      <Body>
        {nameTaken ? (
          <>
            <h1 className="t-h1 keep-all m-0 mb-2 text-txt-strong">같은 이름이 이미 있습니다</h1>
            <p className="text-pretty-keep m-0 mb-5 text-[15px] leading-[1.62] text-txt">
              팀에 <b>{name}</b>님이 이미 계십니다. 팀 안에서는 이름이 겹치면 안 됩니다 — 그래야
              누가 말하고 누가 했는지 구분됩니다. <b>다른 이름</b>으로 다시 신청해 주세요.
            </p>
            <Note tone="info" icon="circle-help" title="본인이 이미 계신 경우" className="mb-4">
              기기를 바꿔 오신 거라면 재입장 코드가 필요합니다 — 첫 입장 때 받은 코드로
              들어가면 기록이 이어집니다.
            </Note>
            <Btn full size="lg" v="outline" onClick={() => router.push("/join")}>
              이름 바꾸어 다시 신청
            </Btn>
          </>
        ) : rejected ? (
          <>
            <h1 className="t-h1 keep-all m-0 mb-2 text-txt-strong">팀장이 거절했습니다</h1>
            <p className="text-pretty-keep m-0 mb-5 text-[15px] leading-[1.62] text-txt">
              초대 코드나 이름이 잘못됐을 수 있습니다. 팀장에게 직접 확인한 뒤 다시 시도해 주세요.
            </p>
            <Btn full size="lg" v="outline" onClick={() => router.push("/join")}>
              처음으로
            </Btn>
          </>
        ) : (
          <>
            <h1 className="t-h1 keep-all m-0 mb-2 text-txt-strong">
              팀장이 확인하면 바로 들어갑니다
            </h1>
            <p className="text-pretty-keep m-0 mb-5 text-[15px] leading-[1.62] text-txt">
              팀장 화면에 <b>{name}</b>님의 요청이 떴습니다. 승인하면 이 화면이 저절로 넘어갑니다.
            </p>

            <Panel s="fill" pad={16} r={16} className="mb-4">
              <p className="t-note keep-all m-0 text-center text-txt-muted">
                {stalled
                  ? "확인에 실패했습니다. 다시 확인하고 있습니다… 연결이 끊겼다면 붙여 주세요."
                  : "확인하는 중… 이 화면을 열어 두셔도 되고, 나중에 같은 기기로 다시 들어오셔도 됩니다."}
              </p>
            </Panel>

            <Note tone="info" icon="shield" title="왜 승인이 필요한가요">
              초대 코드를 아는 것만으로 들어올 수 있으면, 코드가 한 번 새면 누구든 팀의 기여 기록과
              대화를 볼 수 있습니다. 팀장이 마지막 문을 엽니다.
            </Note>
          </>
        )}
      </Body>
    </AppFrame>
  );
}

/**
 * `joinTeam` 이 거절한 이유를 그대로 보여 준다.
 *
 * 예전에는 서버가 던진 오류 문구에 기대고 있었다. 운영 빌드는 그 문구를 지우므로
 * 사용자에게는 "알리는 중…"이 끝난 뒤 아무 일도 일어나지 않는 화면으로 보였다.
 */
/**
 * 여기서 더 나아갈 수 없을 때.
 *
 * `WaitingPanel` 의 "거절" 화면과 모양을 같게 둔 이유가 있다 — 둘 다 **기다림이 끝났는데 팀원이
 * 되지 못한** 상태고, 사용자에게는 같은 종류의 이야기다. 폴링 화면을 재사용하지 않는 건
 * `checkJoinApproval()` 이 이 요청을 모른다는 사실 때문이라, `usePoll` 이 곧바로 `/join` 으로
 * 튕겨내 버린다.
 */
function JoinStoppedPanel({
  reason,
  onRetry,
}: {
  reason: "taken" | "limited";
  onRetry: () => void;
}) {
  const router = useRouter();

  return (
    <AppFrame label="팀에 알리기">
      <AppBar title="지금은 들어갈 수 없습니다" />
      <Body>
        <h1 className="t-h1 keep-all m-0 mb-2 text-txt-strong">{STOPPED_TITLE[reason]}</h1>
        <p className="text-pretty-keep m-0 mb-5 text-[15px] leading-[1.62] text-txt">
          {STOPPED_TEXT[reason]}
        </p>

        {reason === "limited" ? (
          <Btn full size="lg" v="outline" onClick={onRetry}>
            다시 시도하기
          </Btn>
        ) : (
          <Btn full size="lg" v="outline" onClick={() => router.push("/join")}>
            처음으로
          </Btn>
        )}
      </Body>
    </AppFrame>
  );
}

const STOPPED_TITLE: Record<"taken" | "limited", string> = {
  taken: "같은 이름의 요청이 이미 처리 중입니다",
  limited: "요청이 너무 많습니다",
};

const STOPPED_TEXT: Record<"taken" | "limited", string> = {
  // 누구의 요청인지 말하지 않는다. 알면 팀에 그 이름이 있는지와 승인 대기 여부가 드러난다.
  taken: "이름을 바꿔 다시 신청하면 **같은 사람이 두 번** 신청한 것으로 헷갈립니다. 팀장에게 직접 확인해 주세요.",
  limited: "잠시 뒤에 다시 눌러 주세요. **이미 신청한 분은 그대로 기다리고 계십니다** — 막히는 것은 새 신청뿐입니다.",
};

function JoinBlockedNote({
  reason,
  onGoToTeam,
}: {
  reason: JoinBlock;
  onGoToTeam: () => void;
}) {
  return (
    <Note tone="err" icon="circle-alert" title="아직 팀에 들어갈 수 없습니다" className="mt-3">
      {JOIN_BLOCK_TEXT[reason]}
      {/* 막기만 하면 사용자는 어디로 가야 하는지 모른다. "나가기"는 팀 화면에 있으니
          그 길을 직접 둔다 — 팀을 옮기는 기능이 없는 것을 감추지 않는다. */}
      {reason === "in-other-team" ? (
        <Btn
          v="outline"
          size="sm"
          className="mt-2.5"
          icon="log-out"
          onClick={onGoToTeam}
        >
          지금 있는 팀 화면으로 가기
        </Btn>
      ) : null}
    </Note>
  );
}

const JOIN_BLOCK_TEXT: Record<JoinBlock, string> = {
  "no-code": "초대 코드를 찾을 수 없습니다. 코드에 오타가 있는지 확인하거나, 다시 초대 코드를 받아 주세요.",
  "short-name": "이름을 두 글자 이상 적어 주세요.",
  "long-name": "이름이 너무 깁니다. 20자 안으로 적어 주세요.",
  "no-want": "1순위 희망 역할을 골라 주세요.",
  "in-other-team":
    "이미 다른 팀에 속해 있습니다. 새 팀에 들어가려면 먼저 그 팀에서 나가 주세요.",
};
