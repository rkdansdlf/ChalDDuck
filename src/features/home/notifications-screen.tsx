"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppBar, Body, Btn, Chip, Icon, Note, Panel, Rows, SecTitle, Toast } from "@/components/ui";
import type { AppNotification } from "@/lib/types";
import { markNotificationsRead, pollNotifications } from "@/server/actions/notifications";
import { usePoll } from "@/lib/use-poll";
import { useAction } from "@/lib/use-action";
import { pushBlock, pushOn, type PushState } from "./push-model";
import { readPushState, turnOffPush, turnOnPush, type PushTurnOn } from "./push-client";

/**
 * 알림함.
 *
 * 팀플에서 놓치는 일은 대부분 "나한테 온 줄 몰랐다"에서 온다. 콕 찌르기·회의 제안·정정
 * 요청은 전부 "알린다"고 적혀 있었지만, 앱을 열어 그 화면까지 가야만 보였다.
 *
 * 푸시는 그 위에 얹은 길이다 — **앱을 열면 보이는 자리를 먼저 지켜야** 아래의 "닫아 둔
 * 사이"가 통할 의미가 있다. 켤 수 없는 기기(아이폰 설치 전, 서버 키 없음)도 그 사실을
 * 말하고 끝낸다. 조용히 아무것도 하지 않는 버튼은 쓰이지 않는다.
 */

