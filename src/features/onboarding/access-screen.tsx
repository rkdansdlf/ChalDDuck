"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AppBar,
  Body,
  Btn,
  Chip,
  Icon,
  Note,
  Panel,
  Rows,
  SecTitle,
  Toast,
  Undecided,
} from "@/components/ui";
import type { MyDevice, RejoinRequest } from "@/data/api";
import { regenerateRejoinCode, resolveRejoinClaim, revokeDevice } from "@/server/actions/rejoin";

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
  devices,
  isLeader,
}: {
  requests: RejoinRequest[];
  devices: MyDevice[];
  isLeader: boolean;
}) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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

  return (
    <>
      <AppBar title="계정과 기기" sub="재입장·승인" onBack={() => router.push("/team")} />

      <Body dense>
        {isLeader ? (
          <>
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
              key={device.token}
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
                      await revokeDevice(device.token);
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

        <Undecided>
          팀장을 넘기는 방법과, 팀장이 나갔을 때 누가 승인할지는 기획안에 없어 다루지 않았습니다.
        </Undecided>
      </Body>

      <Toast msg={toast} />
    </>
  );
}
