import { pushSubscriptionFrom, type PushState } from "./push-model";
import { savePushSubscription, clearPushSubscription } from "@/server/actions/push";

/**
 * 브라우저 쪽 푸시 작업. 화면에는 **결과 코드만** 돌려준다 — 문구는 화면이 정한다.
 *
 * 순서를 함부로 바꾸지 않는다. 권한을 먼저 물어야(`requestPermission`) 이 기기의 구독 주소를
 * 얻을 수 있다(`subscribe`). 권한을 얻고 구독하기 전에 서버에 저장하면, 저장했어도 발신할
 * 주소가 없는 구독이 남아 "켜짐"이라고 말하는 껍데기가 된다.
 */

/** VAPID 공개키(base64url) → 브라우저가 요구하는 바이트 배열. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(
    /_/g,
    "/",
  );
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function isIosDevice(): boolean {
  const ua = navigator.userAgent;
  // 아이패드OS 13+ 는 Mac 으로 보고한다 — 손을 대는 기기인지로 구분한다.
  const iPadOnMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  return /iP(hone|ad|od)/.test(ua) || iPadOnMac;
}

function isStandalone(): boolean {
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * 서버가 아는 값 위에 이 브라우저가 아는 값을 얹는다.
 *
 * ## `subscribed` 는 **이 브라우저의 값만** 본다
 *
 * 예전에는 `server.subscribed || localBrowserSubscription` 이었다. 그래서 **어느 기기에서든
 * 하나만 켜져 있으면 모든 기기가 "켜짐"이라고 보였다** — 휴대폰에만 켜진 상태에서 PC 로
 * 설정 화면을 열면 PC 도 켜진 것처럼 보였다. 끄러 들어가면 PC 의 주소가 없는데도 지워질 것만
 * 같았다.
 *
 * 서버 값은 "내 계정 어딘가에 켜진 기기가 있는가"라는 **다른 질문**이다. 이 기기가 켜졌는지는
 * **`pushManager.getSubscription()` 이 정확히 안다** — 그 주소는 브라우저 안에만 있다. 그래서
 * 질문 자체를 바꿔 이쪽만 쓴다.
 *
 * 모르면 `false` 다. **확인 못 하고 켜졌다고 말하는 것보다 나쁘다** — 실제로 알림이 오지 않으니까.
 * 대신 화면은 "다른 기기에서 받고 있어요" 안내로 그 상황을 설명한다(`countSubscriptions`).
 */
export async function readPushState(server: {
  configured: boolean;
  subscribed: boolean;
}): Promise<PushState> {
  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
  if (!supported) {
    return {
      supported: false,
      permission: "default",
      standalone: false,
      ios: false,
      configured: server.configured,
      subscribed: false,
    };
  }

  let local = false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    local = Boolean(await reg?.pushManager.getSubscription());
  } catch {
    // 못 물어보면 **모르는 것**이라고 한다. 서버 값으로 메우지 않는다.
  }

  return {
    supported: true,
    permission: Notification.permission as PushState["permission"],
    standalone: isStandalone(),
    ios: isIosDevice(),
    configured: server.configured,
    subscribed: local,
  };
}

export type PushTurnOn =
  | "on"
  | "denied"
  | "unsupported"
  | "not-configured"
  | "needs-install"
  | "invalid"
  | "failed";

/**
 * 이 브라우저를 구독시키고 서버에 저장한다.
 *
 * **성공했다고 말하기 전에 세 가지를 모두 확인한다** — 권한, 구독 주소, 저장 결과. 이 중
 * 하나라도 어긋나면 사용자에게 "켜짐"이라고 말해서는 안 된다(알림이 오지 않으니까).
 */
export async function turnOnPush(): Promise<PushTurnOn> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return "unsupported";
  }
  if (isIosDevice() && !isStandalone()) return "needs-install";

  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) return "not-configured";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      }));

    const saved = await savePushSubscription(pushSubscriptionFrom(sub.toJSON()));
    return saved === "saved" ? "on" : saved;
  } catch {
    return "failed";
  }
}

/** 이 브라우저의 구독을 끈다. 브라우저 쪽 구독도 함께 지운다 — 그래야 재시도할 수 있다. */
export async function turnOffPush(): Promise<"off" | "failed"> {
  /**
   * ** 구독을 끊기 전에 주소를 꺼둔다.** 서버는 이제 **이 기기 하나만** 지운다 — 예전처럼
   * `memberId` 로 지우면 휴대폰에서 꺼도 이 노트북의 구독까지 함께 사라진다. 주소를 먼저
   * 확보해야 그 기기를 정확히 가리킬 수 있다.
   */
  let endpoint: string | null = null;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    endpoint = sub?.endpoint ?? null;
    await sub?.unsubscribe();
  } catch {
    // 브라우저 쪽을 못 지워도 서버 쪽은 지운다 — 화면이 "꺼짐"이라고 말할 상태는 되어야 한다.
  }
  try {
    // 주소를 못 얻었다면 **아무것도 안 지운다**(서버가 그렇게 막아 둔다). 모르는 걸 지우는
    // 것은 예전 사고의 모양이다 — 남의 기기까지 꺼진다고 말하면 되돌릴 수 없다.
    await clearPushSubscription(endpoint);
    return "off";
  } catch {
    return "failed";
  }
}
