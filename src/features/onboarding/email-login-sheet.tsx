"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Btn, Field, Input, Panel, Sheet } from "@/components/ui";
import {
  requestEmailAuth,
  selectEmailTeamMember,
  verifyEmailAuthCode,
} from "@/server/actions/email-auth";

export function EmailLoginSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();

  const [step, setStep] = useState<"email" | "otp" | "select-team">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewCode, setPreviewCode] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(600); // 10분

  const [teams, setTeams] = useState<
    Array<{
      memberId: string;
      memberName: string;
      teamId: string;
      teamName: string;
      course: string;
    }>
  >([]);

  // 시트가 닫힐 때 상태 리셋.
  //
  // **effect 가 아니라 렌더 중에 한다.** 예전에는 `useEffect([open])` 안에서 `setStep` 등을
  // 불렀다. 닫히는 프레임에 한 번 더 렌더가 돌아가는 불필요한 연쇄가 생기고(React 도 이
  // 것을 `set-state-in-effect` 로 경고한다), 무엇보다 "닫혔다"는 사실이 화면에 반영되기
  // **한 페임 뒤**에야 반영된다.
  //
  // React 문서가 이 상황을 정한 방식 그대로다 — 이전 값을 기억해 두고, 달라졌을 때
  // **렌더 중에** 상태를 고친다(`useEffect` 불필요). `email` 은 지우지 않는다 — 지운다고
  // 되어 있지 않다면, 다시 열어 이메일까지 다시 적게 하는 것이 아니다.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setStep("email");
      setCode("");
      setError(null);
      setPreviewCode(null);
      setTeams([]);
      setTimeLeft(600);
    }
  }

  // OTP 입력 단계일 때 타이머
  useEffect(() => {
    if (step !== "otp") return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [step]);

  // 인증번호 전송 요청
  const handleRequestOtp = async () => {
    const norm = email.trim();
    if (!norm || working) return;
    setWorking(true);
    setError(null);

    try {
      const res = await requestEmailAuth(norm);
      if (!res.ok) {
        if (res.reason === "invalid-email") {
          setError("올바른 이메일 주소를 입력해 주세요.");
        } else if (res.reason === "cooldown") {
          setError("방금 인증 메일이 발송되었습니다. 1분 후 다시 시도해 주세요.");
        } else if (res.reason === "send-failed") {
          /**
           * 사용자의 메일 주소나 인터넷 탓으로 말하면 안 된다.
           *
           * 이 결과가 나오는 가장 흔한 원인은 서버 설정이다 — 메일을 보내는 키가 없어서
           * 애초에 아무것도 시도되지 않은 경우. 예전 문구는 "메일 주소와 인터넷 연결을 확인해
           * 주세요" 였는데, 문제가 사용자의 것이 아니라 전부 우리 쪽인데 대신 이유가
           * 사용자에게 씌워진 셈이 되었다. 무엇을 하면 되는지만 말하고, 원인은 서버 로그에
           * 남는다.
           */
          setError("지금은 인증번호를 보낼 수 없습니다. 잠시 뒤 다시 시도해 주세요.");
        } else {
          setError("메일 발송 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
        }
        return;
      }

      setStep("otp");
      setTimeLeft(600);
      if (res.previewCode) {
        setPreviewCode(res.previewCode);
      }
    } finally {
      setWorking(false);
    }
  };

  // 인증번호 검증
  const handleVerifyOtp = async () => {
    const cleanCode = code.trim();
    if (cleanCode.length !== 6 || working) return;
    setWorking(true);
    setError(null);

    try {
      const res = await verifyEmailAuthCode(email, cleanCode);

      if (res.status === "ok") {
        router.push("/home");
        router.refresh();
        onClose();
        return;
      }

      if (res.status === "multiple") {
        setTeams(res.members);
        setStep("select-team");
        return;
      }

      if (res.status === "no-teams") {
        setError(
          `이메일(${email})로 참여 중인 팀이 없습니다. 초대 링크를 통해 먼저 팀에 참여해 주세요.`,
        );
        return;
      }

      if (res.status === "wrong") {
        setError(`인증번호가 일치하지 않습니다. (남은 기회: ${res.remainingAttempts}회)`);
        return;
      }

      if (res.status === "expired") {
        setError("인증번호가 만료되었습니다. 다시 요청해 주세요.");
        return;
      }

      if (res.status === "locked") {
        setError("입력 횟수를 5회 초과했습니다. 인증번호를 다시 발급받아 주세요.");
        return;
      }

      setError("인증 처리 중 오류가 발생했습니다.");
    } finally {
      setWorking(false);
    }
  };

  // 복수 팀 선택 시
  const handleSelectTeam = async (memberId: string) => {
    if (working) return;
    setWorking(true);
    try {
      const res = await selectEmailTeamMember(memberId);
      if (res.ok) {
        router.push("/home");
        router.refresh();
        onClose();
      } else {
        setError("팀에 진입하지 못했습니다. 다시 시도해 주세요.");
      }
    } finally {
      setWorking(false);
    }
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeStr = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;

  return (
    <Sheet
      open={open}
      title={
        step === "email"
          ? "이메일로 본인 확인"
          : step === "otp"
            ? "인증번호 입력"
            : "참여할 팀 선택"
      }
      onClose={onClose}
    >
      {step === "email" && (
        <div className="flex flex-col gap-3">
          <p className="t-body keep-all m-0 text-txt-muted">
            가입 시 입력했던 이메일을 적어주세요. 12자리 재입장 코드 없이 인증번호로 바로 로그인할 수 있습니다.
          </p>

          <Field label="이메일 주소" required error={error}>
            {(props) => (
              <Input
                {...props}
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="예: student@university.ac.kr"
                error={Boolean(error)}
                autoFocus
              />
            )}
          </Field>

          <Btn
            full
            size="lg"
            className="mt-2"
            disabled={!email.trim() || working}
            onClick={handleRequestOtp}
          >
            {working ? "발송 중…" : "인증번호 받기"}
          </Btn>
        </div>
      )}

      {step === "otp" && (
        <div className="flex flex-col gap-3">
          <p className="t-body keep-all m-0 text-txt-muted">
            <b>{email}</b> 주소로 6자리 인증번호를 전송했습니다.
          </p>

          {previewCode ? (
            <Panel s="yellow" pad={14} r={12} className="text-center">
              <div className="text-[13px] font-medium text-yellow-800">
                [개발 테스트 안내] 인증번호: <b>{previewCode}</b>
              </div>
            </Panel>
          ) : null}

          <Field
            label="인증번호 6자리"
            required
            error={error}
            hint={`유효 시간: ${timeStr}`}
          >
            {(props) => (
              <Input
                {...props}
                value={code}
                onChange={setCode}
                placeholder="000000"
                mono
                maxLength={6}
                error={Boolean(error)}
                autoFocus
              />
            )}
          </Field>

          <Btn
            full
            size="lg"
            className="mt-2"
            disabled={code.trim().length !== 6 || working}
            onClick={handleVerifyOtp}
          >
            {working ? "확인 중…" : "로그인하기"}
          </Btn>

          <div className="mt-2 flex justify-between items-center text-[13px]">
            <button
              type="button"
              className="text-txt-muted border-none bg-transparent cursor-pointer underline"
              onClick={() => {
                setStep("email");
                setError(null);
              }}
            >
              이메일 다시 적기
            </button>
            <button
              type="button"
              className="text-link border-none bg-transparent cursor-pointer font-medium"
              disabled={working}
              onClick={handleRequestOtp}
            >
              인증번호 재전송
            </button>
          </div>
        </div>
      )}

      {step === "select-team" && (
        <div className="flex flex-col gap-2.5">
          <p className="t-body keep-all m-0 text-txt-muted">
            참여 중인 팀이 여러 개 있습니다. 들어갈 팀을 선택해 주세요.
          </p>

          {teams.map((t) => (
            <button
              key={t.memberId}
              type="button"
              disabled={working}
              onClick={() => handleSelectTeam(t.memberId)}
              className="box-border flex min-h-[56px] w-full cursor-pointer items-center justify-between rounded-control border border-line bg-card px-4 py-3 text-left transition hover:bg-fill"
            >
              <div>
                <div className="font-bold text-[15px] text-txt-strong">{t.teamName}</div>
                <div className="text-[13px] text-txt-muted">
                  {t.course} · {t.memberName}
                </div>
              </div>
              <span className="text-[13px] font-semibold text-link">입장 &rarr;</span>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}
