import { cn } from "@/lib/cn";

/**
 * 데이터를 기다리는 동안 자리를 차지하는 막대.
 *
 * 실제 내용이 어떻게 생겼을지 모르므로 **구체적인 형태를 그리지 않는다.** 카드 몇 개와
 * 줄 몇 개라는 사실만 알린다 — 틀린 모양을 그렸다가 펄 때마다 화면이 튀는 것보다 낫다.
 * 읽는 사람에게 "곧 나온다"를, 눈으로만 확인하는 사람에게도 같은 말을 준다.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative mb-2.5 h-4 w-full overflow-hidden rounded-[7px] bg-fill",
        "last:mb-0",
        className,
      )}
    >
      <div
        className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/50 to-transparent"
      />
    </div>
  );
}
