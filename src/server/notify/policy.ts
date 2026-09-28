/**
 * **무엇을 앱 밖으로 보낼지** — 한 곳에 모아 둔 정책.
 *
 * 이 파일이 없는 동안 이 결정은 호출부에 흩어 있었다. `notify()` 의 `push` 인자가 그 자리였는데
 * 쓰는 곳이 한 군데(`actions/onboarding.ts` 의 팀 푸시 예산)뿐이라, **"푸시를 보낼지"와
 * "지금 보낼 자리가 남았는지"가 같은 자리에 섞여 있었다.** 앞의 것은 제품 결정이고 뒤는 비용
 * 결정이다. 섞인 채로 자리가 늘면 어느 쪽 규칙이 밀렸는지 알 수 없다.
 *
 * 그래서 둘을 갈라 **기본값은 여기서 정한다.** 호출부는 정말 특수한 경우에만 `push` 로 덮어쓴다.
 *
 * ## 왜 앱 밖(푸시)이 기준이 아니라 **첫 번째 예외**인가
 *
 * 앱 안 알림함이 **먼저**다. 놓치는 일의 대부분은 "나한테 온 줄 몰랐다"라서, 앱을 열면 반드시
 * 보이는 자리를 채우는 것으로 이미 충분하다(`notify/create.ts` 머리말). 푸시는 그 위에 얹는
 * **두 번째** 수단이고, 그래서 가치가 떨어질 때가 많다 — 흔치 않은 결정은 부르고, 이미 끝난
 * 결정은 앱을 열면 된다.
 *
 * ## 판정 순서
 *
 * 1. **그 사람이 무엇을 해야 하는가** — 응답이 없으면 일이 밀린다. 앱 밖에서도 불러야 한다.
 * 2. **이미 끝났는가** — 확정된 일은 지금 알았어도 아무것도 달라지지 않는다.
 * 3. **빈도가 무관한가** — 자주 일어나는 일은 보낼수록 "알림을 끄고 싶다"를 만든다.
 *
 * @see `server/notify/create.ts` — 이 판정을 기본값으로 쓰고, 덮어쓸 수 있게 하는 곳
 */

/**
 * 알림의 종류. DB 의 `Notification.kind` 에 그대로 들어가는 값이라 **문자열이 곧 계약이다.**
 * 여기서 정한 값을 `notify/create.ts` 가 그대로 쓴다.
 */
export type NotifyKind =
  | "poke"
  | "meeting"
  | "schedule-ask"
  | "contrib-dispute"
  | "contrib-confirm"
  /** 팀장이 회의 참여로 표시했거나 그 표시를 취소했다. */
  | "contrib-participation"
  | "join-request"
  | "rejoin-request"
  | "icebreak"
  /** 누가 하지(29)에서 팀의 정한 하나가 바뀌었다. 아이스브레이킹과 알림함이 섞이지 않게 따로 둔다. */
  | "who-does-it"
  /** 팀원이 드라이브에 올리거나 복원했다. */
  | "drive";

/** 같은 종류 안에서 갈리는 경우. 종류 이름만으로는 판단할 수 없을 때 쓴다. */
export type NotifyContext = {
  /**
   * 이미 **끝난** 일인가.
   *
   * 회의가 이걸 가장 크게 쓴다 — "회의를 잡아 주세요"는 응답이 필요한 제안이고, "회의가
   * 잡혔습니다"는 예약 작업이 마감 뒤에 내리는 확정이다. 둘 다 `meeting` 이지만 **가치를
   * 반대로** 가진다. 같은 이름으로 두면 어느 하나를 포기해야 하므로 여기서 갈라 놓았다.
   */
  settled?: boolean;
};

/** 앱 안 알림함에만 남기고 앱 밖으로는 보내지 않는다. */
export type PushPolicy = "in-app-only" | "push";

/**
 * 이 알림을 앱 밖으로 보낼지.
 *
 * 두 값뿐이다. "조금만 보내기" 같은 중간값은 두지 않는다 — 일부만 보내는 정책은 실제로
 * 구현되지 않는다. 발신이 실패해도 앱 안 알림은 남으므로(`notify/create.ts`), 여기서 참이든
 * 거짓이든 **앱 안 알림함은 항상 채워진다.**
 */
export function pushPolicy(kind: NotifyKind, context: NotifyContext = {}): PushPolicy {
  // 2. 이미 끝난 일. 무엇이든 — 확정된 결정은 지금 알았어도 아무것도 달라지지 않는다.
  if (context.settled) return "in-app-only";

  switch (kind) {
    // 1. 응답이 없으면 일이 밀린다. 팀장에게 가는 요청이 여기 전부다.
    case "join-request":
    case "rejoin-request":
    case "contrib-dispute":
    case "contrib-confirm":
    case "poke":
      return "push";

    // 회의 제안은 응답이 필요한 **제안**일 때만 부른다(위 `settled` 가 확정 쪽을 먼저 걷어 낸다).
    case "meeting":
    case "schedule-ask":
      return "push";

    // 3. 빈도가 무관하다. 드라이브 업로드는 하루에도 여러 번 온다.
    case "drive":
    case "contrib-participation":
    case "icebreak":
    case "who-does-it":
      return "in-app-only";
  }
}
