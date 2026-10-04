"use server";

import { revalidatePath } from "next/cache";

import { dmThreadKey } from "@/data/api";
import { db } from "@/server/db";
import { requireSessionMember } from "@/server/session";

/**
 * 1:1 DM 을 **내 목록에서 빼고 다시 넣는다** — 2026-10-03 결정.
 *
 * ## 왜 이게 "나가기" 지만 삭제가 아닌가
 *
 * 대화에는 두 사람이 있다. 나 혼자 나간다고 **상대의 말까지 지워질 수는 없다** — 그건 내가
 * 남의 말을 없애는 일이다. 그래서 여기서는 `DmThreadHide` 에 한 줄만 적고 `Message` 는
 * **건드리지 않는다.** 상대 화면에도 아무 변화가 없다.
 *
 * 이건 "나가기"의 정직한 한계다. 지우는 기능이 아니다 — 나중에 다시 열면 지난 말이 그대로
 * 있다. 화면에도 그렇게 말해야 한다.
 *
 * ## 다시 넣는 길은 **명시적인 한 번의 클릭**이다
 *
 * 숨긴 대화는 목록에서 사라진다. 아무도 모르게 되살아나면 안 되므로 **자동으로 풀지 않는다.**
 * 팀원 목록에서 그 사람으로 DM 을 여는 길이 그 역할이고, 열기 전에 이 액션을 먼저 부른다.
 *
 * 열기(읽기)는 **렌더 중이므로 여기를 부르지 않는다.** 렌더가 쓰면 화면을 한 번 그릴 때마다
 * 상태가 바뀌고, 그건 GET 이 되어야 할 자리에 쓰기가 들어간 것이다.
 *
 * ## 팀을 먼저 본다
 *
 * 상대 id 를 그대로 쓰면 **남의 팀 사람**으로 방을 만들 수 있다. 숨길 자리를 만들고, 목록에서
 * 뭔가를 지울 수 있다. 그래서 같은 팀인지 여기서 확인하고 아니면 `gone` 이다.
 */
async function myThreadKey(threadId: string): Promise<{ threadKey: string; memberId: string } | null> {
  const me = await requireSessionMember();
  const other = await db.member.findFirst({
    where: { id: threadId, teamId: me.teamId },
    select: { id: true },
  });
  if (!other) return null;
  // **방의 키는 서버가 만든다.** 클라이언트가 만들면 두 사람의 순서나 구분자를 다르게 만들어
  // 같은 방이 두 개가 되고, 숨긴 자리와 실제 대화가 어긋난다.
  return { threadKey: dmThreadKey(me.id, other.id), memberId: me.id };
}

/**
 * 이 DM 을 **내 목록에서 뺀다.** 말은 남고 목록에서만 사라진다.
 */
export async function hideDmThread(threadId: string): Promise<"hidden" | "gone"> {
  const found = await myThreadKey(threadId);
  if (!found) return "gone";

  // **`upsert` 면 이 줄이 곧 "한 번만" 이고**, 같은 것을 두 번 넣어도 두 줄이 되지 않는다.
  // 두 번 넣는 법을 만들어야 하는 설계(일자 키 + 유일 제약)는, 그 법을 지키지 않은 채가
  // 조용히 두 줄을 만든다.
  await db.dmThreadHide.upsert({
    where: { memberId_threadKey: { memberId: found.memberId, threadKey: found.threadKey } },
    create: { memberId: found.memberId, threadKey: found.threadKey },
    update: {},
  });

  revalidatePath("/chat/dm", "layout");
  revalidatePath("/chat", "layout");
  revalidatePath("/home");
  return "hidden";
}

/**
 * 이 DM 을 **내 목록에 다시 넣는다.** 말은 원래 그대로 있고 **숨김만 풀린다.**
 */
export async function unhideDmThread(threadId: string): Promise<"shown" | "gone"> {
  const found = await myThreadKey(threadId);
  if (!found) return "gone";

  // **`deleteMany` 다 — 없는 것을 지워도 조용히 통과해야** "이미 보이는 방" 이 예외가 되면
  // 나갔다 오는 길이 흔들린다.
  await db.dmThreadHide.deleteMany({
    where: { memberId: found.memberId, threadKey: found.threadKey },
  });

  revalidatePath("/chat/dm", "layout");
  revalidatePath("/chat", "layout");
  revalidatePath("/home");
  return "shown";
}