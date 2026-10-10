"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AppBar,
  Avatar,
  Body,
  Btn,
  Chip,
  Icon,
  Input,
  Note,
  Panel,
  Rows,
  SecTitle,
  Sheet,
  Toast,
} from "@/components/ui";
import type { JoinRequestRow, MyDevice, MySaju, RejoinRequest } from "@/data/api";
import type { Member } from "@/lib/types";
import { useAction } from "@/lib/use-action";
import {
  regenerateRejoinCode,
  resolveJoinRequest,
  resolveRejoinClaim,
  revokeDevice,
} from "@/server/actions/rejoin";
import {
  disbandTeam,
  handOverAndLeave,
  leaveTeam,
  logOut,
  transferLeadership,
} from "@/server/actions/team";
import { updateMemberEmail } from "@/server/actions/email-auth";
import { MySajuCard } from "@/features/saju/my-saju";
import { TeamMbti } from "@/features/team/team-mbti";
import { resetOnboarding } from "./onboarding-state";

/**
 * 계정과 기기 — 인증에서 사람이 손댈 수 있는 것을 한 화면에 모은다.
 *
 * 세 가지가 있다:
 * - **재입장 요청 승인** (팀장만) — 새 기기에서 들어오려는 팀원을 확인해 준다.
 * - **내 기기** — 어디서 열려 있는지 보고, 남의 손에 있는 기기를 끊는다.
 * - **재입장 코드 재발급** — 잃어버렸을 때. 이전 코드는 즉시 못 쓰게 된다.
 */
