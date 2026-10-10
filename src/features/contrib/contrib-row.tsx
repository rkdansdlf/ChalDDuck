import Link from "next/link";
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
          ) : record.state === "disputed" ? (
            // **반박된 사실을 본인의 화면에서도 숨기지 않는다.** 예전에는 `disputed` 를
            // `pending` 으로 접어 "확인 대기" 만 띄웠다 — 팀원이 다르다고 적었는데 나는
            // 아무 일도 없는 것으로 알고 있었다.
            <Chip tone="err" icon="circle-alert">
              팀원이 다르다고 적음
            </Chip>
          ) : (
            <Chip tone="warn" icon="circle-dashed">
              팀원 확인 대기
            </Chip>
          )}
        </div>

        {record.state === "disputed" ? (
          <div className="keep-all mt-2 flex flex-col gap-1 rounded-control bg-err/10 p-2.5 text-[13px] leading-[1.5] text-err">
            <span>팀원 확인에서 사실과 다르다는 의견이 남겨졌습니다.</span>
            <Link
              href={`/team/contrib/resolve/${record.id}`}
              className="inline-flex items-center gap-1 font-semibold text-err underline underline-offset-2 hover:opacity-85"
            >
              내용 확인 및 정정 협의하기 →
            </Link>
          </div>
        ) : null}

        {record.evidence ? (
          <div className="mt-[9px]">
            <EvidenceLink recordId={record.id} evidence={record.evidence} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
