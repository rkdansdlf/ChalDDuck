"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppFrame, Body, Btn, Chip, Dock, Input, Note, Panel, TopInset } from "@/components/ui";
import type { Team } from "@/lib/types";
import { setTeamCode, useOnboarding } from "./onboarding-state";
import { EmailLoginSheet } from "./email-login-sheet";

/**
 * 01 초대 링크 입장 — 로그인 없이, 이름만 적고 들어간다.
 *
 * 초대 코드가 없거나 맞지 않으면 팀 정보를 보여 줄 수 없다. 그럴 때는 아무 팀이나
 * 대신 보여 주지 않고 코드를 묻는다 — 잘못된 팀에 들어가는 것이 더 나쁘다.
 *
 * **기억 쿠키**(`cd_remember`)가 있으면 로그아웃 전 팀·이름을 알려 주고, 초대 코드와
 * 이름 입력을 건너뛰는 바로가기를 보여 준다.
 */

type ReturningInfo = {
  teamCode: string;
  name: string;
  teamName: string;
  course: string;
};

export function JoinScreen({
  team,
  requestedCode,
  returning,
}: {
  team: Team | null;
  requestedCode: string;
  returning: ReturningInfo | null;
}) {
  const router = useRouter();
  const [code, setCode] = useState(requestedCode);
  /** 기억 쿠키 바로가기를 보여 줄지. 사용자가 "다른 사람으로 들어가기"를 누르면 false. */
  const [showReturning, setShowReturning] = useState(!!returning);
  /** 이메일 로그인 시트 열림 여부 */
  const [emailSheetOpen, setEmailSheetOpen] = useState(false);

  // 어느 팀에 들어가는 중인지 기억해 둔다. 이후 화면들이 이 코드로 기록을 잇는다.
  useEffect(() => {
    if (team) setTeamCode(team.code);
  }, [team]);

  // **아직 기억하는 팀이 있는데 주소가 비어 있으면 그 팀으로 되돌린다.**
  //
  // 이 화면이 이 구역에서 가장 자주 오는 길이다 — 02 이름 화면의 뒤로가기, 재입장 화면,
  // 온보딩을 되돌아온 주소가 모두 여기로 모인다. 예전에는 여기서 항상 빈 입력창만 띄워
  // 방금 쓰던 코드를 다시 타이밍하게 했다. 서버는 저장소를 모으니 서버 렌더는 그대로
  // 비어 있고, 클라이언트가 주소를 바꿔 팀 정보를 받아 온다(첫 화면이 깜빡이지 않는다).
  //
  // 기억 쿠키(`returning`)가 있으면 이 효과를 건너뛴다 — 서버가 이미 팀 정보를 넘겨줬고,
  // 여기서 주소를 바꾸면 서버가 다시 렌더하면서 `returning` 이 null 이 되어 깜빡인다.
  const { teamCode: remembered } = useOnboarding();
  useEffect(() => {
    if (team || requestedCode || !remembered || returning) return;
    router.replace(`/join?code=${encodeURIComponent(remembered)}`);
  }, [team, requestedCode, remembered, returning, router]);

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

        {showReturning && returning ? (
          <Panel s="cream" pad={18}>
            <div className="t-cap-strong mb-1 text-txt-muted">다시 오셨군요!</div>
            <div className="t-h2 keep-all text-txt-strong">{returning.teamName}</div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <Chip icon="book-open">{returning.course}</Chip>
              <Chip icon="user-round">{returning.name}</Chip>
            </div>
          </Panel>
        ) : team ? (
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
        {showReturning && returning ? (
          <Btn
            full
            size="lg"
            icon="arrow-right"
            onClick={() => {
              setTeamCode(returning.teamCode);
              router.push(
                `/join/rejoin?code=${encodeURIComponent(returning.teamCode)}&name=${encodeURIComponent(returning.name)}`,
              );
            }}
          >
            {returning.name}님으로 다시 들어가기
          </Btn>
        ) : team ? (
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

        <div className="flex flex-col items-center gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => setEmailSheetOpen(true)}
            className="t-cap-strong cursor-pointer border-none bg-transparent text-center text-link"
          >
            ✉️ 이메일 인증으로 다시 시작하기
          </button>

          {showReturning && returning ? (
            <button
              type="button"
              onClick={() => setShowReturning(false)}
              className="t-cap cursor-pointer border-none bg-transparent text-center text-txt-muted"
            >
              다른 팀이나 다른 사람으로 들어가기
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => router.push("/join/new-team")}
            className="t-cap cursor-pointer border-none bg-transparent text-center text-txt-muted"
          >
            아직 팀이 없다면 — 새 팀 만들기
          </button>
        </div>
      </Dock>

      <EmailLoginSheet
        open={emailSheetOpen}
        onClose={() => setEmailSheetOpen(false)}
      />
    </AppFrame>
  );
}
