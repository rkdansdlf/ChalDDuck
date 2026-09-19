"use client";

import { Avatar, Icon, Note, Panel } from "@/components/ui";
import type { ChatMessage, DmThread, RecentItem, Team } from "@/lib/types";
import { MessageBubble } from "./message-bubble";

/**
 * 33 채팅 · PC 화면.
 *
 * 1024px 이상에서 목록 / 대화 / 정보를 3분할로 놓은 모습이다.
 * 좁은 화면에서는 32 → 19 → 31 처럼 한 화면씩 넘어간다.
 *
 * ⚠️ **아직 앱 셸이 반응형이 아니다.** 탭 화면들은 넓은 화면에서도 390px 기기 프레임
 * 안에 들어 있고, 이 페이지만 전체 폭을 쓴다. 그래서 사용자 경로에 링크를 두지 않고
 * 디자인 기준으로만 둔다(`/preview/chat-desktop`).
 *
 * 다만 화면을 그리는 재료는 실제 컴포넌트와 실제 데이터다 — 따로 만든 목업이면
 * 말풍선 규격이 바뀔 때 이 화면만 옛 모습으로 남는다.
 */
export function ChatDesktopPreview({
  team,
  messages,
  threads,
  recent,
}: {
  team: Team;
  messages: ChatMessage[];
  threads: DmThread[];
  recent: RecentItem[];
}) {
  const lastTeamMessage = messages.findLast((m) => m.status === "sent");
  const file = recent[0];

  return (
    <div className="min-h-dvh bg-cr-100 p-4 lg:p-8">
      <div className="mx-auto mb-4 max-w-[1040px]">
        <h1 className="t-h2 m-0 mb-1.5 text-txt-strong">채팅 · PC 화면 기준</h1>
        <Note tone="warn" icon="hammer" title="디자인 기준 페이지입니다">
          1024px 이상에서 채팅이 어떻게 보여야 하는지의 기준입니다. <b>앱 셸은 아직 반응형이 아니라</b>
          실제 탭 화면들은 넓은 화면에서도 390px 프레임 안에 들어 있습니다. 화면을 그리는 재료는 실제
          컴포넌트와 실제 데이터를 씁니다.
        </Note>
      </div>

      <div className="mx-auto flex h-[640px] max-w-[1040px] overflow-hidden rounded-card border border-line-strong bg-page shadow-lg">
        {/* 목록 */}
        <div className="flex w-[260px] flex-none flex-col border-r border-line bg-card">
          <div className="px-4 pt-4 pb-2.5 font-extrabold text-[15px] leading-[1.3] text-txt-strong">
            채팅
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex items-center gap-2.5 bg-yellow-100 px-4 py-3">
              <span className="grid size-[34px] flex-none place-items-center rounded-full bg-yellow-200 text-yellow-700">
                <Icon name="users-round" size={16} />
              </span>
              <span className="min-w-0">
                <span className="block font-bold text-[13.5px] leading-[1.3] text-txt-strong">
                  {team.name}
                </span>
                <span className="block overflow-hidden text-ellipsis whitespace-nowrap font-medium text-[12px] leading-[1.3] text-txt-muted">
                  {lastTeamMessage
                    ? `${lastTeamMessage.author}: ${lastTeamMessage.text}`
                    : "아직 대화가 없습니다"}
                </span>
              </span>
            </div>

            {threads.map((thread) => (
              <div key={thread.id} className="flex items-center gap-2.5 px-4 py-3">
                <Avatar name={thread.name} mbti={thread.mbti} size={34} />
                <span className="min-w-0">
                  <span className="block font-semibold text-[13.5px] leading-[1.3] text-txt-strong">
                    {thread.name}
                  </span>
                  <span className="block overflow-hidden text-ellipsis whitespace-nowrap font-medium text-[12px] leading-[1.3] text-txt-muted">
                    {thread.lastMessage}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 대화 */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-line px-5 py-3.5 font-bold text-[15px] leading-[1.3] text-txt-strong">
            {team.name}
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-5 py-4">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} showAuthor onRetry={() => {}} />
            ))}
          </div>
          <div className="flex gap-2 border-t border-line px-5 py-3">
            <div className="min-h-[42px] flex-1 rounded-full border-[1.5px] border-input-border bg-card" />
            <span className="grid size-[42px] flex-none place-items-center rounded-full bg-ink-700 text-on-action">
              <Icon name="send" size={16} />
            </span>
          </div>
        </div>

        {/* 선택한 자료·정보 */}
        <div className="w-[260px] flex-none border-l border-line bg-card p-4">
          <div className="t-cap-strong mb-2.5 font-bold text-txt-muted">선택한 자료·정보</div>
          {file ? (
            <Panel s="fill" pad={12} r={14} className="mb-2.5">
              <div className="font-semibold text-[13.5px] leading-[1.4] text-txt-strong">
                {file.title}
              </div>
              <div className="mt-[3px] font-medium text-[12px] leading-[1.4] text-txt-muted">
                {file.note}
              </div>
            </Panel>
          ) : null}
          <div className="keep-all font-medium text-[12.5px] leading-[1.6] text-txt-faint">
            600~1023px에서는 목록·상세를 선택적으로 나누고, 600px 미만(모바일)에서는 화면을 순서대로
            넘겨 같은 정보를 보여줍니다.
          </div>
        </div>
      </div>
    </div>
  );
}
