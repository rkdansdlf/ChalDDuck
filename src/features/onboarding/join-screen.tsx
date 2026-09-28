"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppFrame, Body, Btn, Chip, Dock, Icon, Input, Note, Panel, TopInset } from "@/components/ui";
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
 *
 * 복귀 사용자에게는 5개 경로를 한꺼번에 늘어놓지 않고 1+1 점진적 공개(Progressive Disclosure)로
 * "이 팀으로 계속하기"를 가장 강하게 안내한다.
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
  /** 기억 쿠키 바로가기를 보여 줄지. 사용자가 "다른 팀 · 다른 사람으로 들어가기"를 누르면 false. */
  const [showReturning, setShowReturning] = useState(!!returning);
  /** 복귀 모드에서 "다른 방법으로 시작하기" 아코디언 열림 여부 */
  const [showOtherMethods, setShowOtherMethods] = useState(false);
  /** 이메일 본인 확인 시트 열림 여부 */
  const [emailSheetOpen, setEmailSheetOpen] = useState(false);

  const isReturningMode = showReturning && Boolean(returning);

  // 어느 팀에 들어가는 중인지 기억해 둔다. 이후 화면들이 이 코드로 기록을 잇는다.
  useEffect(() => {
    if (team) setTeamCode(team.code);
  }, [team]);

  // **아직 기억하는 팀이 있는데 주소가 비어 있으면 그 팀으로 되돌린다.**
  const { teamCode: remembered } = useOnboarding();
  useEffect(() => {
    if (team || requestedCode || !remembered || returning) return;
    router.replace(`/join?code=${encodeURIComponent(remembered)}`);
  }, [team, requestedCode, remembered, returning, router]);

  return (
    <AppFrame label="01 초대 링크 입장">
      <TopInset tone="y" />
      <Body tone="y" pad={isReturningMode ? 28 : 20} className="flex flex-col">
        {isReturningMode && returning ? (
          <div className="my-auto flex w-full flex-col items-center py-2">
            {/* 상단 브랜딩 (복귀 모드: 25~30% 축소하여 행동 영역에 집중) */}
            <div className="flex flex-col items-center gap-2 pt-1 pb-3 text-center">
              <Image
                src="/assets/logo-mochi.png"
                alt=""
                width={96}
                height={96}
                priority
                className="block size-[96px] object-contain"
              />
              <div>
                <h1 className="t-h1 m-0 text-ink-900 font-extrabold tracking-tight">찰떡</h1>
                <p className="text-pretty-keep mt-1 mb-0 font-medium text-[13.5px] leading-snug text-ink-600">
                  팀플을 시작하고, 함께 하고, 제출까지 준비하는 곳
                </p>
              </div>
            </div>

            {/* 기본 카드: 최근 참여한 팀 & 원클릭 계속하기 */}
            <Panel s="cream" pad={20} className="w-full shadow-xs">
              <div className="t-h2 font-bold text-txt-strong keep-all">
                다시 오셨군요, {returning.name}님!
              </div>

              <div className="mt-3.5 pt-3.5 border-t border-line/60">
                <div className="t-cap-strong text-txt-muted">최근 참여한 팀</div>
                <div className="mt-1 text-[18px] font-bold text-txt-strong keep-all">
                  {returning.teamName}
                </div>
                {returning.course ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Chip icon="book-open">{returning.course}</Chip>
                  </div>
                ) : null}
              </div>

              <div className="mt-5">
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
                  이 팀으로 계속하기
                </Btn>
                <p className="mt-2.5 mb-0 text-center text-[12.5px] font-medium text-txt-muted">
                  로그인 없이 바로 들어가요
                </p>
              </div>
            </Panel>

            {/* 보조 경로 점진적 공개 (1+1 구조) */}
            <div className="mt-3.5 flex w-full flex-col items-center">
              <button
                type="button"
                onClick={() => setShowOtherMethods((prev) => !prev)}
                aria-expanded={showOtherMethods}
                className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-txt-muted transition-colors hover:bg-cr-100 hover:text-txt cursor-pointer border-none bg-transparent font-medium text-[13.5px]"
              >
                <span>다른 방법으로 시작하기</span>
                <Icon name={showOtherMethods ? "chevron-up" : "chevron-down"} size={16} />
              </button>

              {showOtherMethods && (
                <div className="mt-2.5 w-full overflow-hidden rounded-2xl border border-line bg-card shadow-xs transition-all animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="border-b border-line/60 bg-cr-25 px-4 py-2.5">
                    <span className="t-cap-strong text-txt-muted">다른 방법으로 시작하기</span>
                  </div>
                  <div className="divide-y divide-line/60">
                    {/* ✉ 이메일로 본인 확인하기 */}
                    <button
                      type="button"
                      onClick={() => setEmailSheetOpen(true)}
                      className="group flex w-full items-start gap-3.5 p-3.5 text-left cursor-pointer border-none bg-transparent transition-colors hover:bg-cr-50 active:bg-cr-100"
                    >
                      <div className="mt-0.5 grid size-9 flex-none place-items-center rounded-xl bg-cr-100 text-txt-strong transition-colors group-hover:bg-yellow-100 group-hover:text-yellow-900">
                        <Icon name="mail" size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-bold text-txt-strong group-hover:text-ink-900">
                          이메일로 본인 확인하기
                        </div>
                        <div className="mt-0.5 text-[12px] text-txt-muted leading-relaxed">
                          이전 정보를 다시 확인하고 시작해요
                        </div>
                      </div>
                      <div className="mt-2 text-txt-light group-hover:text-txt-muted">
                        <Icon name="chevron-right" size={16} />
                      </div>
                    </button>

                    {/* ⇄ 다른 팀 · 다른 사람으로 들어가기 */}
                    <button
                      type="button"
                      onClick={() => setShowReturning(false)}
                      className="group flex w-full items-start gap-3.5 p-3.5 text-left cursor-pointer border-none bg-transparent transition-colors hover:bg-cr-50 active:bg-cr-100"
                    >
                      <div className="mt-0.5 grid size-9 flex-none place-items-center rounded-xl bg-cr-100 text-txt-strong transition-colors group-hover:bg-yellow-100 group-hover:text-yellow-900">
                        <Icon name="arrow-left-right" size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-bold text-txt-strong group-hover:text-ink-900">
                          다른 팀 · 다른 사람으로 들어가기
                        </div>
                        <div className="mt-0.5 text-[12px] text-txt-muted leading-relaxed">
                          참여할 팀이나 사용자를 변경해요
                        </div>
                      </div>
                      <div className="mt-2 text-txt-light group-hover:text-txt-muted">
                        <Icon name="chevron-right" size={16} />
                      </div>
                    </button>

                    {/* ＋ 새 팀 만들기 */}
                    <button
                      type="button"
                      onClick={() => router.push("/join/new-team")}
                      className="group flex w-full items-start gap-3.5 p-3.5 text-left cursor-pointer border-none bg-transparent transition-colors hover:bg-cr-50 active:bg-cr-100"
                    >
                      <div className="mt-0.5 grid size-9 flex-none place-items-center rounded-xl bg-cr-100 text-txt-strong transition-colors group-hover:bg-yellow-100 group-hover:text-yellow-900">
                        <Icon name="plus" size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-bold text-txt-strong group-hover:text-ink-900">
                          새 팀 만들기
                        </div>
                        <div className="mt-0.5 text-[12px] text-txt-muted leading-relaxed">
                          처음부터 새로운 팀을 시작해요
                        </div>
                      </div>
                      <div className="mt-2 text-txt-light group-hover:text-txt-muted">
                        <Icon name="chevron-right" size={16} />
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* 일반 모드 (초대 링크 또는 코드 입력 화면) */}
            <div className="flex flex-1 flex-col items-center justify-center gap-[18px] pt-5 pb-2 text-center">
              <Image
                src="/assets/logo-mochi.png"
                alt=""
                width={124}
                height={124}
                priority
                className="block size-[124px] object-contain"
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
          </>
        )}
      </Body>

      {!isReturningMode && (
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

          <div className="flex flex-col items-center gap-1.5 pt-1">
            {returning ? (
              <button
                type="button"
                onClick={() => setShowReturning(true)}
                className="t-cap-strong cursor-pointer border-none bg-transparent text-center text-link"
              >
                ↩ {returning.name}님({returning.teamName})으로 다시 돌아가기
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setEmailSheetOpen(true)}
              className="t-cap-strong cursor-pointer border-none bg-transparent text-center text-link"
            >
              ✉️ 이메일로 본인 확인하기
            </button>

            <button
              type="button"
              onClick={() => router.push("/join/new-team")}
              className="t-cap cursor-pointer border-none bg-transparent text-center text-txt-muted"
            >
              아직 팀이 없다면 — 새 팀 만들기
            </button>
          </div>
        </Dock>
      )}

      <EmailLoginSheet
        open={emailSheetOpen}
        onClose={() => setEmailSheetOpen(false)}
      />
    </AppFrame>
  );
}
