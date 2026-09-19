import { Panel } from "@/components/ui";
import type { RecentItem } from "@/lib/types";

/**
 * 3분할의 오른쪽 기둥 — 대화에서 언급된 자료를 옆에 띄워 둔다.
 *
 * 좁은 화면에는 이 기둥이 없다. 대화 중 파일을 보려면 드라이브 탭으로 다녀와야 하는데,
 * 넓은 화면에서는 그럴 이유가 없다.
 */
export function ChatInfoPane({ recent }: { recent: RecentItem[] }) {
  const file = recent[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
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

      <p className="keep-all m-0 font-medium text-[12.5px] leading-[1.6] text-txt-faint">
        대화에서 언급된 자료가 여기에 모입니다. 좁은 화면에서는 드라이브 탭에서 같은 내용을 봅니다.
      </p>
    </div>
  );
}
