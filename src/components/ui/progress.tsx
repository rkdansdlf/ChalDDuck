import { cn } from "@/lib/cn";

/** 온보딩 단계 표시 바. 채워진 칸 수가 곧 완료한 단계 수다. */
export function Progress({
  step,
  total,
  className,
  label = "온보딩 진행 단계",
}: {
  step: number;
  total: number;
  className?: string;
  label?: string;
}) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={step}
      aria-valuetext={`${total}단계 중 ${step}단계`}
      className={cn("flex gap-1", className)}
    >
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={cn("h-1 flex-1 rounded-sm", i < step ? "bg-yellow-400" : "bg-cr-200")}
        />
      ))}
    </div>
  );
}

/**
 * 연속 진행률 막대(0~1). 단계가 아니라 **얼마나 왔는지**를 보일 때 — 파일 올리기 같은.
 *
 * 막대만으로 끝내지 않는다. 옆에 숫자(%)를 함께 두는 건 부르는 쪽의 몫이다.
 */
export function ProgressBar({
  value,
  label,
  className,
}: {
  value: number;
  label: string;
  className?: string;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn("h-1 overflow-hidden rounded-sm bg-cr-200", className)}
    >
      <div className="h-full rounded-sm bg-yellow-400 transition-[width] duration-200" style={{ width: `${pct}%` }} />
    </div>
  );
}
