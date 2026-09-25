"use client";

import { useRouter } from "next/navigation";
import { AppBar, Avatar, Body, Note, Rows, SecTitle, Undecided } from "@/components/ui";
import { softenProfanity } from "@/lib/profanity";
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
              preview={softenProfanity(thread.lastMessage).text}
              unread={thread.unread}
              onClick={() => router.push(`/chat/dm/${thread.id}`)}
            />
          ))}
        </Rows>

        <Note tone="info" icon="lock" className="mt-3.5">
          DM은 두 사람만 봅니다. 쿠션 번역기로 다듬어 보낸 말에는 단톡방과 똑같이 표시가 남습니다.
        </Note>

        <Undecided>
          DM 을 팀원이 먼저 개설할 수 있는지, 메시지 삭제·나가기가 되는지는 기획안에 없어 다루지
          않았습니다.
        </Undecided>
      </Body>
    </>
  );
}
