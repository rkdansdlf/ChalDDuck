import { Chip, Icon, type IconName } from "@/components/ui";
import type { ContribKind, ContribRecord } from "@/lib/types";
import { EvidenceLink } from "./evidence-link";

/**
 * 내 기여 기록 한 줄.
 *
 * 누가 넣은 기록인지(앱 / 나)와 확인 여부를 항상 함께 보여 준다 —
 * 내가 넣은 기록이 앱이 모은 기록과 구분되지 않으면 기록 전체를 믿을 수 없게 된다.
 */
export function ContribRow({ record, kinds }: { record: ContribRecord; kinds: ContribKind[] }) {
  const kind = kinds.find((k) => k.key === record.kind) ?? kinds[0];

  return (
    <div className="flex min-h-[56px] items-start gap-3 px-[15px] py-[13px]">
      <span className="mt-px grid size-[34px] flex-none place-items-center rounded-[11px] bg-fill text-txt-muted">
        <Icon name={kind.icon as IconName} size={17} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="text-pretty-keep font-medium text-[14.5px] leading-[1.5] text-txt-strong">
          {record.title}
        </div>

        <div className="mt-[5px] flex flex-wrap gap-x-[7px] gap-y-[3px]">
          <span className="t-cap-strong text-txt-muted">{kind.name}</span>
          <span className="font-medium text-[13px] leading-[1.4] text-txt-faint">{record.when}</span>
        </div>

        <div className="keep-all mt-1 text-[13px] leading-[1.5] text-txt-muted">{record.detail}</div>

        <div className="mt-[7px] flex flex-wrap gap-[5px]">
          <Chip icon={record.source === "auto" ? "wand-sparkles" : "user-round"}>
            {record.source === "auto" ? "앱이 수집" : "내가 추가"}
          </Chip>
          {record.state === "ok" ? (
            <Chip tone="ok" icon="check">
              확인함
            </Chip>
          ) : (
            <Chip tone="warn" icon="circle-dashed">
              확인 대기
            </Chip>
          )}
        </div>

        {record.evidence ? (
          <div className="mt-[9px]">
            <EvidenceLink recordId={record.id} evidence={record.evidence} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
