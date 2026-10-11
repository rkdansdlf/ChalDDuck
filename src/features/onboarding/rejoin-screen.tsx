"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { usePoll } from "@/lib/use-poll";
import { cn } from "@/lib/cn";
import { rejoinExpiredText, REJOIN_EXPIRED_AFTER_DAYS } from "@/lib/rejoin-expire";
import {
  AppBar,
  AppFrame,
  Body,
  Btn,
  CodeCells,
  Disclosure,
  Dock,
  Field,
  Icon,
  Input,
  Note,
} from "@/components/ui";
import {
  checkRejoinApproval,
  rejoinWithCode,
  rejoinWithEmailCode,
  requestRejoinApproval,
  requestRejoinEmailCode,
} from "@/server/actions/rejoin";

/**
 * 재입장 — 이미 있는 이름으로 새 기기에서 들어오는 화면.
 *
 * 들어오는 길은 세 가지다: **재입장 코드**, **등록한 이메일**, 또는 **팀장 승인**. 이름만으로는
 * 들어오지 못한다 — 예전에는 그랬고, 초대 코드를 아는 사람이 팀원을 사칭할 수 있었다.
 *
 * 이메일 길은 **팀 · 이름 · 이메일이 모두 같은 한 사람**에게만 된다(`requestRejoinEmailCode`,
 * `rejoinWithEmailCode`). 일반 이메일 로그인은 그 주소의 모든 팀에 들어가므로 여기서 쓰지 않는다.
 *
 * 처음 들어오는 사람은 이 화면을 보지 않는다. 사칭이 일어나는 곳은 재입장뿐이라 마찰도 여기에만 둔다.
 *
 * 화면 상태는 세 가지다(`Phase`). 팀장 확인을 기다리는 동안만 주기적으로 확인하고, 만료된 뒤에는
 * 확인을 멈춘다 — 멈추지 않으면 다음 확인이 "요청 없음"을 받아 만료 안내를 지워 버린다.
 */

/** 승인을 기다리는 동안 얼마나 자주 확인할지. */
const POLL_MS = 5000;

/** 들어온 뒤 "돌아왔어요"를 보여 주는 시간. 바로 넘기면 무엇이 일어났는지 알 수 없다. */
const ENTER_MS = 1300;

type Phase = "code" | "waiting" | "expired";

/** 들어오는 방법 — 코드 또는 이메일. 승인 대기는 여기서 나뉘지 않는다. */
type Mode = "code" | "email";

type Notice = { tone: "info" | "warn" | "err"; text: string };

/** 이메일 길의 실패 이유 → 사용자에게 보일 말. 한 곳에 모아 두면 요청과 확인이 같은 말을 한다. */
const EMAIL_MESSAGE: Record<string, string> = {
  "invalid-email": "올바른 이메일 주소를 입력해 주세요.",
  unknown: "이 이름으로는 기록을 찾지 못했습니다. 이름을 다시 확인해 주세요.",
  "no-email":
    "등록된 이메일이 없습니다. 12자리 재입장 코드로 들어가거나, 팀장에게 승인을 요청하세요.",
  mismatch: "등록된 이메일과 일치하지 않습니다.",
  locked: "여러 번 틀렸습니다. 10분 뒤에 다시 시도해 주세요.",
  cooldown: "방금 인증번호를 보냈어요. 1분 뒤에 다시 받을 수 있어요.",
  "send-failed": "지금은 인증번호를 보낼 수 없습니다. 잠시 뒤 다시 시도해 주세요.",
  wrong: "인증번호가 맞지 않아요. 다시 확인해 주세요.",
  expired: "인증번호가 만료됐어요. 다시 받아 주세요.",
};

