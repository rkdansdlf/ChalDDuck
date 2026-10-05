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
  Field,
  Input,
  Note,
  Panel,
} from "@/components/ui";
import {
  checkRejoinApproval,
  rejoinWithCode,
  requestRejoinApproval,
} from "@/server/actions/rejoin";
import { rejoinExpiredText, REJOIN_EXPIRED_AFTER_DAYS } from "@/lib/rejoin-expire";

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
  //
  // `usePoll` 을 쓴다 — 예전에는 `setInterval` 을 직접 걸어서 그저 세 가지를 잃었다:
  // 실패 처리(한 번 실패하면 "확인하는 중…" 이 영영 끝나지 않음), 안 보이는 탭에서도 계속
  // 부름(5초마다 서버를 때림), 응답이 5초를 넘으면 겹쳐 쌓임. 셋 다 `use-poll.ts` 가 이미
  // 지키고 있다(`icebreak-screen` 과 `thread-list-poll` 도 그쪽을 쓴다).
  usePoll(
    async () => {
      try {
        const result = await checkRejoinApproval();
        if (result === "approved") {
          router.push("/home");
          router.refresh();
        } else if (result === "rejected") {
          setPhase("code");
          setError("팀장이 요청을 거절했습니다. 본인이 맞다면 팀장에게 직접 확인해 주세요.");
        } else if (result === "expired") {
          // **만료는 거절이 아니다** — 팀장이 3일 동안 안 본 것이고 다시 요청하면 된다.
          // 거절과 같은 말로 하면 팀장을 의심하게 하고, 그러면 다시 안 누른다.
          //
          // 여기서 **대기 화면으로 되돌린다** — 이미 안다는 뜻이니 처음부터 다시 하라고
          // 하지 않는다. 누르면 곧바로 새 요청이 된다.
          setPhase("waiting");
          setError(rejoinExpiredText(REJOIN_EXPIRED_AFTER_DAYS));
        } else if (result === "none") {
          setPhase("code");
        }
      } catch {
        // 확인이 실패해도 **대기는 유지한다** — 그 사이에 승인되었을 수 있으므로. 조용히
        // 넘기면 사용자는 "아직인가"만 되풀이한다. 무엇이 잘못됐는지 말해 준다.
        setError("승인 여부를 확인하지 못했습니다. 잠시 뒤 다시 확인합니다.");
      }
    },
    POLL_MS,
    phase === "waiting",
  );

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
          ? "여러 번 틀렸습니다. 10분 뒤에 다시 시도하거나, 지금 바로 팀장 승인을 요청할 수 있어요."
          : result === "no-code"
            ? "이 이름에는 재입장 코드가 없습니다. 팀장 승인으로 들어와 주세요."
            : result === "unknown"
              ? "이 이름으로는 기록을 찾지 못했습니다. 이름을 다시 확인해 주세요."
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
              <b>{name}</b>님, 이 이름은 이미 팀에 있습니다. <b>본인이면</b> 첫 입장 때 받은{" "}
              <b>재입장 코드</b>를 적어 주세요.
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

            {/*
              **본인이 아닌 경우를 여기서 말해야 한다**(2026-09-28).

              이 화면은 예전에 "<name>님이 맞다면" 으로 시작해 **같은 이름의 다른 사람**에게도
              본인인 것처럼 보였다. 그리고 "코드가 없으면 팀장이 승인해 줄 수 있습니다" 고 말해
              두었는데, **그 길은 다른 사람에게 열려 있지 않다** — 팀 안에서 이름은 유일해야
              하고(`Member` 의 유일 제약), 팀장이 승인해도 같은 이름이 이미 있으므로 막힌다.
              예전에는 막힌 뒤 그 예외가 "폴링이 겹쳤다" 고 읽혀 요청이 조용히 사라졌다
              (`actions/onboarding.ts` 의 `name-taken`).

              즉 다른 사람에게는 "일단 신청해 보세요" 가 **거짓말**이었다. 승인 요청을 남겨도
              무반응으로 끝나므로, 팀장에게 갈 일이 없다는 사실과 **다른 이름**이 필요하다는
              것을 지금 말하는 편이 낫다.
            */}
            <Note tone="warn" icon="circle-alert" title="본인이 아니라면" className="mt-2.5">
              팀 안에서는 이름이 겹칠 수 없어 <b>이 이름으로는 들어올 수 없습니다</b>. 팀장에게
              승인 요청을 남겨도 마찬가지입니다. 위쪽 <b>이름 다시 적기</b>로{" "}
              <b>다른 이름</b>으로 신청해 주세요.
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

            <Note tone="info" icon="clock" className="mt-3.5">
              팀장에게 <b>{REJOIN_EXPIRED_AFTER_DAYS}일 안에 확인되지 않으면</b> 요청이 끝납니다.
              그때는 다시 누르면 됩니다 — 지워지지 않으므로 같은 이름으로 다시 들어올 수 있고,
              끝난 뒤에도 팀장 화면에 <b>무엇이 있었는지</b>는 남습니다.
            </Note>
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