/** 알림 종류마다 다른 아이콘·색. 상태는 색만으로 구분하지 않는다는 규칙대로 글도 함께 있다. */
const LOOK: Record<AppNotification["kind"], { icon: string; surface: string; label: string }> = {
  poke: { icon: "bell", surface: "bg-yellow-200 text-yellow-700", label: "진행상황 요청" },
  "task-assigned": { icon: "list-checks", surface: "bg-yellow-200 text-yellow-700", label: "담당 배정" },
  meeting: { icon: "calendar-clock", surface: "bg-yellow-200 text-yellow-700", label: "회의" },
  "schedule-ask": { icon: "calendar-clock", surface: "bg-yellow-200 text-yellow-700", label: "시간표 요청" },
  "contrib-dispute": { icon: "circle-alert", surface: "bg-coral-100 text-coral-700", label: "의견 차이" },
  "contrib-confirm": { icon: "check", surface: "bg-fill text-txt-muted", label: "기록 확인" },
  "join-request": { icon: "user-plus", surface: "bg-coral-100 text-coral-700", label: "가입 요청" },
  "rejoin-request": { icon: "user-search", surface: "bg-coral-100 text-coral-700", label: "재입장 요청" },
  icebreak: { icon: "drama", surface: "bg-fill text-txt-muted", label: "아이스브레이킹" },
  "who-does-it": { icon: "disc-3", surface: "bg-yellow-200 text-yellow-700", label: "누가 하지" },
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

/** 켜기·끄기가 끝난 뒤 뭐라고 말할지. 성공했다고 말할 수 없는 경우도 코드 그대로 둔다. */
const TURN_ON_TEXT: Record<PushTurnOn, string> = {
  on: "이제 앱을 닫아도 알림이 옵니다",
  denied: "브라우저가 알림을 막았습니다. 브라우저 설정에서 허용해 주세요.",
  unsupported: "이 브라우저는 밖으로 알림을 보낼 수 없습니다.",
  "not-configured": "서버에 푸시 키가 없어 켤 수 없습니다.",
  "needs-install": "아이폰·아이패드에서는 이 앱을 홈 화면에 설치해야 알림이 옵니다.",
  invalid: "이 브라우저가 준 구독을 읽지 못했습니다. 다시 시도해 주세요.",
  failed: "알림을 켜지 못했습니다. 다시 시도해 주세요.",
};

export function NotificationsScreen({
  items,
  unread: serverUnread,
  push,
}: {
  items: AppNotification[];
  /**
   * 안 읽은 알림의 **전체** 수(서버가 센다).
   *
   * 예전에는 목록(최근 50건)에서 직접 세었다. 그래서 63건이 쌓였는데 "50건" 이라 말하는 동안
   * 탭 배지는 63을 보여졌다 — 화면 안의 두 숫자가 어긋나면 어느 쪽을 믿어야 할지 알 수 없다.
   * 목록은 50건만 보여 주는 것이 조용한 정책이고, 그 수는 전체 기준이어야 한다.
   */
  unread: number;
  push: { configured: boolean; subscribed: boolean };
}) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const { toast, busy, run } = useAction();
  const pushBusy = busy.push === true;

  // 브라우저가 아는 값(권한·설치 여부·구독)이 서버 값에 얹힌 전체 상태.
  // 아직 못 읽었다면 null — 읽기 전에는 "꺼짐"이라고 말하지 않는다(그건 거짓말이다).
  const { configured, subscribed } = push;
  const [pushState, setPushState] = useState<PushState | null>(null);
  useEffect(() => {
    let alive = true;
    void readPushState({ configured, subscribed }).then((next) => {
      if (alive) setPushState(next);
    });
    return () => {
      alive = false;
    };
  }, [configured, subscribed]);

  const [polled, setPolled] = useState<{ items: AppNotification[]; unread: number } | null>(null);
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
  const list = touched ? items : (polled?.items ?? items);

  // 목록을 직접 세지 않는다 — 서버가 센 **전체** 안 읽은 수를 쓴다(위 주석 참고).
  // 내가 읽음을 눌러 서버 값이 낡아 있는 동안(`touched`)만 목록으로 내려앉힌 값을 쓴다.
  const unread = touched ? list.filter((n) => !n.read).length : (polled?.unread ?? serverUnread);
  // 목록 창 밖에도 안 읽은 것이 남았다면 말해 준다 — "왜 50개만 보여 주지"에 답이 되어야 한다.
  const beyondWindow = Math.max(0, unread - list.filter((n) => !n.read).length);

  const open = async (item: AppNotification) => {
    if (!item.read) {
      setTouched(true);
      await markNotificationsRead([item.id]);
    }
    if (item.href) router.push(item.href);
    else router.refresh();
  };

  const block = pushState ? pushBlock(pushState) : null;
  const on = pushState ? pushOn(pushState) : false;

  // 켜기·끄기를 한 뒤의 상태를 **직접 다시 읽어** 화면에 반영한다. 성공 문구와 상태 표시가
  // 어긋나면(알림은 안 오는데 켜짐이라고 표시) 사용자는 어느 쪽을 믿어야 할지 모른다.
  const togglePush = () =>
    run(
      "push",
      async () => {
        const code = on ? await turnOffPush() : await turnOnPush();
        setPushState(await readPushState({ configured, subscribed }));
        if (code === "off") return "알림을 껐습니다. 앱을 열면 알림함에서 계속 볼 수 있습니다";
        return TURN_ON_TEXT[code];
      },
      "알림 설정을 바꾸지 못했습니다. 다시 시도해 주세요.",
    );

  return (
    <>
      <AppBar
        title="알림"
        sub={unread > 0 ? `안 읽은 알림 ${unread}건` : undefined}
        onBack={() => router.push("/home")}
      />

      <Body dense>
        {/* 목록은 최근 50건만 보여 준다. 그 밖에 안 읽은 것이 남았으면 말해 준다 — 숫자가
            다르다는 걸 숨기면 "몇 개를 더 봐야 하지"에 답이 없다. */}
        {beyondWindow > 0 ? (
          <Note tone="info" icon="list" className="mb-3.5">
            최근 50건만 보여 줍니다. 안 읽은 것이 <b>{unread}건</b>이고 여기{" "}
            <b>{beyondWindow}건</b>이 더 있습니다 — 전부 읽음으로 표시하면 함께 정리됩니다.
          </Note>
        ) : null}
        <Panel s="card" pad={14} r={16} className="mb-3.5">
          <div className="mb-2 flex items-center gap-2">
            <span className="flex-none text-txt-muted">
              <Icon name="signal" size={17} />
            </span>
            <SecTitle className="m-0 flex-1" note="앱을 닫아 둔 사이에 오는 일">
              앱 밖에서도 받기
            </SecTitle>
            {/* 상태는 색 점이 아니라 아이콘과 글로 함께 말한다. */}
            {pushState ? (
              <Chip tone={on ? "ok" : "n"} icon={on ? "circle-check" : "bell"}>
                {on ? "켜짐" : "꺼짐"}
              </Chip>
            ) : null}
          </div>

          <p className="t-note keep-all mt-0 mb-2.5 text-txt-muted">
            {on
              ? "이 브라우저는 앱을 닫아도 알림이 옵니다. 같은 알림이 알림함에도 쌓입니다."
              : "켜 두면 이 브라우저에서 앱을 닫아도 알림이 옵니다. 끄더라도 이 알림함은 그대로 채워집니다."}
          </p>

          {block ? (
            <Note tone="info" icon="info" className="mb-2.5">
              {block.text}
            </Note>
          ) : null}

          <Btn
            full
            v={on ? "outline" : "primary"}
            icon={on ? "x" : "bell"}
            disabled={pushBusy || block !== null}
            onClick={togglePush}
          >
            {on ? "알림 끄기" : "알림 받기"}
          </Btn>
        </Panel>

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
          {on
            ? "못 받아 본 것은 이 알림함에서 언제든 다시 볼 수 있습니다."
            : "이 알림함은 앱을 열면 <b>항상</b> 보입니다. 앱을 닫아 둔 사이 놓치는 일은 위에서 푸시를 켜면 막을 수 있습니다."}
        </Note>
      </Body>
      <Toast msg={toast} />
    </>
  );
}
