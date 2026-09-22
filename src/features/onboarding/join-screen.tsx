"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppFrame, Body, Btn, Chip, Dock, Input, Note, Panel, TopInset } from "@/components/ui";
import type { Team } from "@/lib/types";
import { setTeamCode } from "./onboarding-state";

/**
 * 01 초대 링크 입장 — 로그인 없이, 이름만 적고 들어간다.
 *
 * 초대 코드가 없거나 맞지 않으면 팀 정보를 보여 줄 수 없다. 그럴 때는 아무 팀이나
 * 대신 보여 주지 않고 코드를 묻는다 — 잘못된 팀에 들어가는 것이 더 나쁘다.
 */
export function JoinScreen({ team, requestedCode }: { team: Team | null; requestedCode: string }) {
  const router = useRouter();
  const [code, setCode] = useState(requestedCode);

  // 어느 팀에 들어가는 중인지 기억해 둔다. 이후 화면들이 이 코드로 기록을 잇는다.
  useEffect(() => {
    if (team) setTeamCode(team.code);
  }, [team]);

  return (
    <AppFrame label="01 초대 링크 입장">
      <TopInset tone="y" />
      <Body tone="y" pad={20} className="flex flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-[18px] pt-5 pb-2 text-center">
          <Image
            src="/assets/logo-mochi.png"
            alt=""
            width={132}
            height={132}
            priority
            className="block size-[132px] object-contain"
          />
          <div>
            <h1 className="t-display m-0 text-ink-900">찰떡</h1>
            <p className="text-pretty-keep mt-2 mb-0 font-medium text-[15px] leading-[1.6] text-ink-600">
              팀플을 시작하고, 함께 하고, 제출까지 준비하는 곳
            </p>
          </div>
        </div>

        {team ? (
          <Panel s="cream" pad={18}>
            <div className="t-cap-strong mb-1 text-txt-muted">초대받은 팀</div>
            <div className="t-h2 keep-all text-txt-strong">{team.name}</div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <Chip icon="book-open">{team.course}</Chip>
              <Chip icon="users-round">{team.memberCount}명</Chip>
              {team.dday ? (
                <Chip tone="y" icon="calendar-clock">
                  {team.dday}
                </Chip>
              ) : null}
            </div>
          </Panel>
        ) : (
          <Panel s="cream" pad={18}>
            <div className="t-label mb-2 text-txt-strong">초대 코드</div>
            <Input
              value={code}
              onChange={setCode}
              placeholder="예: CD-7F2Q"
              mono
              aria-label="초대 코드"
            />
            {requestedCode ? (
              <Note tone="err" icon="circle-alert" className="mt-3">
                <b>{requestedCode}</b> 코드의 팀을 찾을 수 없습니다. 코드를 다시 확인해 주세요.
              </Note>
            ) : (
              <Note tone="info" icon="info" className="mt-3">
                이미 팀에 들어가 있었다면, 같은 초대 코드와 이름으로 다시 입력하면 됩니다.
              </Note>
            )}
          </Panel>
        )}
      </Body>

      <Dock>
        {team ? (
          <Btn full size="lg" icon="arrow-right" onClick={() => router.push("/onboarding/name")}>
            이름만 적고 들어가기
          </Btn>
        ) : (
          <Btn
            full
            size="lg"
            icon="arrow-right"
            disabled={!code.trim()}
            onClick={() => router.push(`/join?code=${encodeURIComponent(code.trim())}`)}
          >
            초대 코드로 팀 찾기
          </Btn>
        )}
        <p className="t-cap keep-all m-0 text-center text-txt-muted">
          가입이나 로그인 없이 바로 들어갑니다
        </p>
        <button
          type="button"
          onClick={() => router.push("/join/new-team")}
          className="t-cap-strong cursor-pointer border-none bg-transparent pt-1.5 text-center text-link"
        >
          아직 팀이 없다면 — 새로 만들기
        </button>
      </Dock>
    </AppFrame>
  );
}
