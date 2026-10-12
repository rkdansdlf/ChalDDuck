"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Btn, Field, Input, Sheet } from "@/components/ui";
import type { MySaju } from "@/data/api";
import { SAJU_PRIVACY } from "@/lib/saju/copy";
import { BIRTH_BLOCK_MESSAGE } from "@/lib/saju/input";
import { clearMyBirth, saveMyBirth } from "@/server/actions/saju";

/**
 * 사주 등록/변경 바텀시트.
 *
 * 팀 사주, 사주 놀이, 회의 케미, 계정 관리 등 사주 등록이 필요한
 * 모든 화면에서 공통으로 띄워 바로 입력할 수 있도록 독립 컴포넌트로 제공한다.
 */
export function BirthSheet({
  saju,
  initialBirthDate,
  initialBirthTime,
  onClose,
  onSuccess,
}: {
  saju?: MySaju | null;
  initialBirthDate?: string | null;
  initialBirthTime?: string | null;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [date, setDate] = useState(saju?.birthDate ?? initialBirthDate ?? "");
  const [time, setTime] = useState(saju?.birthTime ?? initialBirthTime ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await saveMyBirth(date, time === "" ? null : time);
      if (result === "ok") {
        onSuccess?.();
        router.refresh();
        onClose();
      } else if (result === "invalid") {
        setError("로그인이 풀렸어요. 다시 들어온 뒤 시도해 주세요.");
      } else {
        setError(BIRTH_BLOCK_MESSAGE[result]);
      }
    } catch {
      setError("저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setSaving(true);
    setError(null);
    try {
      await clearMyBirth();
      onSuccess?.();
      router.refresh();
      onClose();
    } catch {
      setError("지우지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open
      title={saju ? "내 사주 변경" : "내 사주 등록"}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Btn full v="outline" disabled={saving} onClick={onClose}>
            취소
          </Btn>
          <Btn full disabled={saving || date === ""} onClick={save}>
            {saving ? "저장 중…" : "저장"}
          </Btn>
        </div>
      }
    >
      <p className="text-pretty-keep m-0 mb-3.5 t-card text-txt">{SAJU_PRIVACY}</p>

      <Field label="생년월일" required error={error}>
        {(props) => <Input {...props} type="date" value={date} onChange={setDate} error={Boolean(error)} />}
      </Field>
      <Field label="태어난 시각" hint="모르면 비워 두세요. 시주만 빼고 계산해요.">
        {(props) => <Input {...props} type="time" value={time} onChange={setTime} />}
      </Field>

      {saju ? (
        <button
          type="button"
          disabled={saving}
          onClick={clear}
          className="t-cap-strong mb-1 cursor-pointer border-none bg-transparent p-0 text-txt-muted underline underline-offset-2"
        >
          등록한 생년월일 지우기
        </button>
      ) : null}
    </Sheet>
  );
}