/** 이메일 형식은 화면에서 먼저 거른다. 최종 판단은 서버(`isValidEmail`)가 한다. */
const isEmailShaped = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export function RejoinScreen({ teamCode, name }: { teamCode: string; name: string }) {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("code");
  const [mode, setMode] = useState<Mode>("code");
  const [code, setCode] = useState("");
  const [working, setWorking] = useState(false);
  /** 코드 칸 아래에 붙는 오류 — 칸도 함께 붉어지고 흔들린다. */
  const [codeError, setCodeError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState(0);
  /** 화면 위쪽에 놓이는 안내 — 거절·확인 실패·요청 실패. */
  const [notice, setNotice] = useState<Notice | null>(null);
  const [entered, setEntered] = useState(false);

  // 이메일 길 — 주소를 적고, 받은 인증번호 6자리를 적는다.
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailCode, setEmailCode] = useState("");
  /** 입력 칸 아래의 오류. */
  const [emailError, setEmailError] = useState<string | null>(null);
  /** 등록된 이메일이 없을 때의 안내 — 오류가 아니라 다음 길을 알려 준다. */
  const [emailNote, setEmailNote] = useState<string | null>(null);
  /** 메일이 나가지 않은 개발 환경에서만 서버가 인증번호를 돌려준다. 운영에서는 항상 null. */
  const [devCode, setDevCode] = useState<string | null>(null);

  const complete = code.length === 12;
  const emailReady = isEmailShaped(email);

  const enter = () => {
    setEntered(true);
    window.setTimeout(() => {
      router.push("/home");
      router.refresh();
    }, ENTER_MS);
  };

  // 승인을 기다리는 동안 주기적으로 확인한다. 팀장이 승인해도 **이 브라우저가** 세션을 만들어야
  // 하므로(쿠키를 심을 수 있는 건 여기뿐) 기다리는 쪽이 물어본다. `usePoll` 이 실패 처리, 탭이
  // 숨겨졌을 때의 중단, 응답이 겹치는 것을 맡는다.
  usePoll(
    async () => {
      try {
        const result = await checkRejoinApproval();
        if (result === "approved") {
          enter();
        } else if (result === "pending") {
          setNotice(null);
        } else if (result === "rejected") {
          setPhase("code");
          setNotice({
            tone: "err",
            text: "팀장이 요청을 거절했습니다. 본인이 맞다면 팀장에게 직접 확인해 주세요.",
          });
        } else if (result === "expired") {
          // **만료는 거절이 아니다.** 팀장이 기한 동안 확인하지 않은 것이고 다시 요청하면 된다.
          // 거절과 같은 말로 하면 팀장을 의심하게 하고, 그러면 다시 누르지 않는다.
          setPhase("expired");
        } else if (result === "none") {
          setPhase("code");
        }
      } catch {
        // 확인이 실패해도 대기는 유지한다 — 그 사이에 승인되었을 수 있으므로.
        setNotice({
          tone: "info",
          text: "승인 여부를 확인하지 못했습니다. 잠시 뒤 다시 확인합니다.",
        });
      }
    },
    POLL_MS,
    phase === "waiting" && !entered,
  );

  const submitCode = async () => {
    if (!complete || working) return;
    setWorking(true);
    setCodeError(null);
    setNotice(null);
    try {
      const result = await rejoinWithCode(teamCode, name, code);
      if (result === "ok") {
        enter();
        return;
      }
      setCodeError(
        result === "locked"
          ? "여러 번 틀렸습니다. 10분 뒤에 다시 시도하거나, 지금 바로 팀장 승인을 요청할 수 있어요."
          : result === "no-code"
            ? "이 이름에는 재입장 코드가 없습니다. 팀장 승인으로 들어와 주세요."
            : result === "unknown"
              ? "이 이름으로는 기록을 찾지 못했습니다. 이름을 다시 확인해 주세요."
              : "코드가 맞지 않아요. 다시 확인해 주세요",
      );
      setErrorKey((k) => k + 1);
    } finally {
      setWorking(false);
    }
  };

  /** 인증번호를 보낸다 — 처음 보낼 때와 다시 받을 때 같다. */
  const requestEmail = async () => {
    if (!emailReady || working) return;
    setWorking(true);
    setEmailError(null);
    setEmailNote(null);
    try {
      const result = await requestRejoinEmailCode(teamCode, name, email);
      if (result.ok) {
        setEmailSent(true);
        setEmailCode("");
        setDevCode(result.previewCode ?? null);
        return;
      }
      const text = EMAIL_MESSAGE[result.reason] ?? "인증번호를 보내지 못했습니다.";
      if (result.reason === "no-email") setEmailNote(text);
      else setEmailError(text);
    } finally {
      setWorking(false);
    }
  };

  const submitEmailCode = async () => {
    if (emailCode.length !== 6 || working) return;
    setWorking(true);
    setEmailError(null);
    setEmailNote(null);
    try {
      const result = await rejoinWithEmailCode(teamCode, name, email, emailCode);
      if (result === "ok") {
        enter();
        return;
      }
      const text = EMAIL_MESSAGE[result] ?? "인증번호를 확인하지 못했습니다.";
      if (result === "no-email") setEmailNote(text);
      else setEmailError(text);
    } finally {
      setWorking(false);
    }
  };

  const askLeader = async () => {
    if (working) return;
    setWorking(true);
    setCodeError(null);
    setNotice(null);
    try {
      const result = await requestRejoinApproval(teamCode, name);
      if (result === "requested") setPhase("waiting");
      else setNotice({ tone: "err", text: "그 이름을 찾지 못했습니다. 이름을 다시 확인해 주세요." });
    } finally {
      setWorking(false);
    }
  };

  const backToCode = () => {
    setNotice(null);
    setPhase("code");
  };

  const changeMode = (next: Mode) => {
    setMode(next);
    setNotice(null);
    setCodeError(null);
    setEmailError(null);
    setEmailNote(null);
  };

  const sendAnother = () => {
    setEmailSent(false);
    setEmailCode("");
    setEmailError(null);
    setEmailNote(null);
    setDevCode(null);
  };

  return (
    <AppFrame label="재입장">
      <AppBar title="다시 들어오기" sub={name} onBack={() => router.push("/onboarding/name")} />

      <Body>
        {phase === "code" ? (
          <EnterView
            name={name}
            mode={mode}
            onMode={changeMode}
            notice={notice}
            code={code}
            onCode={(v) => {
              setCode(v);
              setCodeError(null);
            }}
            codeError={codeError}
            errorKey={errorKey}
            email={email}
            onEmail={(v) => {
              setEmail(v);
              setEmailError(null);
              setEmailNote(null);
            }}
            emailSent={emailSent}
            emailCode={emailCode}
            onEmailCode={(v) => {
              setEmailCode(v.replace(/\D/g, "").slice(0, 6));
              setEmailError(null);
            }}
            emailError={emailError}
            emailNote={emailNote}
            devCode={devCode}
            onResend={requestEmail}
            onSendAnother={sendAnother}
            working={working}
          />
        ) : phase === "waiting" ? (
          <WaitingView name={name} />
        ) : (
          <ExpiredView />
        )}
      </Body>

      {phase === "code" ? (
        <Dock>
          <button
            type="button"
            onClick={askLeader}
            disabled={working}
            className="flex min-h-11 cursor-pointer items-center justify-center gap-1.5 border-none bg-transparent t-cap-strong text-txt-muted select-none disabled:cursor-default"
          >
            <Icon name="user-check" size={16} />
            코드가 없어요 · 팀장에게 승인 요청
          </button>
          {mode === "code" ? (
            <Btn
              full
              size="lg"
              v="yellow"
              disabled={!complete || working}
              icon={complete && !working ? "log-in" : undefined}
              onClick={submitCode}
            >
              {working ? "확인하는 중" : complete ? "들어가기" : `${code.length}/12`}
            </Btn>
          ) : emailSent ? (
            <Btn
              full
              size="lg"
              v="yellow"
              disabled={emailCode.length !== 6 || working}
              icon={emailCode.length === 6 && !working ? "log-in" : undefined}
              onClick={submitEmailCode}
            >
              {working ? "확인하는 중" : "들어가기"}
            </Btn>
          ) : (
            <Btn
              full
              size="lg"
              v="yellow"
              disabled={!emailReady || working}
              icon={emailReady && !working ? "send" : undefined}
              onClick={requestEmail}
            >
              {working ? "보내는 중" : "인증번호 받기"}
            </Btn>
          )}
        </Dock>
      ) : phase === "waiting" ? (
        <Dock>
          <Btn full size="lg" v="outline" icon="key-round" onClick={backToCode}>
            코드 입력
          </Btn>
        </Dock>
      ) : (
        <Dock>
          <div className="grid grid-cols-2 gap-2">
            <Btn full size="lg" v="outline" icon="key-round" onClick={backToCode}>
              코드 입력
            </Btn>
            <Btn full size="lg" v="yellow" icon="user-check" disabled={working} onClick={askLeader}>
              다시 요청
            </Btn>
          </div>
        </Dock>
      )}

      {entered ? <Welcome name={name} /> : null}
    </AppFrame>
  );
}

