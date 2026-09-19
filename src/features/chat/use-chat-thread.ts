"use client";

import { useCallback } from "react";
import { sendChatMessage } from "@/data/api";
import type { ChatMessage } from "@/lib/types";
import type { MbtiType } from "@/lib/mbti";
import { appendMessage, settleMessage, useThreadMessages } from "./messages-state";

/**
 * 한 대화방의 메시지와 보내기·다시 보내기.
 *
 * 단톡방(19)과 DM(31)이 전송 처리를 똑같이 하도록 한 곳에 모은다.
 * 전송 성공 여부는 서버가 정하고(`sendChatMessage`), 화면은 결과만 보고 그린다 —
 * 실패하면 말풍선 아래 "전송 실패 · 다시 보내기"가 붙는다.
 */
export function useChatThread(
  threadId: string,
  fromServer: ChatMessage[],
  me: { name: string; mbti: MbtiType | null },
) {
  const messages = useThreadMessages(threadId, fromServer);

  const send = useCallback(
    async (text: string) => {
      const { ok } = await sendChatMessage(threadId, text);
      appendMessage(threadId, {
        author: me.name,
        mbti: me.mbti,
        isMine: true,
        text,
        ok,
      });
    },
    [threadId, me.name, me.mbti],
  );

  const retry = useCallback(
    async (message: ChatMessage) => {
      const { ok } = await sendChatMessage(threadId, message.text);
      settleMessage(threadId, message.id, ok);
    },
    [threadId],
  );

  return { messages, send, retry };
}
