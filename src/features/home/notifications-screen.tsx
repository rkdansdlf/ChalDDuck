"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppBar, Body, Btn, Chip, Icon, Note, Panel, Rows, SecTitle } from "@/components/ui";
import type { AppNotification } from "@/lib/types";
import { markNotificationsRead, pollNotifications } from "@/server/actions/notifications";
import { usePoll } from "@/lib/use-poll";

/**
 * 알림함.
 *
 * 팀플에서 놓치는 일은 대부분 "나한테 온 줄 몰랐다"에서 온다. 콕 찌르기·회의 제안·정정
 * 요청은 전부 "알린다"고 적혀 있었지만, 앱을 열어 그 화면까지 가야만 보였다.
 *
 * 푸시는 아직 없다. 먼저 **앱을 열면 반드시 보이는 자리**부터 만든다.
 */

/** 알림 종류마다 다른 아이콘·색. 상태는 색만으로 구분하지 않는다는 규칙대로 글도 함께 있다. */
const LOOK: Record<AppNotification["kind"], { icon: string; surface: string; label: string }> = {
  poke: { icon: "bell", surface: "bg-yellow-200 text-yellow-700", label: "진행상황 요청" },
  meeting: { icon: "calendar-clock", surface: "bg-yellow-200 text-yellow-700", label: "회의" },
  "schedule-ask": { icon: "calendar-clock", surface: "bg-yellow-200 text-yellow-700", label: "시간표 요청" },
  "contrib-dispute": { icon: "circle-alert", surface: "bg-coral-100 text-coral-700", label: "의견 차이" },
  "contrib-confirm": { icon: "check", surface: "bg-fill text-txt-muted", label: "기록 확인" },
  "join-request": { icon: "user-plus", surface: "bg-coral-100 text-coral-700", label: "가입 요청" },
  "rejoin-request": { icon: "user-search", surface: "bg-coral-100 text-coral-700", label: "재입장 요청" },
  icebreak: { icon: "drama", surface: "bg-fill text-txt-muted", label: "아이스브레이킹" },
  drive: { icon: "folder-open", surface: "bg-yellow-200 text-yellow-700", label: "드라이브" },
};

/**
 * 알림함은 **도착한 순간에 보여야 한다.**
 *
 * 예전에는 요청마다만 그렸다. 알림이 도착해도 탭 배지만 바뀌고(30초마다 다시 세므로) 목록은
 * 그대로였는데, 배지가 숫자를 올려 주면서 정작 그 숫자가 가리키는 곳이 낡아 있으면 어느 쪽을
 * 믿어야 할지 모른다. "뭔가 왔는데 목록에 없다"가 이 화면의 가장 흔한 상태였다.
 */
const NOTIFICATION_POLL_MS = 20_000;

export function NotificationsScreen({ items }: { items: AppNotification[] }) {
  const router = useRouter();
  const [working, setWorking] = useState(false);

  const [polled, setPolled] = useState<AppNotification[] | null>(null);
  // 내가 읽었으면 서버가 준 값을 따른다 — 폴링이 그 위에 얹으면 방금 지운 것이 되살아난다.
  const [touched, setTouched] = useState(false);
  usePoll(
    async () => {
      if (touched) return;
      setPolled(await pollNotifications());
    },
    NOTIFICATION_POLL_MS,
    !touched,
  );
  const list = touched ? items : (polled ?? items);

  const unread = list.filter((n) => !n.read).length;

  const open = async (item: AppNotification) => {
    if (!item.read) {
      setTouched(true);
      await markNotificationsRead([item.id]);
    }
    if (item.href) router.push(item.href);
    else router.refresh();
  };

  return (
    <>
      <AppBar
        title="알림"
        sub={unread > 0 ? `안 읽은 알림 ${unread}건` : undefined}
        onBack={() => router.push("/home")}
      />

      <Body dense>
        {list.length > 0 ? (
          <>
            <div className="mb-3.5 flex items-center gap-2">
              <SecTitle className="m-0 flex-1" note="누르면 그 화면으로 갑니다">
                최근 알림 {list.length}건
              </SecTitle>
              {unread > 0 ? (
                <Btn
                  size="sm"
                  v="outline"
                  icon="check"
                  disabled={working}
                  onClick={async () => {
                    setWorking(true);
                    try {
                      setTouched(true);
                      await markNotificationsRead();
                      router.refresh();
                    } finally {
                      setWorking(false);
                    }
                  }}
                >
                  모두 읽음
                </Btn>
              ) : null}
            </div>

            <Rows>
              {list.map((item) => {
                const look = LOOK[item.kind];
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => open(item)}
                    className="box-border flex min-h-[56px] w-full cursor-pointer items-start gap-3 border-none bg-transparent px-[15px] py-[13px] text-left"
                  >
                    <span
                      className={`mt-0.5 grid size-[38px] flex-none place-items-center rounded-xl ${look.surface}`}
                    >
                      <Icon name={look.icon as never} size={18} />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span
                        className={`text-pretty-keep block text-[14.5px] leading-[1.45] ${
                          item.read ? "font-medium text-txt-muted" : "font-bold text-txt-strong"
                        }`}
                      >
                        {item.title}
                      </span>
                      <span className="keep-all mt-0.5 block font-medium text-[13px] leading-[1.45] text-txt-muted">
                        {item.body}
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-[5px]">
                        <Chip icon={look.icon as never}>{look.label}</Chip>
                        <span className="font-medium text-[12.5px] leading-[1.4] text-txt-faint">
                          {item.when}
                        </span>
                        {/* 안 읽음은 색 점이 아니라 글로도 말한다. */}
                        {item.read ? null : (
                          <Chip tone="warn" icon="circle-dashed">
                            안 읽음
                          </Chip>
                        )}
                      </span>
                    </span>

                    {item.href ? (
                      <span className="mt-2 flex-none text-txt-muted">
                        <Icon name="chevron-right" size={17} />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </Rows>
          </>
        ) : (
          <Panel s="fill" pad={16}>
            <p className="t-note keep-all m-0 text-center text-txt-muted">
              아직 온 알림이 없습니다. 팀원이 회의를 제안하거나 진행상황을 물으면 여기에 쌓입니다.
            </p>
          </Panel>
        )}

        <Note tone="info" icon="bell" className="mt-3.5">
          지금은 <b>앱 안에서만</b> 알립니다. 앱을 닫아 두면 오지 않습니다 — 휴대폰 푸시 알림은
          아직 붙이지 않았습니다.
        </Note>
      </Body>
    </>
  );
}
