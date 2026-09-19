"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AppBar,
  Body,
  Btn,
  Icon,
  Note,
  Panel,
  Toast,
  Undecided,
  type IconName,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import type { IceGame } from "@/lib/types";

/**
 * 28 아이스브레이킹.
 *
 * 셋 중 **사과게임만 실제로 연결된다** — 공유 링크형이라 앱 안에 게임 화면을 만들지 않아도 된다.
 * 나머지 둘은 "준비 중"이라고 말하고 설명만 보여 준다. 열리지 않는 버튼을 열린 것처럼
 * 두는 것보다 낫다.
 */
export function IceBreakScreen({ games }: { games: IceGame[] }) {
  const router = useRouter();

  const [picked, setPicked] = useState<string | null>(null);
  const [linkMade, setLinkMade] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const game = games.find((g) => g.key === picked) ?? null;
  const shareUrl = "chaldduck.app/apple/x92k";

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3000);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      flash("링크를 복사했습니다");
    } catch {
      flash("복사하지 못했습니다. 화면의 링크를 직접 옮겨 적어 주세요.");
    }
  };

  return (
    <>
      <AppBar
        title="아이스브레이킹"
        sub="팀 분위기를 풀어보는 시간"
        onBack={() => router.push("/team")}
      />

      <Body dense>
        <div role="radiogroup" aria-label="게임 고르기" className="mb-4 flex flex-col gap-2">
          {games.map((item) => {
            const on = picked === item.key;
            return (
              <button
                key={item.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setPicked(item.key);
                  setLinkMade(false);
                }}
                className={cn(
                  "box-border flex w-full cursor-pointer items-center gap-3 rounded-2xl px-[15px] py-[13px] text-left",
                  on ? "border-[1.5px] border-yellow-500 bg-yellow-100" : "border-[1.5px] border-line bg-card",
                )}
              >
                <span className="grid size-[38px] flex-none place-items-center rounded-xl bg-fill text-txt-muted">
                  <Icon name={item.icon as IconName} size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-[14.5px] leading-[1.4] text-txt-strong">
                    {item.name}
                  </span>
                  <span className="keep-all mt-0.5 block text-[13px] leading-[1.5] text-txt-muted">
                    {item.desc}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {game?.playable ? (
          linkMade ? (
            <Panel s="yellow" pad={18} r={18} className="text-center">
              <div className="t-cap-strong mb-2 text-yellow-700">공유 링크</div>
              <div className="font-mono font-bold text-[15px] leading-[1.4] text-ink-900">
                {shareUrl}
              </div>
              <Btn size="sm" className="mt-3" icon="copy" onClick={copyLink}>
                링크 복사하기
              </Btn>
            </Panel>
          ) : (
            <Btn full size="lg" icon="link" onClick={() => setLinkMade(true)}>
              {game.name} 링크 만들기
            </Btn>
          )
        ) : game ? (
          <>
            <Note tone="warn" icon="hammer" className="mb-2.5">
              {game.name}은 <b>실행 화면이 준비 중</b>입니다. 지금은 설명만 볼 수 있습니다.
            </Note>
            <Btn full v="outline" icon="info" onClick={() => flash(game.desc)}>
              게임 설명 보기
            </Btn>
          </>
        ) : null}

        <Undecided>
          세 게임 모두를 이번 범위에서 만들지, 어떤 순서로 우선할지가 기획안에 없어 사과게임만 먼저
          연결했습니다.
        </Undecided>
      </Body>

      <Toast msg={toast} />
    </>
  );
}
