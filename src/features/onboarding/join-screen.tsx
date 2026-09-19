"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppFrame, Body, Btn, Chip, Dock, Panel, TopInset } from "@/components/ui";
import type { Team } from "@/lib/types";
import { setTeamCode } from "./onboarding-state";

/** 01 초대 링크 입장 — 로그인 없이, 이름만 적고 들어간다. */
export function JoinScreen({ team }: { team: Team }) {
  const router = useRouter();

  // 어느 팀에 들어가는 중인지 기억해 둔다. 이후 화면들이 이 코드로 기록을 잇는다.
  useEffect(() => {
    setTeamCode(team.code);
  }, [team.code]);

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
      </Body>

      <Dock>
        <Btn full size="lg" icon="arrow-right" onClick={() => router.push("/onboarding/name")}>
          이름만 적고 들어가기
        </Btn>
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
