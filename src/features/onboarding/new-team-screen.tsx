"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppBar, AppFrame, Body, Btn, Field, Input, Note, Panel, TopInset, Toast, Undecided } from "@/components/ui";
import { createTeam } from "@/server/actions/onboarding";
import type { Team } from "@/lib/types";
import { setTeamCode } from "./onboarding-state";

/** 00 팀 만들기 — 팀 이름·과목만 적으면 초대 코드가 발급된다. */
export function NewTeamScreen() {
  const router = useRouter();

  const [teamName, setTeamName] = useState("");
  const [course, setCourse] = useState("");
  const [created, setCreated] = useState<Team | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const canSubmit = teamName.trim().length > 0 && !submitting;

  const handleCreate = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const team = await createTeam({ name: teamName, course });
      setCreated(team);
      setTeamCode(team.code);
    } finally {
      setSubmitting(false);
    }
  };

  const inviteUrl = created
    ? `${typeof window === "undefined" ? "" : window.location.origin}/join?code=${created.code}`
    : "";

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  };

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
      <TopInset />
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

            <Undecided>
              최초 생성자가 팀장 권한을 갖는지, 팀 정보를 나중에 고칠 수 있는지가 기획안에 없어 다루지 않았습니다.
            </Undecided>
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
