/**
 * 푸시 알림의 **판단 규칙**. 브라우저와 서버 어느 쪽에도 의존하지 않는 부분만 둔다.
 *
 * 화면은 이 함수가 "지금 왜 켤 수 없는지"를 말해 주는 것으로 문구를 고르고, 발신은
 * `server/notify/push.ts` 가 실을 확인한다. 규칙이 두 곳에 흩어지면 화면은 "켜짐"이라고
 * 말하는데 아무것도 오지 않는 상태가 된다.
 */

/** 이 기기가 지금 어디까지 왔는지. 화면이 모으고 서버가 한 가지를 채운다. */
export type PushState = {
  /** 브라우저가 푸시 API를 갖는가. */
  supported: boolean;
  /** 사용자가 브라우저에서 이미 결정했는가. */
  permission: "default" | "granted" | "denied";
  /** 설치된 앱으로 실행 중인가(아이폰에서 결정적). */
  standalone: boolean;
  /** 아이폰·아이패드인가. 이 기기들은 설치 전에는 푸시를 보낼 수 없다. */
  ios: boolean;
  /** 서버에 발신 키가 있는가. 없으면 아무리 켜도 아무것도 오지 않는다. */
  configured: boolean;
  /** 이 기기가 이미 구독돼 있는가. */
  subscribed: boolean;
};

/**
 * 지금 켤 수 없다면 **무엇 때문인지**를 말한다.
 *
 * 이유를 말하지 않으면 버튼만 사라진다 — 사용자는 "알림이 안 오는데 왜지?"를 알 수 없다.
 * 켤 수 있으면 null.
 */
export function pushBlock(state: PushState): { code: string; text: string } | null {
  if (!state.supported) {
    return {
      code: "unsupported",
      text: "이 브라우저는 밖으로 알림을 보낼 수 없습니다. 앱을 열면 알림함에서 볼 수 있습니다.",
    };
  }
  // 아이폰은 "설치된 앱"이 아니면 Notification API 자체가 조용히 실패한다(권한을 물어도
  // granted 가 되지 않는다). 사용자가 고칠 수 있는 유일한 지점이 설치라서 그것을 먼저 말한다.
  if (state.ios && !state.standalone) {
    return {
      code: "needs-install",
      text: "아이폰·아이패드에서는 이 앱을 홈 화면에 설치해야 밖에서도 알림이 옵니다. 브라우저 메뉴에서 '홈 화면에 추가'를 하세요.",
    };
  }
  if (!state.configured) {
    return {
      code: "not-configured",
      text: "아직 서버에 푸시 키가 없습니다. 키가 채워지면 여기서 켤 수 있습니다 — 지금은 앱을 열면 항상 보이는 알림함이 그대로입니다.",
    };
  }
  if (state.permission === "denied") {
    return {
      code: "denied",
      text: "브라우저가 이 사이트의 알림을 막아 두었습니다. 브라우저 설정에서 허용하면 밖에서도 받을 수 있습니다.",
    };
  }
  return null;
}

/** 이 기기가 지금 밖에 알림을 받는 중인가 — 화면의 상태 표시가 이것을 보고 정한다. */
export function pushOn(state: PushState): boolean {
  return state.supported && state.configured && state.permission === "granted" && state.subscribed;
}

/** 브라우저가 준 구독을 검증해 저장할 모양으로 바꾼다. 어긋난 값은 null. */
export function pushSubscriptionFrom(json: unknown): {
  endpoint: string;
  p256dh: string;
  auth: string;
} | null {
  if (typeof json !== "object" || json === null) return null;
  const row = json as Record<string, unknown>;
  const keys = row.keys as Record<string, unknown> | undefined;

  // endpoint 는 상대주소도 아니고 그냥 빈 줄이어서도 안 된다 — 발신할 때 그대로 쓰이는 주소다.
  const endpoint = typeof row.endpoint === "string" ? row.endpoint.trim() : "";
  const p256dh = typeof keys?.p256dh === "string" ? keys.p256dh.trim() : "";
  const auth = typeof keys?.auth === "string" ? keys.auth.trim() : "";
  if (!endpoint || !p256dh || !auth) return null;

  return { endpoint, p256dh, auth };
}

/**
 * 발신이 실패했을 때 그 구독을 **지울까**.
 *
 * - `gone` — 404·410. 그 주소로 더는 보낼 수 없다(단말이 사라짐, 앱 삭제, 구독 만료). 지우지
 *   않으면 죽은 주소가 쌓여 알림 한 통마다 헛된 시도가 따라붙는다.
 * - `failed` — 그 밖의 실패는 **지우지 않는다.** 401·403 은 우리 쪽 서명이 잘못됐다는 뜻이라
 *   지워 버리면 정상인 기기들의 구독을 우리가 한 번의 설정 실수로 전부 지우는 셈이 된다.
 *   발신기 버림(본문이 큼)도 마찬가지다 — 다음 알림은 잘 갈 수 있다.
 */
export function pushFailure(statusCode: number | undefined): "gone" | "failed" {
  return statusCode === 404 || statusCode === 410 ? "gone" : "failed";
}

/** 서비스워커에 넘길 알림 한 통. */
export type PushPayload = { title: string; body: string; href: string | null };

/**
 * 발신할 본문.
 *
 * **`href` 는 앱 안 주소만 지난다.** 알림을 눌렀을 때 어디로 보내는지는 발신 서버가 정하는
 * 필드라, 그대로 쓰면 알림 한 통이 곧 열린 창(url)이고 그 창이 어디든 갈 수 있다.
 * 앞의 `//`(스킴 상대 주소)와 `http` 절대 주소는 앱 밖으로 나가므로 버린다.
 */
export function pushPayload(input: {
  title: string;
  body: string;
  href?: string | null;
}): PushPayload {
  const href = input.href ?? null;
  const inside = href !== null && href.startsWith("/") && !href.startsWith("//");
  return {
    title: input.title,
    body: input.body,
    href: inside ? href : null,
  };
}