/** 이름 아바타 — 노란 원에 첫 글자. 크기는 자리마다 달라서 호출하는 쪽이 정한다. */
function NameAvatar({ name, className }: { name: string; className: string }) {
  return (
    <div
      className={cn(
        "grid place-items-center rounded-full bg-yellow-200 font-bold text-ink-900",
        className,
      )}
    >
      {name.charAt(0)}
    </div>
  );
}

function NoticeBox({ notice }: { notice: Notice }) {
  return (
    <Note tone={notice.tone} icon={notice.tone === "info" ? "info" : "circle-alert"}>
      {notice.text}
    </Note>
  );
}

/** 들어오는 방법을 고르는 두 칸짜리 선택. 선택된 칸만 흰 바탕을 얹는다. */
function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const options: { v: Mode; label: string; icon: "key-round" | "mail" }[] = [
    { v: "code", label: "재입장 코드", icon: "key-round" },
    { v: "email", label: "이메일", icon: "mail" },
  ];
  return (
    <div role="tablist" aria-label="들어오는 방법" className="mt-[18px] grid grid-cols-2 gap-1 rounded-control bg-fill p-1">
      {options.map((o) => {
        const on = mode === o.v;
        return (
          <button
            key={o.v}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.v)}
            className={cn(
              "relative inline-flex min-h-10 cursor-pointer items-center justify-center rounded-[11px] border-none bg-transparent select-none transition-colors duration-200",
              on ? "text-txt-strong" : "text-txt-muted",
            )}
          >
            {on ? <span aria-hidden="true" className="absolute inset-0 rounded-[11px] bg-card shadow-sm" /> : null}
            <span className="relative inline-flex items-center gap-1.5 t-btn-sm">
              <Icon name={o.icon} size={15} />
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function EnterView({
  name,
  mode,
  onMode,
  notice,
  code,
  onCode,
  codeError,
  errorKey,
  email,
  onEmail,
  emailSent,
  emailCode,
  onEmailCode,
  emailError,
  emailNote,
  devCode,
  onResend,
  onSendAnother,
  working,
}: {
  name: string;
  mode: Mode;
  onMode: (m: Mode) => void;
  notice: Notice | null;
  code: string;
  onCode: (v: string) => void;
  codeError: string | null;
  errorKey: number;
  email: string;
  onEmail: (v: string) => void;
  emailSent: boolean;
  emailCode: string;
  onEmailCode: (v: string) => void;
  emailError: string | null;
  emailNote: string | null;
  devCode: string | null;
  onResend: () => void;
  onSendAnother: () => void;
  working: boolean;
}) {
  return (
    <>
      <header className="animate-slide-up flex items-center gap-3">
        <div className="relative size-[52px] flex-none">
          <NameAvatar name={name} className="size-full text-[22px] leading-none" />
          <span className="absolute -right-[3px] -bottom-[3px] grid size-[22px] place-items-center rounded-full bg-card text-warn ring-2 ring-page">
            <Icon name="lock-keyhole" size={13} />
          </span>
        </div>
        <div className="min-w-0">
          <h1 className="t-h1-sm keep-all text-txt-strong">이미 있는 이름이에요</h1>
          <p className="t-note text-txt-muted">
            <b className="font-bold text-txt-strong">{name}</b>님이라면 들어올 방법을 골라 주세요
          </p>
        </div>
      </header>

      <ModeSwitch mode={mode} onChange={onMode} />

      {notice ? (
        <div className="mt-4">
          <NoticeBox notice={notice} />
        </div>
      ) : null}

      {mode === "code" ? (
        <>
          <div className="mt-7">
            <p className="t-label mb-2.5 text-center text-txt-muted">재입장 코드 12자리</p>
            <CodeCells
              label="재입장 코드"
              value={code}
              onChange={onCode}
              error={Boolean(codeError)}
              errorKey={errorKey}
              autoFocus
            />
            <p
              role={codeError ? "alert" : undefined}
              className={cn(
                "t-cap-strong keep-all mt-2.5 min-h-[22px] text-center transition-colors",
                codeError ? "text-err" : "text-txt-faint",
              )}
            >
              {codeError ?? "대소문자와 하이픈은 구분하지 않아요"}
            </p>
          </div>

          <div className="mt-[18px] flex flex-col gap-2">
            <Disclosure icon="key-round" title="코드는 어디서 보나요?">
              첫 입장 때 한 번만 보여요. 저장해 두지 않았다면 이메일로 들어오거나 팀장 승인을 받아 들어온
              뒤, 팀의 계정과 기기 화면에서 새 코드를 받을 수 있어요.
            </Disclosure>
            <Disclosure icon="circle-alert" tone="warn" title="본인이 아니라면">
              팀 안에서는 이름이 겹칠 수 없어 이 이름으로는 들어올 수 없어요. 뒤로 가서 다른 이름으로
              신청해 주세요.
            </Disclosure>
          </div>
        </>
      ) : (
        <EmailView
          email={email}
          onEmail={onEmail}
          sent={emailSent}
          code={emailCode}
          onCode={onEmailCode}
          error={emailError}
          note={emailNote}
          devCode={devCode}
          onResend={onResend}
          onSendAnother={onSendAnother}
          working={working}
        />
      )}
    </>
  );
}

/**
 * 이메일로 들어오는 칸.
 *
 * 등록해 둔 주소로 인증번호 6자리를 보낸다. 주소가 팀에 등록된 것과 다르면 보내지 않는다.
 * 메일에는 로그인 링크를 넣지 않는다 — 링크는 팀을 가리지 않아 이 길의 귀속 규칙을 깬다.
 */
function EmailView({
  email,
  onEmail,
  sent,
  code,
  onCode,
  error,
  note,
  devCode,
  onResend,
  onSendAnother,
  working,
}: {
  email: string;
  onEmail: (v: string) => void;
  sent: boolean;
  code: string;
  onCode: (v: string) => void;
  error: string | null;
  note: string | null;
  devCode: string | null;
  onResend: () => void;
  onSendAnother: () => void;
  working: boolean;
}) {
  return (
    <div className="mt-6 flex flex-col gap-3.5">
      {note ? <Note tone="warn" icon="circle-alert">{note}</Note> : null}

      {sent ? (
        <>
          <Note tone="info" icon="mail" title="인증번호를 보냈어요">
            <b className="font-bold">{email.trim()}</b>로 보냈어요. 10분 안에 적어 주세요.
          </Note>

          {devCode ? (
            <Note tone="y" icon="info" title="개발 환경">
              메일이 나가지 않아 여기에 인증번호를 보여 드려요. 인증번호: <b className="font-bold">{devCode}</b>
            </Note>
          ) : null}

          <Field label="인증번호 6자리" required error={error}>
            {(props) => (
              <Input
                {...props}
                value={code}
                onChange={onCode}
                placeholder="000000"
                mono
                inputMode="numeric"
                maxLength={6}
                error={Boolean(error)}
                autoFocus
              />
            )}
          </Field>

          <div className="-mt-1 flex items-center justify-between">
            <Btn size="sm" v="ghost" onClick={onSendAnother} disabled={working}>
              다른 이메일로 보내기
            </Btn>
            <Btn size="sm" v="ghost" onClick={onResend} disabled={working}>
              인증번호 다시 받기
            </Btn>
          </div>
        </>
      ) : (
        <Field
          label="처음 등록한 이메일"
          required
          hint="팀에 등록해 둔 이메일로 인증번호 6자리를 보내 드려요."
          error={error}
        >
          {(props) => (
            <Input
              {...props}
              type="email"
              value={email}
              onChange={onEmail}
              placeholder="name@school.ac.kr"
              error={Boolean(error)}
              autoFocus
            />
          )}
        </Field>
      )}
    </div>
  );
}

function WaitingView({ name }: { name: string }) {
  return (
    <>
      <div className="relative mx-auto grid h-[190px] place-items-center">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            aria-hidden="true"
            className="absolute inset-0 m-auto size-[150px] animate-ring-out rounded-full border-2 border-yellow-400"
            style={{ animationDelay: `${i * 0.93}s` }}
          />
        ))}
        <NameAvatar name={name} className="relative size-[76px] animate-float text-[30px] leading-none" />
      </div>

      <h1 className="t-h1-sm animate-slide-up text-center text-txt-strong">팀장의 승인을 기다려요</h1>
      <p className="t-note mt-1 mb-5 text-center text-txt-muted">
        승인되면 이 화면이 자동으로 넘어가요
      </p>

      <div className="rounded-card border border-line bg-card px-4 py-2.5">
        <Step state="done" label="요청 보냄" />
        <Step state="now" label="팀장 확인" note={`${REJOIN_EXPIRED_AFTER_DAYS}일 안에`} />
        <Step state="wait" label="승인 완료" />
      </div>

      <div className="mt-3">
        <Disclosure icon="shield-check" title="왜 승인이 필요한가요">
          이름만으로 들어올 수 있으면 코드를 아는 사람이 팀원인 척할 수 있어요. 기여 기록과 1:1 대화가
          걸려 있어 한 단계를 둡니다. {REJOIN_EXPIRED_AFTER_DAYS}일 안에 확인되지 않으면 요청이 끝나고,
          같은 이름으로 다시 신청할 수 있어요.
        </Disclosure>
      </div>
    </>
  );
}

