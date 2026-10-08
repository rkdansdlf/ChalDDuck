"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppBar, AppFrame, Body, Btn, Field, Input, Note, Panel, Toast } from "@/components/ui";
import { createTeam } from "@/server/actions/onboarding";
import type { Team } from "@/lib/types";
import { useAction } from "@/lib/use-action";
import { setTeamCode } from "./onboarding-state";

/** 00 팀 만들기 — 팀 이름·과목만 적으면 초대 코드가 발급된다. */
export function NewTeamScreen({ inviteOrigin }: { inviteOrigin?: string }) {
  const router = useRouter();

  const [teamName, setTeamName] = useState("");
  const [course, setCourse] = useState("");
  const [created, setCreated] = useState<Team | null>(null);
  const { toast, busy, flash, run } = useAction();
  const submitting = busy.create === true;

  const canSubmit = teamName.trim().length > 0 && !submitting;

  /**
   * 팀을 만든다.
   *
   * `catch` 가 없으면 실패가 조용하다. 운영 빌드는 서버가 던진 오류의 문구를 지우므로,
   * 특히 **"이미 팀에 속해 있습니다"** 가 화면에 남지 않으면 사용자는 버튼이 고장 난 것으로
   * 알고 몇 번을 더 누른다. `useAction` 이 실패 문구를 대신 띄워 준다.
   */
  const handleCreate = async () => {
    if (!canSubmit) return;
    await run(
      "create",
      async () => {
        const team = await createTeam({ name: teamName, course });
        setCreated(team);
        setTeamCode(team.code);
      },
      "팀을 만들지 못했습니다. 이미 팀에 속해 있다면 팀에서 먼저 나가 주세요.",
    );
  };

  /**
   * 나눌 링크.
   *
   * **초대 링크(`?t=`)를 먼저 건다.** 초대 한 장은 따로 되돌릴 수 있지만 `?code=` 는 팀 전체가
   * 공유하는 값이라 되돌리면 정상적으로 나간 모든 공유까지 죽는다. 코드는 "직접 옮겨 적는
   * 길"로 남기고, 링크는 되돌릴 수 있는 쪽으로 보낸다.
   */
  const origin =
    inviteOrigin && inviteOrigin.length > 0
      ? inviteOrigin.replace(/\/$/, "")
      : typeof window === "undefined"
        ? ""
        : window.location.origin;
  const inviteUrl = created
    ? created.inviteToken
      ? `${origin}/join?t=${created.inviteToken}`
      : `${origin}/join?code=${created.code}`
    : "";

  const copyCode = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.code);
      flash("초대 코드를 복사했습니다");
    } catch {
      // 클립보드 권한이 없거나 http 환경이면 실패한다 — 코드는 화면에 그대로 보이므로 안내만 한다
      flash("복사하지 못했습니다. 화면의 코드를 직접 옮겨 적어 주세요.");
    }
  };

  const shareLink = async () => {
    if (!created) return;
    const payload = { title: "찰떡 팀 초대", text: `${created.name} 팀에 초대합니다`, url: inviteUrl };
    if (navigator.share) {
      try {
        await navigator.share(payload);
        return;
      } catch {
        // 사용자가 공유 시트를 닫은 경우 — 복사로 넘어간다
      }
    }
    try {
      await navigator.clipboard.writeText(inviteUrl);
      flash("초대 링크를 복사했습니다");
    } catch {
      flash("공유하지 못했습니다. 초대 코드를 대신 알려 주세요.");
    }
  };

  return (
    <AppFrame label="00 팀 만들기">
      <AppBar title="새 팀 만들기" onBack={() => router.push("/join")} />
      <Body>
        {!created ? (
          <>
            <p className="text-pretty-keep mt-2 mb-[18px] text-[15px] leading-[1.62] text-txt">
              팀 이름과 과목만 적으면 초대 코드가 만들어집니다. 팀원에게 코드나 링크를 공유하면 됩니다.
            </p>

            <Field label="팀 이름" required>
              {(props) => (
                <Input
                  {...props}
                  value={teamName}
                  onChange={setTeamName}
                  placeholder="예: 디지털콘텐츠기획 3조"
                />
              )}
            </Field>

            <Field label="과목">
              {(props) => (
                <Input {...props} value={course} onChange={setCourse} placeholder="예: 디지털콘텐츠기획" />
              )}
            </Field>

            <Btn full size="lg" disabled={!canSubmit} onClick={handleCreate}>
              {submitting ? "만드는 중…" : "팀 만들기"}
            </Btn>

            {/* 규칙 확정: 최초 생성자가 창작자 쿠키(cd_creator)를 통해 첫 팀장이 되며,
                이후 팀 설정(16)에서 팀장 위임(transferLeadership)이 가능하다. (scripts/harness/join.mts로 검증) */}
          </>
        ) : (
          <>
            <Panel s="yellow" pad={20} className="mb-[18px] text-center">
              <div className="t-cap-strong mb-2.5 text-yellow-700" style={{ letterSpacing: ".04em" }}>
                초대 코드
              </div>
              <div className="font-mono font-extrabold text-[28px] leading-[1.2] tracking-[.03em] text-ink-900">
                {created.code}
              </div>
              <div className="keep-all mt-2 font-medium text-[13.5px] leading-[1.5] text-yellow-700">
                {created.name}
                {created.course ? ` · ${created.course}` : ""}
              </div>
            </Panel>

            <div className="mb-4 flex flex-col gap-2">
              <Btn full icon="copy" onClick={copyCode}>
                코드 복사하기
              </Btn>
              <Btn full v="outline" icon="share-2" onClick={shareLink}>
                초대 링크 공유하기
              </Btn>
            </div>

            <Note tone="info" icon="lock">
              코드를 아는 사람만 입장할 수 있습니다. 팀원은 이 코드로 <b>초대 링크 입장</b> 화면에 들어옵니다.
            </Note>

            <Btn
              full
              size="lg"
              className="mt-4"
              iconRight="arrow-right"
              onClick={() => router.push("/onboarding/name")}
            >
              이어서 내 정보 입력하기
            </Btn>
          </>
        )}
      </Body>
      <Toast msg={toast} />
    </AppFrame>
  );
}
