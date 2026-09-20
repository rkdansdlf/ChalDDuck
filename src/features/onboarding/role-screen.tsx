"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppBar, AppFrame, Body, Btn, Chip, Dock, Icon, Note, Panel, Progress, Rows, TopInset } from "@/components/ui";
import { checkJoinApproval, joinTeam } from "@/server/actions/onboarding";
import { cn } from "@/lib/cn";
import type { Role, RoleKey } from "@/lib/types";
import { setVeto, setWant, toDraft, useOnboarding } from "./onboarding-state";

type Mode = "want" | "veto";

/**
 * 06 희망 역할 · Veto — 온보딩의 마지막 단계.
 *
 * 역할은 **희망·Veto·경험·가능한 시간**으로만 조율한다. MBTI 유형은 배정 계산에 들어가지 않는다.
 * 같은 역할을 희망이면서 동시에 피할 수는 없으므로, 한쪽에서 고른 역할은 다른 쪽에서 잠근다.
 */
export function RoleScreen({ roles }: { roles: Role[] }) {
  const router = useRouter();
  const { teamCode, want, veto } = useOnboarding();

  const [mode, setMode] = useState<Mode>("want");
  const [submitting, setSubmitting] = useState(false);
  /** 들어간 뒤 한 번만 보여 주는 재입장 코드. 서버에는 해시만 남아 다시 볼 수 없다. */
  const [issued, setIssued] = useState<{ rejoinCode: string; isLeader: boolean } | null>(null);
  /** 팀장 승인을 기다리는 중. */
  const [waiting, setWaiting] = useState(false);

  const picked = mode === "want" ? want : veto;
  const set = mode === "want" ? setWant : setVeto;

  const submit = async () => {
    if (!want || submitting) return;
    setSubmitting(true);
    try {
      // 팀장이 있으면 바로 들어가지 못하고 승인을 기다린다.
      const result = await joinTeam(teamCode ?? "", toDraft());
      if (result.status === "requested") setWaiting(true);
      else setIssued({ rejoinCode: result.rejoinCode, isLeader: result.isLeader });
    } catch (error) {
      setSubmitting(false);
      throw error;
    }
  };

  if (issued) return <RejoinCodePanel {...issued} onDone={() => router.push("/team")} />;
  if (waiting) return <WaitingPanel name={toDraft().name} onIssued={setIssued} />;

  return (
    <AppFrame label="06 희망 역할 · Veto">
      <TopInset />
      <AppBar title="맡고 싶은 일" sub="4 / 4단계" onBack={() => router.back()} />
      <Body dense>
        <Progress step={4} total={4} className="mt-1 mb-4" />

        <h1 className="t-h1-sm keep-all m-0 mb-2 text-txt-strong">같은 유형이어도 원하는 일은 다릅니다</h1>
        <p className="text-pretty-keep m-0 mb-4 text-[15px] leading-[1.62] text-txt">
          1순위로 맡고 싶은 역할 하나와, 이번에는 피하고 싶은 역할 하나를 골라 주세요.
        </p>

        {/* 희망/Veto 전환 — 한 화면에서 두 가지를 고르되 한 번에 하나씩만 다룬다 */}
        <div role="tablist" className="mb-3.5 flex gap-1.5 rounded-[13px] bg-fill p-1">
          {(
            [
              ["want", "1순위 희망", want],
              ["veto", "피하고 싶음", veto],
            ] as const
          ).map(([key, label, value]) => {
            const on = mode === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setMode(key)}
                className={cn(
                  "flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-[5px] rounded-[10px] border-none font-bold text-[13.5px] leading-[1.3]",
                  on ? "bg-card text-txt-strong shadow-sm" : "bg-transparent text-txt-muted",
                )}
              >
                {label}
                {value ? (
                  <span className={cn("inline-flex", key === "want" ? "text-want" : "text-veto")}>
                    <Icon name="check" size={14} strokeWidth={3} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <Rows>
          {roles.map((role) => {
            const isWant = want === role.key;
            const isVeto = veto === role.key;
            const on = picked === role.key;
            // 반대편에서 이미 고른 역할은 여기서 고를 수 없다
            const blocked = mode === "want" ? isVeto : isWant;

            return (
              <button
                key={role.key}
                type="button"
                disabled={blocked}
                aria-pressed={on}
                onClick={() => set(on ? null : (role.key as RoleKey))}
                className={cn(
                  "box-border flex min-h-[56px] w-full items-center gap-3 border-none px-[15px] py-[13px] text-left",
                  on ? (mode === "want" ? "bg-ok-bg" : "bg-err-bg") : "bg-transparent",
                  blocked ? "cursor-default opacity-55" : "cursor-pointer",
                )}
              >
                <span
                  className={cn(
                    "grid size-[22px] flex-none place-items-center border-[1.5px] text-white",
                    mode === "want" ? "rounded-full" : "rounded-[7px]",
                    on
                      ? mode === "want"
                        ? "border-transparent bg-want"
                        : "border-transparent bg-veto"
                      : "border-line-strong bg-transparent",
                  )}
                >
                  {on ? <Icon name={mode === "want" ? "check" : "x"} size={13} strokeWidth={3} /> : null}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="t-body-strong keep-all block text-txt-strong">{role.name}</span>
                  <span className="keep-all mt-0.5 block text-[13px] leading-[1.45] text-txt-muted">
                    {role.note}
                  </span>
                </span>

                {isWant ? (
                  <Chip tone="want" icon="thumbs-up">
                    희망
                  </Chip>
                ) : null}
                {isVeto ? (
                  <Chip tone="veto" icon="hand">
                    피함
                  </Chip>
                ) : null}
              </button>
            );
          })}
        </Rows>

        <Note tone="info" icon="lock" className="mt-3">
          역할은 <b>희망·Veto·경험·가능한 시간</b>으로만 조율합니다. MBTI 유형은 배정 계산에 들어가지 않습니다.
        </Note>
      </Body>

      <Dock>
        <Btn full size="lg" disabled={!want || submitting} onClick={submit} iconRight="arrow-right">
          {want ? (submitting ? "알리는 중…" : "팀에 알리기") : "1순위 희망을 골라 주세요"}
        </Btn>
      </Dock>
    </AppFrame>
  );
}

/**
 * 첫 입장 직후 재입장 코드를 **한 번만** 보여 준다.
 *
 * 서버에는 해시만 남아 이 화면을 지나면 아무도 다시 볼 수 없다. 그래서 "확인했습니다"를
 * 누르기 전에는 넘어가지 못하게 한다 — 그냥 넘겨 버리면 기기를 바꿨을 때
 * 팀장을 붙잡는 수밖에 없다.
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
  const [saved, setSaved] = useState(false);

  return (
    <AppFrame label="재입장 코드">
      <TopInset />
      <AppBar title="들어왔습니다" sub={isLeader ? "팀장" : undefined} />
      <Body>
        <h1 className="t-h1 keep-all m-0 mb-2 text-txt-strong">재입장 코드를 저장해 주세요</h1>
        <p className="text-pretty-keep m-0 mb-5 text-[15px] leading-[1.62] text-txt">
          기기를 바꾸거나 브라우저 기록을 지웠을 때 이 코드로 돌아옵니다.{" "}
          <b>이 화면을 지나면 다시 볼 수 없습니다.</b>
        </p>

        <Panel s="yellow" pad={18} r={18} className="mb-4 text-center">
          <div className="font-mono font-extrabold text-[22px] leading-[1.4] tracking-[.08em] text-ink-900">
            {rejoinCode}
          </div>
        </Panel>

        {isLeader ? (
          <Note tone="info" icon="user-round" title="팀을 만드셨으니 팀장입니다" className="mb-3">
            팀원이 기기를 바꿔 다시 들어올 때 <b>승인</b>하는 역할입니다. 팀 탭에 요청이 뜹니다.
          </Note>
        ) : null}

        <Note tone="warn" icon="shield" title="코드는 서버에도 남지 않습니다">
          저장해 두지 않으면 재입장할 때 팀장 승인을 받아야 합니다. 팀 화면에서 새 코드를 다시
          받을 수는 있습니다.
        </Note>

        <button
          type="button"
          aria-pressed={saved}
          onClick={() => setSaved((v) => !v)}
          className="mt-4 flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-control border border-line bg-card px-3.5 text-left"
        >
          <Icon name={saved ? "check" : "circle-dashed"} size={18} />
          <span className="font-semibold text-[14.5px] leading-[1.4] text-txt-strong">
            따로 적어 두었습니다
          </span>
        </button>
      </Body>

      <Dock>
        <Btn full size="lg" disabled={!saved} onClick={onDone} iconRight="arrow-right">
          팀으로 가기
        </Btn>
      </Dock>
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

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      const result = await checkJoinApproval();
      if (stopped) return;

      if (result.status === "approved") onIssued({ rejoinCode: result.rejoinCode, isLeader: false });
      else if (result.status === "rejected") setRejected(true);
      else if (result.status === "none") router.push("/join");
    };

    const timer = window.setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [onIssued, router]);

  return (
    <AppFrame label="팀장 승인 대기">
      <TopInset />
      <AppBar title="승인을 기다립니다" sub={name} />
      <Body>
        {rejected ? (
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
                확인하는 중… 이 화면을 열어 두셔도 되고, 나중에 같은 기기로 다시 들어오셔도 됩니다.
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