function ExpiredView() {
  return (
    <>
      <div className="mt-6">
        <Note tone="warn" icon="clock" title="요청이 끝났어요">
          {rejoinExpiredText(REJOIN_EXPIRED_AFTER_DAYS)}
        </Note>
      </div>
    </>
  );
}

function Step({
  state,
  label,
  note,
}: {
  state: "done" | "now" | "wait";
  label: string;
  note?: string;
}) {
  return (
    <div className="flex min-h-10 items-center gap-3">
      <span
        className={cn(
          "grid size-6 flex-none place-items-center rounded-full border-[1.5px] transition-colors duration-300",
          state === "done" && "border-transparent bg-yellow-400 text-ink-900",
          state === "now" && "border-yellow-500 bg-card",
          state === "wait" && "border-cr-300 bg-card",
        )}
      >
        {state === "done" ? <Icon name="check" size={14} strokeWidth={3} /> : null}
        {state === "now" ? (
          <span className="flex gap-0.5" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="size-[3px] animate-pulse rounded-full bg-yellow-700"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </span>
        ) : null}
      </span>
      <div
        className={cn(
          "text-[15px] leading-[1.4] keep-all",
          state === "wait" ? "font-medium text-txt-faint" : "font-bold text-txt-strong",
        )}
      >
        {label}
        {note ? <span className="font-medium text-txt-muted"> · {note}</span> : null}
      </div>
    </div>
  );
}

/** 들어온 뒤 잠깐 보여 주는 완료 화면. 화면을 덮어 뒤의 내용이 움직이지 않게 한다. */
function Welcome({ name }: { name: string }) {
  return (
    <div className="absolute inset-0 z-50 flex animate-fade-in flex-col items-center justify-center gap-3.5 bg-page">
      <div className="grid size-22 animate-pop place-items-center rounded-full bg-yellow-400 text-ink-900">
        <Icon name="check" size={40} strokeWidth={3} />
      </div>
      <div className="t-h1-sm text-txt-strong">{name}님, 돌아왔어요</div>
      <div className="t-note text-txt-muted">팀으로 이동하는 중</div>
    </div>
  );
}
