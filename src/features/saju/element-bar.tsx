import { cn } from "@/lib/cn";
import { ELEMENT_KO, type Element } from "@/lib/saju/engine";
import { ELEMENT_WORD } from "@/lib/saju/copy";

/**
 * 오행 하나의 막대 — 내 사주와 팀 사주가 같이 쓴다.
 *
 * 많고 적음을 평가하지 않는다. 센 글자 수와 비율을 그릴 뿐이고, 가장 많은 오행만 진하게 칠한다
 * (색이 아니라 굵은 글씨도 함께 — 색만으로 구분하지 않는다).
 */
export function ElementBar({
  element,
  count,
  percent,
  top,
}: {
  element: Element;
  count: number;
  percent: number;
  top: boolean;
}) {
  const w = ELEMENT_WORD[element];
  return (
    <div>
      <div className="mb-1 flex justify-between text-[12px] font-medium text-txt-muted">
        <span className={cn(top && "font-bold text-txt-strong")}>
          {ELEMENT_KO[element]} {w.hanja} · {w.keyword}
        </span>
        <span>
          {count}글자 · {percent}%
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-line">
        <div
          className={cn("h-full transition-all duration-300", top ? "bg-yellow-500" : "bg-amber-200")}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
