"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { sendChatMessage } from "@/server/actions/chat";
import type { ChatMessage } from "@/lib/types";
import type { MbtiType } from "@/lib/mbti";
import { addFailedMessage, dropFailedMessage, useThreadMessages } from "./messages-state";

/**
 * 한 대화방의 메시지와 보내기·다시 보내기.
 *
 * 단톡방(19)과 DM(31)이 전송 처리를 똑같이 하도록 한 곳에 모은다.
 *
 * 성공한 메시지는 서버가 들고 있고 화면이 새로 받아 온다(`router.refresh`).
 * 실패한 것만 브라우저에 남겨 "다시 보내기"를 붙인다 — 사용자가 쓴 글을 잃지 않기 위해서다.
 */
export function useChatThread(
  threadId: string,
  fromServer: ChatMessage[],
  me: { name: string; mbti: MbtiType | null },
) {
  const router = useRouter();
  const messages = useThreadMessages(threadId, fromServer);

  const send = useCallback(
    async (text: string) => {
      try {
        const { ok } = await sendChatMessage(threadId, text);
        if (ok) {
          router.refresh();
          return;
        }
        throw new Error("보내지 못했습니다.");
      } catch {
        addFailedMessage(threadId, {
          author: me.name,
          mbti: me.mbti,
          isMine: true,
          text,
        });
      }
    },
    [threadId, me.name, me.mbti, router],
  );

  const retry = useCallback(
    async (message: ChatMessage) => {
      try {
        const { ok } = await sendChatMessage(threadId, message.text);
        if (!ok) return;
        dropFailedMessage(threadId, message.id);
        router.refresh();
      } catch {
        // 여전히 실패 — 말풍선은 그대로 두고 다시 누를 수 있게 한다
      }
    },
    [threadId, router],
  );

  return { messages, send, retry };
}
