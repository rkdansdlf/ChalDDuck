/**
 * 이메일이 나가지 않았을 때의 **결과와 로그** — 한 곳에만 있는 정책.
 *
 * 이 파일이 있는 이유는 두 가지다.
 *
 * 1. **운영 로그에 인증번호를 남기지 않는다.** 이메일이 나가지 않았다는 사실은 고쳐야 하지만,
 *    인증번호·매직 링크·수신 주소는 그 주소의 계정에 로그인할 수 있는 값이다. 발송이 **실패한**
 *    경로에서 그걸 로그로 넘기면, 로그를 볼 수 있는 사람이 곧 인증을 끝낼 수 있다. 실패를
 *    감추려던 코드가 실제로는 가장 큰 구멍이 된다 — 그래서 고치면서 동시에 드러낸다.
 * 2. **정책이 테스트 가능해야 한다.** 로그에 무엇이 찍히는지는 콘솔을 붙잡고 있어야만 알 수
 *    있는데, 그 검증은 애플리케이션 코드에서 하면 매번 위험하다. "무엇을 남길지"를 값으로
 *    돌려주면 아무 코드도 실행하지 않고 확인한다.
 *
 * 호출부는 `server/auth/email-token.ts` 의 `undelivered()` 다. **여기에 정책이 하나뿐이므로
 * 발송 경로가 늘어도(지금은 Gmail·Resend 둘) 같은 판단을 한다.**
 */

/** 발송 실패를 사용자에게 어떻게 말할지, 그리고 로그에 무엇을 남길지. */
export type Undelivered = {
  /** 발송에 실패했음을 알린다. 프로덕션에서는 `previewCode` 를 절대 담지 않는다. */
  result: { success: boolean; previewCode?: string };
  /** 로그에 남길 한 줄. 운영이면 어떤 인증값도 포함하지 않는다. */
  line: string;
};

/** 로그에 남기면 안 되는 값들. 운영 로그에 이게 있으면 인증을 건네준 셈이다. */
export type EmailSecrets = {
  /** 인증번호. */
  code: string;
  /** 로그인 링크 — 누가 이면 그 사람의 계정이다. */
  magicLink: string;
  /** 수신 주소. */
  email: string;
};

/**
 * 발송 실패 한 건의 결과를 정한다. 콘솔을 건드리지 **않는다** — 호출부가 `line` 을 찍는다.
 *
 * `isProduction` 을 인자로 받는 이유: 이 판단이 프로세스 환경에 의존하면 테스트에서 prod 를
 * 흉내 내야 하는데, 흉내 내야 하는 순간 실제로 고쳐야 할 경로와 다른 경로를 테스트하게 된다.
 * 그래서 판단에 필요한 값 하나만 받는다.
 */
export function undelivery(isProduction: boolean, reason: string, secrets: EmailSecrets): Undelivered {
  if (isProduction) {
    return {
      result: { success: false },
      // 발송 경로(`server/auth/mailer.ts` 가 스스로 남긴다)와 이유만 알면 고칠 수 있다.
      line: `[Email Auth] 메일을 보내지 못했습니다 (${reason}). 발송 경로 설정을 확인하세요.`,
    };
  }

  return {
    // 개발에서는 발송이 막혀도 로그인할 수 있게 인증번호를 화면으로 되돌려 준다.
    result: { success: true, previewCode: secrets.code },
    line:
      `\n========================================\n[찰떡 이메일 인증 · ${reason}] ${secrets.email}\n` +
      `인증번호: ${secrets.code}\n매직링크: ${secrets.magicLink}\n========================================\n`,
  };
}
