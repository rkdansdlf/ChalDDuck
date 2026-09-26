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
import type { JoinRequestRow, MyDevice, RejoinRequest } from "@/data/api";
import type { Member } from "@/lib/types";
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
  transferLeadership,
} from "@/server/actions/team";

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
  devices,
  isLeader,
  teamName,
  others,
}: {
  requests: RejoinRequest[];
  /** 팀에 처음 들어오려는 요청. 팀장이 아니면 빈 목록. */
  joins: JoinRequestRow[];
  devices: MyDevice[];
  isLeader: boolean;
  teamName: string;
  /** 나를 뺀 지금 팀원. 팀장을 넘길 상대를 고를 때 쓴다. */
  others: Member[];
}) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  /** 열려 있는 시트 — 팀장 넘기기 / 넘기고 나가기 / 프로젝트 없애기. */
  const [sheet, setSheet] = useState<"hand" | "handLeave" | "disband" | "leave" | null>(null);
  const [confirmName, setConfirmName] = useState("");

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  };

  const resolve = async (id: string, approve: boolean, who: string) => {
    if (working) return;
    setWorking(true);
    try {
      const result = await resolveRejoinClaim(id, approve);
      router.refresh();
      flash(
        result === "gone"
          ? "이미 정리된 요청입니다"
          : approve
            ? `${who}님의 재입장을 승인했습니다`
            : `${who}님의 요청을 거절했습니다`,
      );
    } finally {
      setWorking(false);
    }
  };

  const resolveJoin = async (id: string, approve: boolean, who: string) => {
    if (working) return;
    setWorking(true);
    try {
      const result = await resolveJoinRequest(id, approve);
      router.refresh();
      flash(
        result === "gone"
          ? "이미 정리된 요청입니다"
          : approve
            ? `${who}님이 팀에 들어왔습니다`
            : `${who}님의 요청을 거절했습니다`,
      );
    } finally {
      setWorking(false);
    }
  };

  return (
    <>
      <AppBar title="계정과 기기" sub="가입·재입장 승인" onBack={() => router.push("/team")} />

      <Body dense>
        {isLeader ? (
          <>
            <SecTitle note="초대 코드만으로는 들어올 수 없습니다 — 팀장이 마지막 문을 엽니다">
              들어오려는 사람 {joins.length}명
            </SecTitle>

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
                <Chip tone="ok" icon="check">
                  이 기기
                </Chip>
              ) : (
                <Btn
                  size="sm"
                  v="outline"
                  icon="x"
                  disabled={working}
                  onClick={async () => {
                    setWorking(true);
                    try {
                      await revokeDevice(device.id);
                      router.refresh();
                      flash("그 기기에서 내보냈습니다");
                    } finally {
                      setWorking(false);
                    }
                  }}
                >
                  내보내기
                </Btn>
              )}
            </div>
          ))}
        </Rows>

        <SecTitle note="잃어버렸다면 새로 받으세요">재입장 코드</SecTitle>
        {fresh ? (
          <Panel s="yellow" pad={18} r={18} className="mb-3 text-center">
            <div className="font-mono font-extrabold text-[20px] leading-[1.4] tracking-[.08em] text-ink-900">
              {fresh}
            </div>
            <div className="keep-all mt-2 font-medium text-[13px] leading-[1.5] text-yellow-700">
              이 화면을 지나면 다시 볼 수 없습니다. 이전 코드는 이제 쓸 수 없습니다.
            </div>
          </Panel>
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
          onClick={async () => {
            setWorking(true);
            try {
              setFresh(await regenerateRejoinCode());
            } finally {
              setWorking(false);
            }
          }}
        >
          재입장 코드 새로 받기
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
              onClick={async () => {
                setWorking(true);
                try {
                  if (sheet === "handLeave") await handOverAndLeave(member.id);
                  else {
                    await transferLeadership(member.id);
                    setSheet(null);
                    router.refresh();
                    flash(`${member.name}님이 팀장이 되었습니다`);
                  }
                } finally {
                  setWorking(false);
                }
              }}
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
            onClick={async () => {
              setWorking(true);
              try {
                await leaveTeam();
              } finally {
                setWorking(false);
              }
            }}
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
          맞다면 팀 이름 <b>{teamName}</b> 을(를) 그대로 적어 주세요.
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
            onClick={async () => {
              setWorking(true);
              try {
                await disbandTeam(confirmName);
              } finally {
                setWorking(false);
              }
            }}
          >
            없애기
          </Btn>
        </div>
      </Sheet>

      <Toast msg={toast} />
    </>
  );
}
