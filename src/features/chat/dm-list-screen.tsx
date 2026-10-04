"use client";

import { useRouter } from "next/navigation";
import { AppBar, Avatar, Body, Note, Rows, SecTitle, Undecided } from "@/components/ui";
import type { DmThread } from "@/lib/types";
import { useSidebarThreadPoll } from "./thread-list-poll";
import { ThreadRow } from "./thread-row";

/** 30 1:1 DM 목록 — 단톡방과 별도로 팀원마다 하나씩 열린다. */
export function DmListScreen({ threads: fromServer }: { threads: DmThread[] }) {
  const router = useRouter();
  // 좁은 화면에서는 이 화면이 DM 목록의 전부다(넓은 화면의 왼쪽 기둥은 숨어 있다).
  // 기둥과 같은 폴링을 구독해야 새 DM·안 읽음 수가 새로고침 없이 따라온다 — 타이머는
  // 구독자가 몇이든 하나뿐이다. 팀 대화 미리보기는 이 화면에 없어 쓰지 않는다.
  const { threads } = useSidebarThreadPoll({ teamLast: null, threads: fromServer });

  return (
    <>
      <AppBar
        title="1:1 대화"
        sub={`${threads.length}명과의 대화`}
        onBack={() => router.push("/chat")}
      />

      <Body dense>
        <SecTitle note="팀 전체 채팅과는 별도로 개설됩니다">DM {threads.length}개</SecTitle>

        <Rows>
          {threads.map((thread) => (
            <ThreadRow
              key={thread.id}
              leading={<Avatar name={thread.name} mbti={thread.mbti} size={42} />}
              title={thread.name}
              time={thread.time}
              preview={thread.lastMessage}
              unread={thread.unread}
              onClick={() => router.push(`/chat/dm/${thread.id}`)}
            />
          ))}
        </Rows>

        <Note tone="info" icon="lock" className="mt-3.5">
          DM은 두 사람만 봅니다. 쿠션 번역기로 다듬어 보낸 말에는 단톡방과 똑같이 표시가 남습니다.
        </Note>

        <Undecided>
          DM 은 **개설 단계가 없다** — 상대 팀원을 고르고 첫 메시지를 보내면 그 자리에서 만들어진다
          (`threadKey` 를 서버가 만든다). 목록은 메시지가 있는 방만 보여 준다. **삭제·나가기는 아직
          없다** — 기획안에 없어 만들지 않았다.
        </Undecided>
      </Body>
    </>
  );
}
