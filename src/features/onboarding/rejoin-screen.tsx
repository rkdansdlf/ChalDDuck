"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AppBar,
  AppFrame,
  Body,
  Btn,
  Dock,
  Field,
  Input,
  Note,
  Panel,
  TopInset,
  Undecided,
} from "@/components/ui";
import {
  checkRejoinApproval,
  rejoinWithCode,
  requestRejoinApproval,
} from "@/server/actions/rejoin";

/**
 * 재입장 — 이미 있는 이름으로 새 기기에서 들어오는 화면.
 *
 * 예전에는 이름만 적으면 그냥 통과했다. 그래서 초대 코드를 아는 사람이 팀원을 사칭할 수
 * 있었다. 지금은 두 가지 중 하나를 거쳐야 한다: **첫 입장 때 받은 재입장 코드**, 또는
 * **팀장 승인**.
 *
 * 처음 들어오는 사람은 이 화면을 보지 않는다 — 사칭이 일어나는 곳은 재입장뿐이라
 * 마찰도 거기에만 둔다.
 */

/** 승인을 기다리는 동안 얼마나 자주 확인할지. */
const POLL_MS = 5000;

type Phase = "code" | "waiting";

export function RejoinScreen({ teamCode, name }: { teamCode: string; name: string }) {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("code");
  const [code, setCode] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 승인을 기다리는 동안 주기적으로 확인한다. 팀장이 승인해도 **이 브라우저가**
  // 세션을 만들어야 하므로(쿠키를 심을 수 있는 건 여기뿐) 기다리는 쪽이 물어본다.
  useEffect(() => {
    if (phase !== "waiting") return;

    let stopped = false;
    const tick = async () => {
      const result = await checkRejoinApproval();
      if (stopped) return;

      if (result === "approved") {
        router.push("/home");
        router.refresh();
      } else if (result === "rejected") {
        setPhase("code");
        setError("팀장이 요청을 거절했습니다. 본인이 맞다면 팀장에게 직접 확인해 주세요.");
      } else if (result === "none") {
        setPhase("code");
      }
    };

    const timer = window.setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [phase, router]);

  const submitCode = async () => {
    if (!code.trim() || working) return;
    setWorking(true);
    setError(null);
    try {
      const result = await rejoinWithCode(teamCode, name, code);
      if (result === "ok") {
        router.push("/home");
        router.refresh();
        return;
      }
      setError(
        result === "locked"
          ? "여러 번 틀렸습니다. 10분 뒤에 다시 시도하거나 팀장 승인으로 들어와 주세요."
          : result === "no-code"
            ? "이 이름에는 재입장 코드가 없습니다. 팀장 승인으로 들어와 주세요."
            : "재입장 코드가 맞지 않습니다.",
      );
    } finally {
      setWorking(false);
    }
  };

  const askLeader = async () => {
    if (working) return;
    setWorking(true);
    setError(null);
    try {
      const result = await requestRejoinApproval(teamCode, name);
      if (result === "requested") setPhase("waiting");
      else setError("그 이름을 찾지 못했습니다. 이름을 다시 확인해 주세요.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <AppFrame label="재입장">
      <TopInset />
      <AppBar
        title="다시 들어오기"
        sub={name}
        onBack={() => router.push("/onboarding/name")}
        actionLabel="이름 다시 적기"
      />

      <Body>
        {phase === "waiting" ? (
          <>
            <h1 className="t-h1 keep-all m-0 mb-2 text-txt-strong">팀장의 승인을 기다립니다</h1>
            <p className="text-pretty-keep m-0 mb-5 text-[15px] leading-[1.62] text-txt">
              팀장 화면에 <b>{name}</b>님의 재입장 요청이 떴습니다. 승인하면 이 화면이 저절로
              넘어갑니다.
            </p>

            <Panel s="fill" pad={16} r={16} className="mb-4">
              <p className="t-note keep-all m-0 text-center text-txt-muted">
                확인하는 중… 이 화면을 열어 두셔도 되고, 나중에 같은 기기로 다시 들어오셔도 됩니다.
              </p>
            </Panel>

            <Note tone="info" icon="shield" title="왜 승인이 필요한가요">
              이름만으로 들어올 수 있으면 초대 코드를 아는 사람이 팀원인 척할 수 있습니다. 기여
              기록과 1:1 대화가 걸려 있어 한 단계를 둡니다.
            </Note>

            <Btn
              full
              size="lg"
              v="outline"
              className="mt-4"
              onClick={() => setPhase("code")}
            >
              재입장 코드를 찾았어요
            </Btn>
          </>
        ) : (
          <>
            <h1 className="t-h1 keep-all m-0 mb-2 text-txt-strong">
              이미 쓰이고 있는 이름입니다
            </h1>
            <p className="text-pretty-keep m-0 mb-5 text-[15px] leading-[1.62] text-txt">
              <b>{name}</b>님이 맞다면 첫 입장 때 받은 <b>재입장 코드</b>를 적어 주세요. 코드가
              없으면 팀장이 승인해 줄 수 있습니다.
            </p>

            <Field label="재입장 코드" required error={error}>
              {(props) => (
                <Input
                  {...props}
                  value={code}
                  onChange={setCode}
                  placeholder="예: ABCD-EFGH-JKLM"
                  error={Boolean(error)}
                  maxLength={20}
                  autoFocus
                />
              )}
            </Field>

            <Note tone="info" icon="key-round" title="재입장 코드는 첫 입장 때 한 번만 보입니다">
              저장해 두지 않으셨다면 아래 <b>팀장 승인</b>으로 들어오세요. 들어온 뒤 팀 화면에서 새
              코드를 받을 수 있습니다.
            </Note>

            <Btn
              full
              size="lg"
              v="outline"
              icon="user-round"
              className="mt-4"
              disabled={working}
              onClick={askLeader}
            >
              코드가 없어요 — 팀장에게 승인 요청
            </Btn>

            <Undecided>
              팀장이 오래 응답하지 않을 때 어떻게 할지는 기획안에 없습니다. 지금은 계속 기다리거나
              코드를 찾는 두 길만 둡니다.
            </Undecided>
          </>
        )}
      </Body>

      {phase === "code" ? (
        <Dock>
          <Btn full size="lg" disabled={!code.trim() || working} onClick={submitCode}>
            {working ? "확인하는 중" : "들어가기"}
          </Btn>
        </Dock>
      ) : null}
    </AppFrame>
  );
}
