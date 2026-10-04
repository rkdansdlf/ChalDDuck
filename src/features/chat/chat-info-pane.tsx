import { Panel } from "@/components/ui";
import type { RecentItem } from "@/lib/types";

/**
 * 3분할의 오른쪽 기둥 — 팀의 최근 자료·업무.
 *
 * 좁은 화면에는 이 기둥이 없다. 좁은 화면에서 자료를 보려면 드라이브 탭으로 다녀와야 하는데,
 * 넓은 화면에서는 그럴 이유가 없다.
 *
 * ## 여기 있는 것은 "이 대화의 자료"가 아니다
 *
 * 예전에는 이 기둥을 "대화에서 언급된 자료" 라고 불렀다. **아무것도 고르지 않았고, 이 대화와
 * 묶인 자료도 하나도 없다** — 넣는 값은 `getRecentItems(teamId)` 이고, 그것은 **팀 전체**의
 * 최신 파일 한 건과 "할 일" 한 건이다(`data/api.ts` 의 그 함수). 화면이 말하는 것과 화면이
 * 하는 것이 달라, 사용자는 말풍선에서 그 자료를 찾다가 돌아오게 된다.
 *
 * 그래서 문구를 실제 동작에 맞춘다. **이 대화만 모은 자료를 보여 주겠다는 약속은 여기 없다.**
 * 그렇게 하려면 `Message.driveVersionId` 로 지금 열려 있는 대화의 첨부만 골라내야 하는데,
 * 그것은 **문구를 고치는 일의 크기가 아니다** — 계약(무엇을 이 자리가 약속하는가)과 화면이
 * 함께 바뀌어야 하는 기능이다. 그때까지는 여기 있는 사실대로만 말한다.
 */
export function ChatInfoPane({ recent }: { recent: RecentItem[] }) {
  const file = recent[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
      <div className="t-cap-strong mb-2.5 font-bold text-txt-muted">최근 팀 자료·업무</div>

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

      <p className="keep-all m-0 font-medium text-[12.5px] leading-[1.6] text-txt-faint">
        팀 전체의 최근 항목입니다. 대화에서 올린 자료도 드라이브에 모이니, 좁은 화면에서는
        드라이브 탭에서 같은 내용을 봅니다.
      </p>
    </div>
  );
}
