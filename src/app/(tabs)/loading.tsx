import { AppBar, Body, Skeleton } from "@/components/ui";

/**
 * 탭 화면을 기다리는 동안 그리는 것.
 *
 * 예전에는 `loading.tsx` 가 한 곳도 없었다. 탭을 옮길 때는 앞 화면이 남아 있으므로
 * 괜찮았지만, **하드 로드**(새로고침, PWA 실행, 주소 붙여넣기)에는 아무것도 없는 흰
 * 화면이 떴다. 이 앱은 원격 DB 라우터에 round-trip 이 있고 `db.ts` 가 "풀러가 응답하지
 * 않으면 화면이 영영 멈춘다"고 적어 둔 만큼, 그 시간이 길어질 수 있다는 뜻이다.
 *
 * 전부 모르는 화면을 임의로 그리지는 않는다 — 앱바와 본문 자리를 차지하는 모양만.
 */
export default function TabsLoading() {
  return (
    <>
      <AppBar title="불러오는 중" />
      <Body>
        <Skeleton className="mb-4" />
        <Skeleton />
        <Skeleton />
        <Skeleton className="mb-4" />
        <Skeleton />
      </Body>
    </>
  );
}
