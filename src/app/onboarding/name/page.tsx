"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppBar, AppFrame, Body, Btn, Dock, Field, Icon, Input, Note, Progress, Undecided } from "@/components/ui";
import { findMemberByName, getTeamTeammatePreview } from "@/server/actions/onboarding";
import { setName, useOnboarding } from "@/features/onboarding/onboarding-state";
import { useOnboardingGate } from "@/features/onboarding/use-onboarding-gate";

const MIN_NAME = 2;

/**
 * 02 이름 입력.
 *
 * 가입이 없는 앱이라 **초대 코드 + 이름**이 사실상의 신원이다. 같은 코드에 같은 이름이
 * 이미 있으면 재입장 화면으로 보낸다 — 거기서 재입장 코드나 팀장 승인을 거친다.
 */
export default function NamePage() {
  const router = useRouter();
  const { teamCode, name } = useOnboarding();
  const ready = useOnboardingGate(true);

  const [existing, setExisting] = useState<{ name: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [teammateName, setTeammateName] = useState<string>("이서연");

  const trimmed = name.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_NAME;
  const isValid = trimmed.length >= MIN_NAME;

  useEffect(() => {
    if (!teamCode) return;
    getTeamTeammatePreview(teamCode).then((found) => {
      if (found) setTeammateName(found);
    });
  }, [teamCode]);

  useEffect(() => {
    let cancelled = false;
    const lookup =
      trimmed.length < MIN_NAME
        ? Promise.resolve(null)
        : findMemberByName(teamCode ?? "", trimmed);

    lookup.then((member) => {
      if (!cancelled) setExisting(member);
    });

    return () => {
      cancelled = true;
    };
  }, [teamCode, trimmed]);

  const proceed = async () => {
    if (checking) return;

    setChecking(true);
    const member = await findMemberByName(teamCode ?? "", trimmed).finally(() =>
      setChecking(false),
    );
    setExisting(member);

    if (!member) {
      router.push("/onboarding/mbti");
      return;
    }
    const query = new URLSearchParams({ code: teamCode ?? "", name: trimmed });
    router.push(`/join/rejoin?${query}`);
  };

  if (!ready) return null;

  return (
    <AppFrame label="02 이름 입력">
      <AppBar title="팀에 들어가기" sub="1 / 4단계" onBack={() => router.push("/join")} />
      <Body>
        <Progress step={1} total={4} className="mb-[18px]" />

        <h1 className="t-h1 keep-all m-0 mb-6 text-txt-strong">팀원들에게 보일 이름</h1>

        <Field label="이름" error={tooShort ? "두 글자 이상 적어 주세요." : null}>
          {(props) => (
            <Input
              {...props}
              value={name}
              onChange={setName}
              placeholder="예: 홍길동"
              error={tooShort}
              maxLength={20}
            />
          )}
        </Field>

        {/* 쓸 수 있는 이름 실시간 안내 */}
        {isValid && !existing && !checking ? (
          <div className="mt-2 flex items-center gap-1.5 font-medium text-[13.5px] text-ok">
            <Icon name="check" size={15} strokeWidth={2.5} />
            <span>쓸 수 있는 이름이에요</span>
          </div>
        ) : null}

        {existing ? (
          <Note tone="warn" icon="user-search" title="이미 쓰이고 있는 이름입니다" className="mt-3">
            &ldquo;{existing.name}&rdquo;님 기록이 이미 있습니다. 본인이 맞으면 다음 화면에서{" "}
            <b>재입장 코드</b>나 <b>팀장 승인</b>으로 들어오고, 아니면 다른 이름을 적어 주세요.
          </Note>
        ) : null}

        {/* 팀원 목록 미리보기 */}
        <div className="mt-7">
          <div className="t-sec mb-2.5 text-txt-strong">팀원 목록에는 이렇게 보여요</div>
          <div className="rounded-[18px] border border-line bg-card p-2 divide-y divide-line/60">
            {/* 기존 팀원 (예: 이서연) */}
            <div className="flex items-center gap-3 px-3 py-2.5">
              <div className="grid size-9 flex-none place-items-center rounded-full bg-yellow-100 text-yellow-800 font-bold text-[14px]">
                {teammateName.charAt(0) || "이"}
              </div>
              <span className="font-semibold text-[15px] text-txt-strong">
                {teammateName}
              </span>
            </div>

            {/* 본인 미리보기 */}
            <div className="flex items-center gap-3 px-3 py-2.5">
              <div className="grid size-9 flex-none place-items-center rounded-full border-2 border-dashed border-line-strong bg-card font-bold text-[14px] text-txt-strong">
                {trimmed.length > 0 ? trimmed.charAt(0) : "민"}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-[15px] text-txt-strong">
                  {trimmed.length > 0 ? trimmed : "민준"}
                </span>
                <span className="t-cap-strong text-yellow-700">나</span>
              </div>
            </div>
          </div>
          <p className="t-note mt-2.5 mb-0 text-txt-muted">실명이 아니어도 괜찮아요.</p>
        </div>

        <Undecided>
          동명이인이 있을 때 구분하는 더 나은 방법(예: 학번 뒷자리)이 있는지는 팀이 확인해야
          합니다. **같은 이름의 두 사람이 팀에 함께 있을 수는 없다** — `Member` 의 이름 유일 제약이
          두 번째를 막고, 막는 자리를 승인으로 옮겨 신청인에게 그대로 말해 준다.
        </Undecided>
      </Body>

      <Dock>
        <Btn
          full
          size="lg"
          disabled={!isValid || checking}
          onClick={proceed}
          iconRight="arrow-right"
        >
          {checking ? "확인하는 중…" : "다음"}
        </Btn>
      </Dock>
    </AppFrame>
  );
}
