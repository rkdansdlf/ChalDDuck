import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * 기여도 리포트가 만들어지는 네 단계.
 *
 * 순서 자체가 제품의 약속이다 — 앱이 모은 기록(1)을 본인이 확인하고(2),
 * 팀원이 확인한 뒤에(3) 문서가 된다(4). 사람의 확인을 건너뛰고 문서가 나오지 않는다.
 */
const STEPS = [
  { key: "auto", label: "자동 수집" },
  { key: "self", label: "본인 확인" },
  { key: "team", label: "팀원 확인" },
  { key: "report", label: "1장 PDF" },
] as const;

export function StepRail({ at }: { at: number }) {
  return (
    <ol
      aria-label={`기여도 리포트 ${STEPS.length}단계 중 ${at + 1}단계`}
      className="m-0 mb-4 flex list-none items-center gap-[5px] p-0"
    >
      {STEPS.map((step, i) => {
        const done = i < at;
        const current = i === at;
        return (
          <li key={step.key} className="contents">
            <span
              aria-current={current ? "step" : undefined}
              className={cn(
                "inline-flex flex-none items-center gap-1 whitespace-nowrap rounded-[9px] px-[9px] py-[5px] font-bold text-[13px] leading-[1.35]",
                current
                  ? "bg-ink-700 text-on-action"
                  : done
                    ? "bg-yellow-200 text-[#7A5E12]"
                    : "bg-fill text-txt-faint",
              )}
            >
              {done ? <Icon name="check" size={12} strokeWidth={3} /> : null}
              {step.label}
            </span>
            {i < STEPS.length - 1 ? (
              <span aria-hidden="true" className="h-px min-w-1 flex-1 bg-line" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
