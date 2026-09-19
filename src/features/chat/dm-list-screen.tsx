"use client";

import { useRouter } from "next/navigation";
import { AppBar, Avatar, Body, Note, Rows, SecTitle, Undecided } from "@/components/ui";
import type { DmThread } from "@/lib/types";
import { useUnreadThreads } from "./messages-state";
import { ThreadRow } from "./thread-row";

/** 30 1:1 DM 목록 — 단톡방과 별도로 팀원마다 하나씩 열린다. */
export function DmListScreen({ threads: fromServer }: { threads: DmThread[] }) {
  const router = useRouter();
  const threads = useUnreadThreads(fromServer);

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
          DM 을 팀원이 먼저 개설할 수 있는지, 메시지 삭제·나가기가 되는지는 기획안에 없어 다루지
          않았습니다.
        </Undecided>
      </Body>
    </>
  );
}
