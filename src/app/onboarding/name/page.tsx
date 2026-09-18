"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppBar, AppFrame, Body, Btn, Dock, Field, Input, Note, Progress, Sheet, StatusBar, Undecided } from "@/components/ui";
import { findExistingMember } from "@/data/api";
import { setName, useOnboarding } from "@/features/onboarding/onboarding-state";
import type { Member } from "@/lib/types";

const MIN_NAME = 2;

/**
 * 02 이름 입력.
 *
 * 가입이 없는 앱이라 **초대 코드 + 이름**이 사실상의 신원이다. 같은 코드에 같은 이름이
 * 이미 있으면 "본인 확인" 시트를 띄워 이전 기록에 이어 붙일지 묻는다.
 * (동명이인 구분 방법은 아직 확정되지 않은 정책 — 핸드오프 표 1행)
 */
export default function NamePage() {
  const router = useRouter();
  const { teamCode, name } = useOnboarding();

  const [existing, setExisting] = useState<Member | null>(null);
  const [confirming, setConfirming] = useState(false);
  /** "아니요, 다른 사람이에요" 를 고른 뒤에는 같은 이름으로 다시 묻지 않는다. */
  const [notMe, setNotMe] = useState(false);

  const trimmed = name.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_NAME;

  useEffect(() => {
    let cancelled = false;
    const lookup =
      trimmed.length < MIN_NAME
        ? Promise.resolve(null)
        : findExistingMember(teamCode ?? "", trimmed);

    lookup.then((member) => {
      if (!cancelled) setExisting(member);
    });

    // 타이핑 중 앞선 조회 결과가 뒤늦게 도착해 최신 입력을 덮어쓰지 않도록 취소한다
    return () => {
      cancelled = true;
    };
  }, [teamCode, trimmed]);

  const proceed = () => {
    if (existing && !notMe) {
      setConfirming(true);
      return;
    }
    router.push("/onboarding/mbti");
  };

  return (
    <AppFrame label="02 이름 입력">
      <StatusBar />
      <AppBar title="팀에 들어가기" sub="1 / 4단계" onBack={() => router.push("/join")} />
      <Body>
        <Progress step={1} total={4} className="mb-[18px]" />

        <h1 className="t-h1 keep-all m-0 mb-2 text-txt-strong">팀원들에게 보일 이름</h1>
        <p className="text-pretty-keep m-0 mb-5 text-[15px] leading-[1.62] text-txt">
          실명이 아니어도 됩니다. 팀원이 누구인지 알아볼 수 있는 이름이면 충분합니다.
        </p>

        <Field label="이름" required error={tooShort ? "두 글자 이상 적어 주세요." : null}>
          {(props) => (
            <Input
              {...props}
              value={name}
              onChange={(v) => {
                setName(v);
                setNotMe(false);
              }}
              placeholder="예: 김민준"
              error={tooShort}
              maxLength={20}
            />
          )}
        </Field>

        <Note tone="info" icon="key-round" title="초대 코드 + 이름으로 기록을 이어갑니다">
          같은 초대 코드({teamCode ?? "—"})로 같은 이름을 다시 적으면 이전 기록에 자동으로 연결됩니다. 기기를
          바꿔도 됩니다 — 별도 로그인은 필요 없습니다.
        </Note>

        {existing && !notMe ? (
          <Note tone="warn" icon="user-search" title="이미 쓰이고 있는 이름입니다" className="mt-3">
            &ldquo;{existing.name}&rdquo;님 기록이 이미 있습니다. 본인이 맞으면 이어서 들어가고, 아니면 다른
            이름을 적어 주세요.
          </Note>
        ) : null}

        <Undecided>
          동명이인이 있을 때 구분하는 더 나은 방법(예: 학번 뒷자리)이 있는지는 팀이 확인해야 합니다. 지금은
          이름만으로 구분합니다.
        </Undecided>
      </Body>

      <Dock>
        <Btn full size="lg" disabled={trimmed.length < MIN_NAME} onClick={proceed} iconRight="arrow-right">
          다음
        </Btn>
      </Dock>

      <Sheet open={confirming} title="본인 확인" onClose={() => setConfirming(false)}>
        <p className="text-pretty-keep m-0 mb-4 text-[14.5px] leading-[1.6] text-txt">
          <b>{existing?.name}</b>님이 맞으신가요? 맞으면 이전 기록(희망 역할·기여 기록 등)에 이어서 들어갑니다.
        </p>
        <div className="flex gap-2">
          <Btn
            full
            v="outline"
            onClick={() => {
              setConfirming(false);
              setNotMe(true);
            }}
          >
            아니요, 다른 사람이에요
          </Btn>
          <Btn
            full
            onClick={() => {
              setConfirming(false);
              router.push("/onboarding/mbti");
            }}
          >
            네, 저예요
          </Btn>
        </div>
      </Sheet>
    </AppFrame>
  );
}
