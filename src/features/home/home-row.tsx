import { Icon, type IconName } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * 홈의 눌러서 이동하는 한 줄 — "내 확인이 필요한 일"과 "최근 자료·업무"가 함께 쓴다.
 *
 * 두 목록이 같은 클래스 문자열을 복사해 쓰고 있어서 한쪽만 고치면 모양이 어긋났다.
 * `lg` 는 지금 해야 하는 일(큰 칩·굵은 제목), `md` 는 참고용 목록이다.
 */
export function HomeRow({
  icon,
  title,
  note,
  onOpen,
  size = "md",
  surface,
}: {
  icon: IconName;
  title: string;
  note: string;
  onOpen: () => void;
  size?: "lg" | "md";
  /** 아이콘 칩의 면·글자 색. 없으면 중립 색. */
  surface?: string;
}) {
  const lg = size === "lg";
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group box-border flex w-full cursor-pointer items-center gap-3 border-none bg-transparent px-[15px] text-left select-none",
        "transition-colors duration-150 hover:bg-cr-50 active:scale-[0.99]",
        lg ? "min-h-[56px] py-3.5" : "min-h-[52px] py-[13px]",
      )}
    >
      <span
        className={cn(
          "grid flex-none place-items-center transition-transform duration-150 group-hover:scale-105",
          lg ? "size-[38px] rounded-xl" : "size-[34px] rounded-[11px]",
          surface ?? "bg-fill text-txt-muted",
        )}
      >
        <Icon name={icon} size={lg ? 19 : 17} />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "keep-all block text-txt-strong",
            lg ? "t-body-strong" : "font-semibold text-[14.5px] leading-[1.4]",
          )}
        >
          {title}
        </span>
        <span className="keep-all mt-0.5 block font-medium text-[13px] leading-[1.45] text-txt-muted">
          {note}
        </span>
      </span>
      <span className="flex-none text-txt-muted transition-transform duration-150 group-hover:translate-x-0.5">
        <Icon name="chevron-right" size={lg ? 17 : 16} />
      </span>
    </button>
  );
}