export function AccessScreen({
  requests,
  joins,
  joinsCapped,
  devices,
  isLeader,
  teamName,
  others,
  members,
  myEmail,
  mySaju,
}: {
  requests: RejoinRequest[];
  /** 팀에 처음 들어오려는 요청. 팀장이 아니면 빈 목록. */
  joins: JoinRequestRow[];
  /**
   * 새 가입 요청을 일시 제한하고 있는가.
   *
   * **안 뜨면 안 된다.** 제한이 걸린 채로 아무 말 없이 있으면 팀장은 자기 목록이 안 차는
   * 이유를 모르고, 정작 그 제한을 건 팀원들은 왜 못 들어오지 않는다. 제한은 팀장만이 풀 수
   * 있으므로(요청을 거절하면 줄이 줄어든다) 팀장에게 말할 수 있는 사람이 팀장뿐이다.
   */
  joinsCapped: boolean;
  devices: MyDevice[];
  isLeader: boolean;
  teamName: string;
  /** 나를 뺀 지금 팀원. 팀장을 넘길 상대를 고를 때 쓴다. */
  others: Member[];
  /**
   * 나까지 포함한 지금 팀원 전체.
   *
   * `others` 는 팀장을 넘길 대상을 고르는 용도라 나를 뺀다. **내 MBTI 집계는 자기 자신을
   * 포함해야 하므로** 둘을 나눈다 — `others` 로 세면 내 값이 빠진 숫자가 팀의 숫자로
   * 나가는, 조용히 틀린 통계가 된다.
   */
  members: Member[];
  myEmail?: string | null;
  /** 내가 등록한 생년월일(시)과 계산 결과. 등록하지 않았으면 `null`. */
  mySaju?: MySaju | null;
}) {
  const router = useRouter();
  const [fresh, setFresh] = useState<string | null>(null);
  // 이 화면의 동작은 서로 배타적이다 — 하나가 끝나기 전에 다른 것을 받지 않는다.
  const { toast, busy, flash, run } = useAction();
  const working = busy.act === true;
  /** 열려 있는 시트 — 팀장 넘기기 / 넘기고 나가기 / 프로젝트 없애기 / 로그아웃 / 이메일 관리. */
  const [sheet, setSheet] = useState<"hand" | "handLeave" | "disband" | "leave" | "logout" | "email" | null>(null);
  const [emailValue, setEmailValue] = useState(myEmail ?? "");
  const [emailInput, setEmailInput] = useState(myEmail ?? "");
  const [confirmName, setConfirmName] = useState("");

  const resolve = (id: string, approve: boolean, who: string) =>
    run(
      "act",
      async () => {
        const result = await resolveRejoinClaim(id, approve);
        router.refresh();
        return result === "gone"
          ? "이미 정리된 요청입니다"
          : approve
            ? `${who}님의 재입장을 승인했습니다`
            : `${who}님의 요청을 거절했습니다`;
      },
      "처리하지 못했습니다. 다른 기기에서 이미 처리되었을 수 있어요.",
    );

  const resolveJoin = (id: string, approve: boolean, who: string) =>
    run(
      "act",
      async () => {
        const result = await resolveJoinRequest(id, approve);
        router.refresh();
        // **"들어왔습니다"라고 말하면 안 된다.** 팀원이 되는 것은 요청한 그 브라우저에서
        // 일어난다 — 세션 쿠키를 심을 수 있는 곳이 거기뿐이라서다(`actions/onboarding.ts`).
        // 여기서 만들면 팀장 기기에 그 사람의 계정이 생겨 버린다. 그러니 승인을 알리는
        // 것과 실제로 들어온 것을 구분해 말해야 한다.
        // **`name-taken` 은 승인이 아니다.** 팀에 같은 이름이 이미 있다는 뜻이고, 신청인은
        // 아직 팀원이 아니다. 여기서 "승인했습니다" 라고 말하면 팀장은 실제로 들어온 것으로
        // 알고, 신청인은 기다리다 실패한다(2026-09-28).
        if (result === "name-taken") {
          return `팀에 ${who}님과 같은 이름이 이미 있습니다 — 요청을 다른 이름으로 다시 보내 달라고 전해 주세요`;
        }
        return result === "gone"
          ? "이미 정리된 요청입니다"
          : approve
            ? `${who}님을 승인했습니다 — 상대가 승인 화면을 열어야 팀에 들어옵니다`
            : `${who}님의 요청을 거절했습니다`;
      },
      "처리하지 못했습니다. 다른 기기에서 이미 처리되었을 수 있어요.",
    );

  return (
    <>
      <AppBar title="계정과 기기" sub="가입·재입장 승인" onBack={() => router.push("/team")} />

      <Body dense>
        {isLeader ? (
          <>
            <SecTitle note="초대 코드만으로는 들어올 수 없습니다 — 팀장이 마지막 문을 엽니다">
              들어오려는 사람 {joins.length}명
            </SecTitle>

            {joinsCapped ? (
              <Note
                tone="warn"
                icon="circle-alert"
                title="새 요청을 일시 제한하고 있습니다"
                className="mb-3.5"
              >
                초대 코드를 아는 사람이 이름만 바꿔 가며 요청을 보내고 있습니다.{" "}
                <b>이미 들어 있는 요청은 그대로 처리해 주세요</b> — 거절하면 자리가 나고 새
                요청이 다시 들어옵니다.
              </Note>
            ) : null}

            {joins.length > 0 ? (
              <Rows className="mb-3.5">
                {joins.map((join) => (
                  <div key={join.id} className="px-[15px] py-[13px]">
                    <div className="flex items-start gap-[11px]">
                      <span className="mt-0.5 grid size-[34px] flex-none place-items-center rounded-xl bg-yellow-200 text-yellow-700">
                        <Icon name="user-plus" size={17} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-[14.5px] leading-[1.4] text-txt-strong">
                          {join.name}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-[5px]">
                          <Chip icon="hand">희망 역할 · {join.want}</Chip>
                          <Chip icon="info">{join.device}</Chip>
                          <Chip icon="calendar-clock">{join.when}</Chip>
                        </div>
                        <div className="mt-[9px] flex flex-wrap gap-1.5">
                          <Btn
                            size="sm"
                            icon="check"
                            disabled={working}
                            onClick={() => resolveJoin(join.id, true, join.name)}
                          >
                            들여보내기
                          </Btn>
                          <Btn
                            size="sm"
                            v="outline"
                            icon="x"
                            disabled={working}
                            onClick={() => resolveJoin(join.id, false, join.name)}
                          >
                            아닙니다
                          </Btn>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </Rows>
            ) : (
              <Panel s="fill" pad={16} className="mb-4">
                <p className="t-note keep-all m-0 text-center text-txt-muted">
                  들어오려는 사람이 없습니다.
                </p>
              </Panel>
            )}

            <SecTitle note="본인이 맞는지 확인하고 승인해 주세요">
              재입장 요청 {requests.length}건
            </SecTitle>

            {requests.length > 0 ? (
              <Rows className="mb-3.5">
                {requests.map((request) => (
                  <div key={request.id} className="px-[15px] py-[13px]">
                    <div className="flex items-start gap-[11px]">
                      <span className="mt-0.5 grid size-[34px] flex-none place-items-center rounded-xl bg-coral-100 text-coral-700">
                        <Icon name="user-search" size={17} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-[14.5px] leading-[1.4] text-txt-strong">
                          {request.who}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-[5px]">
                          <Chip icon="info">{request.device}</Chip>
                          <Chip icon="calendar-clock">{request.when}</Chip>
                          {/* 나갔다 온 사람이다. 팀장에게 그 사실이 없으면 "이 사람이 누구지"
                              가 되어 승인을 미루게 되고, 그동안 요청자는 기다리기만 한다. */}
                          {request.leftBefore ? (
                            <Chip tone="warn" icon="undo-2">
                              팀을 나갔다 온 사람
                            </Chip>
                          ) : null}
                        </div>
                        <div className="mt-[9px] flex flex-wrap gap-1.5">
                          <Btn
                            size="sm"
                            icon="check"
                            disabled={working}
                            onClick={() => resolve(request.id, true, request.who)}
                          >
                            본인이 맞습니다
                          </Btn>
                          <Btn
                            size="sm"
                            v="outline"
                            icon="x"
                            disabled={working}
                            onClick={() => resolve(request.id, false, request.who)}
                          >
                            아닙니다
                          </Btn>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </Rows>
            ) : (
              <Panel s="fill" pad={16} className="mb-3.5">
                <p className="t-note keep-all m-0 text-center text-txt-muted">
                  기다리는 요청이 없습니다.
                </p>
              </Panel>
            )}

            <Note tone="warn" icon="shield" title="승인 전에 본인에게 직접 확인하세요" className="mb-4">
              이름만으로는 누구인지 알 수 없습니다. 단톡방이나 직접 물어 확인한 뒤에 승인해
              주세요 — 승인하면 그 사람의 기여 기록과 1:1 대화를 볼 수 있게 됩니다.
            </Note>
          </>
        ) : null}

        <SecTitle note="내 이름으로 열려 있는 곳입니다">내 기기 {devices.length}대</SecTitle>
        <Rows className="mb-3.5">
          {devices.map((device) => (
            <div
              key={device.id}
              className="flex min-h-[56px] items-center gap-3 px-[15px] py-[13px]"
            >
              <span className="grid size-[34px] flex-none place-items-center rounded-xl bg-fill text-txt-muted">
                <Icon name="lock" size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-[14.5px] leading-[1.4] text-txt-strong">
                  {device.label}
                </span>
                <span className="mt-0.5 block font-medium text-[13px] leading-[1.45] text-txt-muted">
                  마지막 사용 {device.lastSeen}
                </span>
              </span>
              {device.isCurrent ? (
                <div className="flex items-center gap-1.5">
                  <Chip tone="ok" icon="check">
                    이 기기
                  </Chip>
                  <Btn
                    size="sm"
                    v="outline"
                    icon="log-out"
                    disabled={working}
                    onClick={() => setSheet("logout")}
                  >
                    로그아웃
                  </Btn>
                </div>
              ) : (
                <Btn
                  size="sm"
                  v="outline"
                  icon="x"
                  disabled={working}
                  onClick={() =>
                    void run(
                      "act",
                      async () => {
                        await revokeDevice(device.id);
                        router.refresh();
                        return "그 기기에서 내보냈습니다";
                      },
                      "내보내지 못했습니다. 다시 시도해 주세요.",
                    )
                  }
                >
                  내보내기
                </Btn>
              )}
            </div>
          ))}
        </Rows>

        <SecTitle note="등록해 두면 12자리 재입장 코드 없이 인증번호로 로그인할 수 있습니다">
          로그인 및 재접속 이메일
        </SecTitle>
        <Panel s="cream" pad={16} className="mb-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="t-cap-strong text-txt-muted">연결된 이메일</div>
              <div className="t-body font-medium text-txt-strong mt-0.5">
                {emailValue ? emailValue : "등록된 이메일이 없습니다"}
              </div>
            </div>
            <Btn
              v="outline"
              size="sm"
              onClick={() => {
                setEmailInput(emailValue);
                setSheet("email");
              }}
            >
              {emailValue ? "변경" : "등록"}
            </Btn>
          </div>
        </Panel>

        {/* MBTI 는 계정 값이다 — 캐릭터와 소통 방식에만 쓰고 역할 배정과는 무관하다.
            07 역할 조율에 두지 않는 이유는 그쪽 화면 주석에 적어 두었다. */}
        <TeamMbti members={members} />

        {/* 사주도 MBTI 와 같다 — 내 계정의 값이고 역할 배정에는 쓰이지 않는다. */}
        <MySajuCard saju={mySaju ?? null} />

        <SecTitle note="잃어버렸다면 새로 받으세요">재입장 코드</SecTitle>
        {fresh ? (
          <>
            <Panel s="yellow" pad={18} r={18} className="mb-2 text-center">
              <div className="font-mono font-extrabold text-[20px] leading-[1.4] tracking-[.08em] text-ink-900">
                {fresh}
              </div>
              <div className="keep-all mt-2 font-medium text-[13px] leading-[1.5] text-yellow-700">
                이 화면을 지나면 다시 볼 수 없습니다. 이전 코드는 이제 쓸 수 없습니다.
              </div>
            </Panel>

            {/* 최초 발급 화면과 같은 복사 수단을 둔다. 예전에는 여기서 복사도 확인도 없이
                한 번 눌러 끝났는데, 그럼 새 코드를 받아 놓고 지나쳐 두면 기존 코드도 새
                코드도 둘 다 없는 사람이 된다. */}
            <Btn
              v="outline"
              full
              icon="copy"
              className="mb-3"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(fresh);
                  flash("코드를 복사했습니다");
                } catch {
                  flash("복사하지 못했습니다. 코드를 직접 옮겨 적어 주세요.");
                }
              }}
            >
              코드 복사하기
            </Btn>
          </>
        ) : (
          <Panel s="fill" pad={16} className="mb-3">
            <p className="t-note keep-all m-0 text-center text-txt-muted">
              서버에는 해시만 남아 지금 코드를 다시 보여 드릴 수 없습니다. 새로 받으면 이전 코드는
              즉시 못 쓰게 됩니다.
            </p>
          </Panel>
        )}

        <Btn
          v="outline"
          size="sm"
          icon="key-round"
          disabled={working}
          onClick={() =>
            void run(
              "act",
              async () => {
                setFresh(await regenerateRejoinCode());
                return "새 코드를 받았습니다 — 이전 코드는 이제 쓸 수 없습니다";
              },
              "새 코드를 받지 못했습니다. 다시 시도해 주세요.",
            )
          }
        >
          재입장 코드 새로 받기
        </Btn>

        <SecTitle
          className="mt-5"
          note="팀원 지위와 기록은 유지되고 이 기기에서만 나갑니다"
        >
          로그아웃
        </SecTitle>
        <Btn
          v="outline"
          size="sm"
          icon="log-out"
          disabled={working}
          onClick={() => setSheet("logout")}
        >
          이 기기에서 로그아웃
        </Btn>

        <SecTitle className="mt-5" note={isLeader ? "팀장은 그냥 나갈 수 없습니다" : undefined}>
          팀에서 나가기
        </SecTitle>

        {isLeader ? (
          <>
            <Note tone="warn" icon="shield" title="팀장이 사라지면 팀이 잠깁니다" className="mb-3">
              새 기기에서 들어오려는 팀원을 승인해 줄 사람이 없어집니다. 그래서 나갈 때{" "}
              <b>팀장을 넘기거나 프로젝트를 없애야</b> 합니다.
            </Note>

            <div className="flex flex-wrap gap-[7px]">
              <Btn
                size="sm"
                v="outline"
                icon="user-round"
                disabled={working || others.length === 0}
                onClick={() => setSheet("hand")}
              >
                팀장 넘기기
              </Btn>
              <Btn
                size="sm"
                v="outline"
                icon="arrow-right"
                disabled={working || others.length === 0}
                onClick={() => setSheet("handLeave")}
              >
                팀장 넘기고 나가기
              </Btn>
              <Btn
                size="sm"
                v="ghost"
                icon="circle-alert"
                disabled={working}
                onClick={() => {
                  setConfirmName("");
                  setSheet("disband");
                }}
              >
                프로젝트 없애기
              </Btn>
            </div>

            {others.length === 0 ? (
              <Note tone="info" icon="info" className="mt-3">
                팀에 다른 사람이 없어 넘길 상대가 없습니다. 프로젝트를 없애는 길만 있습니다.
              </Note>
            ) : null}
          </>
        ) : (
          <Btn
            size="sm"
            v="outline"
            icon="x"
            disabled={working}
            onClick={() => setSheet("leave")}
          >
            팀에서 나가기
          </Btn>
        )}

      </Body>

      <Sheet
        open={sheet === "hand" || sheet === "handLeave"}
        title={sheet === "handLeave" ? "누구에게 넘기고 나갈까요" : "누구에게 넘길까요"}
        onClose={() => setSheet(null)}
      >
        <p className="text-pretty-keep m-0 mb-3.5 text-[14.5px] leading-[1.6] text-txt">
          고른 사람이 <b>새 기기 재입장을 승인</b>하게 됩니다.
          {sheet === "handLeave" ? " 넘긴 뒤 나는 팀에서 나갑니다." : ""}
        </p>
        <div className="flex flex-col gap-2">
          {others.map((member) => (
            <button
              key={member.id}
              type="button"
              disabled={working}
              onClick={() =>
                void run(
                  "act",
                  async () => {
                    if (sheet === "handLeave") {
                      await handOverAndLeave(member.id);
                      return;
                    }
                    await transferLeadership(member.id);
                    setSheet(null);
                    router.refresh();
                    return `${member.name}님이 팀장이 되었습니다`;
                  },
                  "팀장을 넘기지 못했습니다. 다시 시도해 주세요.",
                )
              }
              className="box-border flex min-h-[52px] w-full cursor-pointer items-center gap-2.5 rounded-control border border-line bg-card px-3.5 py-3 text-left"
            >
              <Avatar name={member.name} mbti={member.mbti} size={30} />
              <span className="font-semibold text-[14.5px] leading-[1.4] text-txt-strong">
                {member.name}
              </span>
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={sheet === "leave"} title="팀에서 나갈까요" onClose={() => setSheet(null)}>
        <p className="text-pretty-keep m-0 mb-4 text-[14.5px] leading-[1.6] text-txt">
          명단에서 빠지고 이 기기에서 로그아웃됩니다. <b>기여 기록과 올린 파일은 팀에 남습니다</b> —
          성적 근거라 지우지 않습니다. 마음이 바뀌면 같은 이름으로 다시 들어올 수 있습니다.
        </p>
        <div className="flex gap-2">
          <Btn full v="outline" disabled={working} onClick={() => setSheet(null)}>
            취소
          </Btn>
          <Btn
            full
            disabled={working}
            onClick={() =>
              void run("act", async () => {
                await leaveTeam();
              }, "나가지 못했습니다. 다시 시도해 주세요.")
            }
          >
            나가기
          </Btn>
        </div>
      </Sheet>

      <Sheet open={sheet === "disband"} title="프로젝트를 없앨까요" onClose={() => setSheet(null)}>
        <Note tone="warn" icon="circle-alert" title="되돌릴 수 없습니다" className="mb-3.5">
          팀원 {others.length + 1}명의 <b>기여 기록·채팅·파일 이력이 전부 사라집니다.</b> 내 것만이
          아니라 팀원들의 기록까지 없어집니다.
        </Note>
        <p className="text-pretty-keep m-0 mb-2 text-[14.5px] leading-[1.6] text-txt">
          맞다면 팀 이름을 <b>{teamName}</b> 그대로 적어 주세요.
        </p>
        <Input
          value={confirmName}
          onChange={setConfirmName}
          placeholder={teamName}
          aria-label="팀 이름 확인"
        />
        <div className="mt-3.5 flex gap-2">
          <Btn full v="outline" disabled={working} onClick={() => setSheet(null)}>
            취소
          </Btn>
          <Btn
            full
            disabled={working || confirmName.trim() !== teamName}
            onClick={() =>
              void run(
                "act",
                async () => {
                  await disbandTeam(confirmName);
                },
                "없애지 못했습니다. 다시 시도해 주세요.",
              )
            }
          >
            없애기
          </Btn>
        </div>
      </Sheet>

      <Sheet
        open={sheet === "email"}
        title={emailValue ? "이메일 변경" : "이메일 등록"}
        onClose={() => setSheet(null)}
      >
        <p className="text-pretty-keep m-0 mb-3 text-[14.5px] leading-[1.6] text-txt">
          등록된 이메일로 6자리 인증번호를 받아 복잡한 코드 없이 바로 로그인할 수 있습니다.
        </p>
        <div className="mb-4">
          <Input
            type="email"
            value={emailInput}
            onChange={setEmailInput}
            placeholder="예: student@university.ac.kr"
            autoFocus
          />
        </div>
        <div className="flex gap-2">
          <Btn full v="outline" disabled={working} onClick={() => setSheet(null)}>
            취소
          </Btn>
          <Btn
            full
            disabled={working || !emailInput.trim()}
            onClick={() =>
              void run(
                "act",
                async () => {
                  const res = await updateMemberEmail(emailInput);
                  if (!res.ok) {
                    if (res.reason === "email-in-use") throw new Error("팀 내 다른 팀원이 이미 등록한 이메일입니다.");
                    throw new Error("올바른 이메일 주소를 입력해 주세요.");
                  }
                  setEmailValue(emailInput.trim().toLowerCase());
                  setSheet(null);
                  router.refresh();
                  return "이메일을 저장했습니다";
                },
                "이메일을 저장하지 못했습니다. 형식을 확인해 주세요.",
              )
            }
          >
            저장
          </Btn>
        </div>
      </Sheet>

      <Sheet open={sheet === "logout"} title="이 기기에서 로그아웃할까요" onClose={() => setSheet(null)}>
        <p className="text-pretty-keep m-0 mb-3 text-[14.5px] leading-[1.6] text-txt">
          이 브라우저의 연결이 끊어집니다. <b>팀원 지위·기여 기록·채팅은 그대로 유지</b>됩니다.
        </p>
        <Note tone="info" icon="key-round" title="다시 들어올 때 필요해요" className="mb-4">
          다시 로그인하려면 <b>초대 코드와 이름</b>을 적은 뒤, <b>재입장 코드</b>를 입력하거나{" "}
          <b>팀장 승인</b>을 받아야 합니다.
        </Note>
        <div className="flex gap-2">
          <Btn full v="outline" disabled={working} onClick={() => setSheet(null)}>
            취소
          </Btn>
          <Btn
            full
            v="outline"
            icon="log-out"
            disabled={working}
            onClick={() =>
              void run(
                "act",
                async () => {
                  resetOnboarding();
                  await logOut();
                },
                "로그아웃하지 못했습니다. 다시 시도해 주세요.",
              )
            }
          >
            로그아웃
          </Btn>
        </div>
      </Sheet>

      <Toast msg={toast} />
    </>
  );
}
