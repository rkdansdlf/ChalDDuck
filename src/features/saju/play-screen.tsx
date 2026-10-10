"use client";

import { useRouter } from "next/navigation";
import { AppBar, Body, Btn, Note, Panel, SecTitle } from "@/components/ui";
import type { BalanceResult, TeamSaju } from "@/data/api";
import { PLAY_NOTICE, TEAM_NEED_MINE } from "@/lib/saju/copy";
import { BalancePanel } from "./balance-panel";
import { GuessPanel } from "./guess-panel";
import { PairingPanel } from "./pairing-panel";

/**
 * 사주 놀이 — 아이스브레이킹(라이어·마피아)과는 **따로** 둔다.
 *
 * 그쪽은 여럿이 한 판을 함께 돌리는 상태 머신(라운드·좌석·투표)이라 여기 끼우면 서로의 불변식을 건드린다.
 * 이 화면의 놀이는 혼자 해도 되는 가벼운 것이고, 밸런스 게임만 팀의 표를 모은다.
 *
 * 오늘의 궁합과 사주 맞히기는 **팀 사주 화면이 이미 보여 주는 값**(일간·오행 수·이름)만 쓴다 — 놀이라고 해서
 * 더 많은 것을 알게 하지 않는다. 그래서 같은 규칙이 걸린다: 내가 등록해야 남의 값으로 놀 수 있다.
 * 밸런스 게임은 생년월일과 무관해서 등록하지 않아도 할 수 있다.
 */
export function SajuPlayScreen({
  saju,
  balance,
  today,
}: {
  saju: TeamSaju;
  balance: BalanceResult[];
  today: string;
}) {
  const router = useRouter();
  const me = saju.members.find((m) => m.isMe) ?? null;

  const needMine = (
    <Panel s="cream" pad={16} className="mb-4">
      <p className="text-pretty-keep m-0 mb-3 text-[14.5px] leading-[1.6] text-txt">{TEAM_NEED_MINE}</p>
      <Btn full v="outline" onClick={() => router.push("/team/access")}>
        내 사주 등록하기
      </Btn>
    </Panel>
  );

  return (
    <>
      <AppBar title="사주 놀이" sub="재미로 즐기는 팀 놀이" onBack={() => router.push("/team/saju")} />

      <Body dense>
        <Note tone="y" icon="sparkles" className="mb-4">
          {PLAY_NOTICE}
        </Note>

        <SecTitle note="오늘 두 사람이 같이 일하기 좋은 흐름이에요">오늘의 궁합</SecTitle>
        {me ? <PairingPanel members={saju.members} me={me} today={today} /> : needMine}

        <SecTitle note="오행 수만 보고 누구의 사주인지 맞혀 보세요">사주 맞히기</SecTitle>
        {me ? <GuessPanel members={saju.members} me={me} today={today} /> : needMine}

        <SecTitle note="고르면 우리 팀의 선택을 볼 수 있어요">사주 밸런스 게임</SecTitle>
        <BalancePanel results={balance} />
      </Body>
    </>
  );
}
