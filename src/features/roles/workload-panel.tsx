"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Btn, Field, Icon, Input, Note, Panel, SecTitle, Sheet, type IconName } from "@/components/ui";
import type { MemberWorkSummary, Role, RoleKey } from "@/lib/types";
import { cn } from "@/lib/cn";
import type { useAction } from "@/lib/use-action";
import { setRoleEstimate } from "@/server/actions/roles";
import { WORK_CAPTION, othersLineOf, workLineOf } from "./work-copy";
import {
  MAX_ESTIMATE_HOURS,
  MIN_ESTIMATE_HOURS,
  OVERLOAD_RATIO,
  ROLE_KIND_LABEL,
  isEstimateHours,
  type MemberLoad,
  type Workload,
} from "./roster-model";

/** 소수가 있으면 한 자리까지, 아니면 정수로. "6시간" 과 "5.5시간". */
const hoursText = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(1)}시간`;

/**
 * 07 의 **팀원별 부담.**
 *
 * 누가 어떤 역할을 가져가느냐보다, 핵심 업무가 모두에게 돌아갔는지와 시간이 한 사람에게 몰리지
 * 않았는지를 한 면에 둔다. **추첨에는 아무 영향이 없다** — 협의할 때 보는 재료다.
 *
 * 예상 시간이 없으면 없다고 말한다. 평균이나 0 으로 메우면 숫자가 사실처럼 읽힌다.
 * 상태는 색만으로 말하지 않는다 — 막대 옆에 항상 시간 글자가 있고, 몰림은 문장으로 따로 적는다.
 */
export function WorkloadPanel({
  workload,
  memberCount,
  work,
  onEdit,
}: {
  workload: Workload;
  memberCount: number;
  /** 사람 id → 수행 기록 요약. 확정된 역할이 있는 사람 줄에만 쓴다. */
  work: Record<string, MemberWorkSummary>;
  onEdit: () => void;
}) {
  const { members, target, overloaded, pending, gaps, coreCovered } = workload;

  // 막대의 눈금 — 가장 긴 막대와 목표선이 함께 들어와야 한다.
  const scale = Math.max(1, ...members.map((m) => m.hours), (target ?? 0) * 1.25);

  return (
    <section className="mt-7" aria-label="팀원별 부담">
      <SecTitle
        note={target !== null ? `한 사람당 약 ${hoursText(target)}` : "예상 시간을 적으면 비교해 드려요"}
        action="예상 시간 적기"
        onAction={onEdit}
      >
        팀원별 부담
      </SecTitle>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <Stat
          icon="users-round"
          label="핵심 업무 맡음"
          value={`${coreCovered}/${memberCount}명`}
        />
        <Stat icon="messages-square" label="정해지는 중" value={`${pending.length}건`} />
        <Stat
          icon="circle-dashed"
          label="담당 공백"
          value={`${gaps.length}건`}
          hint={gaps.length > 0 ? gaps.map((r) => r.name).join(" · ") : undefined}
        />
      </div>

      <Panel s="card" pad={0} r={18}>
        <ul className="m-0 list-none divide-y divide-line/60 p-0">
          {members.map((m) => (
            <MemberRow
              key={m.id}
              load={m}
              scale={scale}
              target={target}
              over={overloaded.includes(m)}
              summary={work[m.id]}
            />
          ))}
        </ul>
      </Panel>

      {members.some((m) => m.roles.length > 0) ? (
        <p className="m-0 mt-2 text-[12px] leading-snug text-txt-muted">{WORK_CAPTION}</p>
      ) : null}

      {overloaded.length > 0 && target !== null ? (
        <Note tone="warn" icon="scale" className="mt-3" title="한 사람에게 몰려 있어요">
          {overloaded.map((m) => `${m.name}(${hoursText(m.hours)})`).join(" · ")}님은 한 사람당{" "}
          {hoursText(target)}의 {OVERLOAD_RATIO}배를 넘어요. 맡은 범위를 나눌 수 있는지 이야기해
          보세요.
        </Note>
      ) : null}
    </section>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: IconName;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-[14px] bg-fill px-3 py-2.5">
      <div className="flex items-center gap-1 text-[11.5px] font-semibold text-txt-muted">
        <Icon name={icon} size={12} />
        <span>{label}</span>
      </div>
      <div className="mt-0.5 text-[16px] font-extrabold leading-tight text-txt-strong">{value}</div>
      {hint ? <div className="mt-0.5 truncate text-[11.5px] text-txt-muted">{hint}</div> : null}
    </div>
  );
}

function MemberRow({
  load,
  scale,
  target,
  over,
  summary,
}: {
  load: MemberLoad;
  scale: number;
  target: number | null;
  over: boolean;
  summary: MemberWorkSummary | undefined;
}) {
  const hasHours = load.hours > 0;
  const pct = Math.min(100, (load.hours / scale) * 100);
  const targetPct = target !== null ? Math.min(100, (target / scale) * 100) : null;

  return (
    <li className="px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="t-card-title min-w-0 truncate text-txt-strong">
          {load.isMe ? `${load.name} 나` : load.name}
        </span>
        <span className="flex flex-none items-center gap-1 text-[13px] font-semibold text-txt-strong">
          {over ? <Icon name="scale" size={13} /> : null}
          {hasHours ? hoursText(load.hours) : load.roles.length > 0 ? "시간 미정" : "—"}
          {over ? <span className="text-[12px]">· 몰림</span> : null}
        </span>
      </div>

      <div className="mt-1 text-[12.5px] leading-snug text-txt-muted">
        {load.roles.length > 0
          ? load.roles.map((r) => `${r.name} (${ROLE_KIND_LABEL[r.kind]})`).join(" · ")
          : "아직 확정된 역할이 없어요"}
        {load.roles.length > 0 && load.coreCount === 0 ? " — 핵심 업무는 아직 없어요" : null}
        {load.unestimated.length > 0 && hasHours
          ? ` — ${load.unestimated.map((r) => r.name).join(", ")}은(는) 시간 미정이라 합계에 없어요`
          : null}
      </div>

      {hasHours ? (
        <div
          className="relative mt-2 h-2 rounded-full bg-line-strong/30"
          role="img"
          aria-label={`${hoursText(load.hours)}${target !== null ? `, 한 사람당 ${hoursText(target)}` : ""}`}
        >
          <div
            className={cn("h-full rounded-full", over ? "bg-warn" : "bg-yellow-400")}
            style={{ width: `${pct}%` }}
          />
          {targetPct !== null ? (
            <span
              aria-hidden
              className="absolute -top-0.5 h-3 w-0.5 rounded-full bg-ink-900"
              style={{ left: `${targetPct}%` }}
            />
          ) : null}
        </div>
      ) : null}

      {/* 수행 기록 — 계획(위의 시간 막대)과 **나란히 두되 합치지 않는다.** 시간과 건수는 단위가 달라
          비율을 만들면 틀리고, 진척률처럼 읽힌다. 순서도 기록 수로 바꾸지 않는다(줄은 명단 순서 그대로). */}
      {summary && (summary.roles.length > 0 || summary.others > 0) ? (
        <ul className="m-0 mt-2 list-none space-y-1 p-0">
          {summary.roles.map((r) => (
            <li key={r.key} className="text-[12.5px] leading-snug text-txt-muted">
              <span className="font-semibold text-txt-strong">{r.name}</span>{" "}
              <span>{workLineOf(r, summary.hasUnlinked)}</span>
            </li>
          ))}
          {othersLineOf(summary.others) ? (
            <li className="text-[12.5px] leading-snug text-txt-muted">{othersLineOf(summary.others)}</li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * 역할별 예상 시간을 적는 시트.
 *
 * 비워 두면 "미정" 으로 남는다 — 저장할 때 **바뀐 칸만** 서버로 보낸다. 범위 밖의 값은
 * 보내기 전에 입력 칸 아래에서 말해 준다(서버도 다시 거른다).
 */
export function EstimateSheet({
  open,
  roles,
  estimates,
  run,
  onClose,
}: {
  open: boolean;
  roles: Role[];
  estimates: Partial<Record<RoleKey, number>>;
  run: ReturnType<typeof useAction>["run"];
  onClose: () => void;
}) {
  const router = useRouter();
  const initial = (): Record<string, string> =>
    Object.fromEntries(roles.map((r) => [r.key, estimates[r.key] !== undefined ? String(estimates[r.key]) : ""]));
  const [draft, setDraft] = useState<Record<string, string>>(initial);
  const [wasOpen, setWasOpen] = useState(open);

  // 열릴 때마다 서버 값으로 되돌린다 — 닫았다 연 뒤 지난번 초안이 남아 있으면 저장된 값과 어긋난다.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(initial());
  }

  const parsed = (key: string): number | null | "bad" => {
    const text = (draft[key] ?? "").trim();
    if (text === "") return null;
    const n = Number(text);
    return isEstimateHours(n) ? n : "bad";
  };

  const changed = roles.filter((r) => {
    const p = parsed(r.key);
    return p !== "bad" && p !== (estimates[r.key] ?? null);
  });
  const hasBad = roles.some((r) => parsed(r.key) === "bad");

  const save = () =>
    run(
      "estimate",
      async () => {
        for (const r of changed) {
          const p = parsed(r.key);
          if (p === "bad") continue;
          await setRoleEstimate(r.key, p);
        }
        router.refresh();
        onClose();
        return "예상 시간을 저장했습니다";
      },
      "저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
    );

  return (
    <Sheet
      open={open}
      title="역할별 예상 시간"
      onClose={onClose}
      footer={
        <Btn full disabled={hasBad || changed.length === 0} onClick={() => void save()}>
          저장
        </Btn>
      }
    >
      <p className="m-0 mb-3 text-[13px] leading-[1.55] text-txt-muted">
        한 역할을 끝내는 데 걸릴 시간을 팀이 함께 가늠해 적어요. 비워 두면 미정으로 남고, 부담 합계에
        넣지 않아요. 추첨에는 영향이 없어요.
      </p>
      {roles.map((r) => {
        const bad = parsed(r.key) === "bad";
        return (
          <Field
            key={r.key}
            label={`${r.name} · ${ROLE_KIND_LABEL[r.kind]}`}
            hint={r.note}
            error={bad ? `${MIN_ESTIMATE_HOURS}~${MAX_ESTIMATE_HOURS} 사이의 정수로 적어 주세요` : null}
          >
            {(props) => (
              <Input
                {...props}
                value={draft[r.key] ?? ""}
                onChange={(v) => setDraft((d) => ({ ...d, [r.key]: v }))}
                placeholder="시간 (예: 6)"
                inputMode="numeric"
                maxLength={2}
                error={bad}
              />
            )}
          </Field>
        );
      })}
    </Sheet>
  );
}
