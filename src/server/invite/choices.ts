/**
 * 화면이 고를 수 있는 초대의 값.
 *
 * ## 왜 `"use server"` 파일이 아닌가
 *
 * 서버 액션 파일에서는 **async 함수만** 내보낼 수 있다. 상수를 여기 두면 화면과 스모크가 그
 * 배열을 직접 보고 **서버가 실제로 받아들이는 값의 목록**과 같은 것을 알 수 없다 — 화면은
 * 고른 값을 보낸 뒤에야 거절당한다.
 *
 * 그래서 규칙을 한 곳에 두고 **액션과 테스트가 같이 본다.** 서버가 새로 고르면 그 자리에서
 * 거절한다(`actions/invite.ts`).
 */

/** 몇 명분으로 쓸지. `null` 은 "제한 없음" 이고 서버가 따로 다룬다. */
export const USE_CHOICES = [1, 2, 3, 5, 10] as const;

/** 며칠 열어 둘지. `null` 은 "기한 없음". */
export const EXPIRY_CHOICES = [1, 3, 7, 30] as const;

/** 이름이 들어갈 자리. 화면의 `maxLength` 와 같아야 하고, 서버가 잘라 넣는다. */
export const INVITE_LABEL_MAX = 20;

export function isUseChoice(value: number | null): value is (typeof USE_CHOICES)[number] {
  return value === null || USE_CHOICES.includes(value as (typeof USE_CHOICES)[number]);
}

export function isExpiryChoice(value: number | null): value is (typeof EXPIRY_CHOICES)[number] {
  return value === null || EXPIRY_CHOICES.includes(value as (typeof EXPIRY_CHOICES)[number]);
}
