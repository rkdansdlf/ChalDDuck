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
