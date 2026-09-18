import { AppBar, Body, Note, Panel, Rows } from "@/components/ui";

/**
 * 아직 구현하지 않은 탭 화면의 자리 표시.
 *
 * 온보딩(00~06)을 먼저 구현하기로 해서 나머지 화면은 비어 있다. 빈 화면을 그냥 두면
 * 무엇이 빠졌는지 알 수 없으므로, **이 탭에 들어올 화면 목록을 그대로 적어 둔다.**
 * 화면을 구현하면 해당 줄을 지우고 실제 화면으로 바꾸면 된다.
 */
export function ComingSoon({
  title,
  sub,
  screens,
}: {
  title: string;
  sub?: string;
  screens: Array<{ no: string; name: string; desc: string }>;
}) {
  return (
    <>
      <AppBar title={title} sub={sub} />
      {/* 탭바가 본문 위에 떠 있으므로 마지막 항목이 가려지지 않도록 아래를 비워 둔다 */}
      <Body pad={104}>
        <Note tone="info" icon="info" title="아직 만들지 않은 화면입니다">
          지금 저장소에는 온보딩(00~06)과 공통 컴포넌트·디자인 토큰만 구현되어 있습니다. 아래는 이 탭에 들어올
          화면 목록입니다.
        </Note>

        <Panel s="fill" pad={14} className="mt-4 mb-2.5">
          <div className="t-cap-strong text-txt-muted">예정된 화면 {screens.length}개</div>
        </Panel>

        <Rows>
          {screens.map((screen) => (
            <div key={screen.no} className="flex gap-3 px-[15px] py-[13px]">
              <span className="font-mono font-bold text-[13px] leading-[1.5] text-txt-faint">{screen.no}</span>
              <span className="min-w-0 flex-1">
                <span className="t-body-strong keep-all block text-txt-strong">{screen.name}</span>
                <span className="keep-all mt-0.5 block text-[13px] leading-[1.45] text-txt-muted">
                  {screen.desc}
                </span>
              </span>
            </div>
          ))}
        </Rows>
      </Body>
    </>
  );
}
