"use client";

import { useState } from "react";
import { Btn } from "@/components/ui";
import type { ContribEvidence } from "@/lib/types";
import { getEvidenceUrl } from "@/server/actions/contrib";

/**
 * 기록에 붙은 근거 파일을 연다. 확인하는 팀원이 "맞습니다"를 누르기 전에 보는 자리다.
 *
 * 주소는 누를 때마다 서버가 새로 만든다(짧게 사는 서명 주소). 새 창은 **누른 순간에** 먼저
 * 연다 — 서버 응답을 기다린 뒤 열면 브라우저가 팝업으로 보고 막는다.
 */
export function EvidenceLink({ recordId, evidence }: { recordId: string; evidence: ContribEvidence }) {
  const [failed, setFailed] = useState(false);

  const open = async () => {
    const tab = window.open("", "_blank");
    const url = await getEvidenceUrl(recordId).catch(() => null);
    if (url && tab) {
      tab.location.href = url;
      setFailed(false);
    } else {
      tab?.close();
      setFailed(true);
    }
  };

  return (
    <Btn size="sm" v="outline" icon="paperclip" onClick={open} className="max-w-full">
      <span className="truncate">
        {failed ? "근거를 열지 못했습니다 — 다시 시도" : `근거 보기 · ${evidence.name} (${evidence.size})`}
      </span>
    </Btn>
  );
}
