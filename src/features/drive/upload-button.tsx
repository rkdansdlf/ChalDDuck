"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Btn, Note, Toast } from "@/components/ui";
import { uploadSubmission } from "@/server/actions/drive";

/**
 * 파일 올리기.
 *
 * 보이는 것은 버튼 하나지만 실제로는 숨은 `<input type="file">` 을 연다 — 기본 파일
 * 입력은 브라우저마다 생김새가 달라 앱의 버튼 규격에 맞지 않는다.
 *
 * **같은 이름으로 올리면 새 파일이 아니라 그 파일의 새 버전이 된다.** 서버가 그렇게
 * 정하고, 결과 문구로 어느 쪽이었는지 알려 준다 — 덮어쓴 것처럼 보이면 안 되기 때문이다.
 */
export function UploadButton({
  boxId,
  label,
}: {
  boxId: string;
  label: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [working, setWorking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3000);
  };

  const send = async (file: File) => {
    setWorking(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const result = await uploadSubmission(boxId, form);

      if (result.status === "ok") {
        router.refresh();
        flash(
          result.isNewFile
            ? `${result.fileName} 을 올렸습니다`
            : `${result.fileName} 의 새 버전 ${result.label} 으로 쌓였습니다`,
        );
        return;
      }

      setError(
        result.status === "too-big"
          ? "50MB 가 넘는 파일은 올릴 수 없습니다."
          : result.status === "bad-type"
            ? "문서·이미지·PPT·PDF 만 올릴 수 있습니다."
            : result.status === "not-configured"
              ? "파일 저장소가 아직 연결되지 않았습니다(SUPABASE_SECRET_KEY)."
              : "빈 파일은 올릴 수 없습니다.",
      );
    } finally {
      setWorking(false);
      // 같은 파일을 다시 고를 수 있게 비운다 — 안 비우면 두 번째 선택이 무시된다.
      if (input.current) input.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        hidden
        accept=".pptx,.ppt,.docx,.doc,.pdf,image/png,image/jpeg,image/gif,image/webp"
        onChange={(event) => {
          const picked = event.target.files?.[0];
          if (picked) void send(picked);
        }}
      />

      <Btn
        v="outline"
        size="sm"
        icon="paperclip"
        disabled={working}
        onClick={() => input.current?.click()}
      >
        {working ? "올리는 중" : label}
      </Btn>

      {error ? (
        <Note tone="warn" icon="circle-alert" title="올리지 못했습니다" className="mt-3">
          {error}
        </Note>
      ) : null}

      <Toast msg={toast} />
    </>
  );
}
