"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppBar, AppFrame, Body, Btn, Dock, Field, Input, Note, Progress, TopInset, Undecided } from "@/components/ui";
import { findMemberByName } from "@/server/actions/onboarding";
import { setName, useOnboarding } from "@/features/onboarding/onboarding-state";

const MIN_NAME = 2;

/**
 * 02 이름 입력.
 *
 * 가입이 없는 앱이라 **초대 코드 + 이름**이 사실상의 신원이다. 같은 코드에 같은 이름이
 * 이미 있으면 재입장 화면으로 보낸다 — 거기서 재입장 코드나 팀장 승인을 거친다.
 * (동명이인 구분 방법은 아직 확정되지 않은 정책 — 핸드오프 표 1행)
 */
export default function NamePage() {
  const router = useRouter();
  const { teamCode, name } = useOnboarding();

  const [existing, setExisting] = useState<{ name: string } | null>(null);

  const trimmed = name.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_NAME;

  useEffect(() => {
    let cancelled = false;
    const lookup =
      trimmed.length < MIN_NAME
        ? Promise.resolve(null)
        : findMemberByName(teamCode ?? "", trimmed);

    lookup.then((member) => {
      if (!cancelled) setExisting(member);
    });

    // 타이핑 중 앞선 조회 결과가 뒤늦게 도착해 최신 입력을 덮어쓰지 않도록 취소한다
    return () => {
      cancelled = true;
    };
  }, [teamCode, trimmed]);

  const proceed = () => {
    // 이미 있는 이름이면 온보딩을 이어가지 않는다 — 본인이면 재입장, 아니면 다른 이름이다.
    // 예전에는 "네, 저예요"를 누르면 그대로 통과해서, 초대 코드를 아는 사람이 팀원을
    // 사칭할 수 있었다(사칭한 쪽이 상대의 희망 역할까지 덮어썼다).
    if (!existing) {
      router.push("/onboarding/mbti");
      return;
    }
    const query = new URLSearchParams({ code: teamCode ?? "", name: trimmed });
    router.push(`/join/rejoin?${query}`);
  };

  return (
    <AppFrame label="02 이름 입력">
      <TopInset />
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
              onChange={setName}
              placeholder="예: 김민준"
              error={tooShort}
              maxLength={20}
            />
          )}
        </Field>

        <Note tone="info" icon="key-round" title="처음 들어오는 이름이면 바로 통과합니다">
          초대 코드({teamCode ?? "—"})에 없는 이름이면 아무것도 더 묻지 않습니다. 이미 있는 이름이면
          본인 확인을 한 번 거칩니다 — 이름만으로 팀원인 척할 수 있으면 안 되기 때문입니다.
        </Note>

        {existing ? (
          <Note tone="warn" icon="user-search" title="이미 쓰이고 있는 이름입니다" className="mt-3">
            &ldquo;{existing.name}&rdquo;님 기록이 이미 있습니다. 본인이 맞으면 다음 화면에서{" "}
            <b>재입장 코드</b>나 <b>팀장 승인</b>으로 들어오고, 아니면 다른 이름을 적어 주세요.
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

    </AppFrame>
  );
}
