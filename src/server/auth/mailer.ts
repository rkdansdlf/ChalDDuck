import "server-only";

import nodemailer from "nodemailer";

/**
 * 메일을 **실제로 내보내는** 계층.
 *
 * 인증번호를 누가 누구 주소로 보내는지만 여기서 정하고, 메일 내용(인증번호·매직 링크)은
 * 호출하는 쪽이 만든다. 경로가 두 개 생긴 것은 도메인이 없기 때문이다.
 *
 * ## 왜 두 개인가
 *
 * Resend 는 **도메인을 소유하고 인증해야만** 보낼 수 있다. 공유 도메인(`*.vercel.app`)은
 * Vercel 이 소유해 DNS 를 건드릴 수 없어 인증 자체가 불가능하다 — 그래서 도메인이 없는
 * 동안 Resend 는 쓸 수 없었다.
 *
 * Gmail 은 그 제약을 피하는 유일한 **무료** 길이다. 이력 함의 두 가지가 있어 감수해야 한다.
 * - **Google 자동발송 약관을 어긴다.** 이 앱이 하루 수십 통 넘지 않아 대체로 괜찮지만,
 *   어설프게 쓰면 계정이 잠긴다.
 * - **Gmail 앱 비밀번호가 곧 그 권한이다.** 이 값을 아는 사람은 전부 그 주소로 보낼 수 있다.
 *
 * 그래서 Gmail 은 "도메인이 생길 때까지의 임시 수단" 으로 여기 둔다. 도메인을 사면
 * `RESEND_API_KEY` 하나만 남기고 Gmail 변수를 걷어내면 된다 — 내용 코드도 그대로다.
 */

/** 어떤 경로로 보내는지 — 서버 로그와 화면 실패 메시지에 쓰인다. */
export type Mailer = "gmail" | "resend";

export type MailerStatus =
  | { ok: true; via: Mailer }
  | { ok: false; via: Mailer | null; reason: string; detail?: string };

/** 보낼 수단이 설정되어 있는지. 미설정이면 화면이 "전송 버튼"을 감출 수 있다. */
export function configuredMailer(): Mailer | null {
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) return "gmail";
  if (process.env.RESEND_API_KEY) return "resend";
  return null;
}

/** 발신 표시 이름. Gmail 경로에서는 도메인이 gmail.com 으로 고정되므로 이름이 전부다. */
function fromName(): string {
  return process.env.GMAIL_FROM_NAME || "찰떡";
}

/**
 * Gmail 로 보낸다.
 *
 * 발신 주소는 Gmail 계정으로 고정이지만 **표시 이름은 우리 것이 보인다** — 수신자 입장에선
 * "찰떡 <어떤@gmail.com>" 이고, 메일이 실제로 Gmail 에서 나왔으므로 스팸 판정도 통과한다.
 * 공용 발신 주소를 쓰는 무료 서비스와 이게 결정적으로 다른 점이다.
 */
async function sendViaGmail(mail: { to: string; subject: string; html: string }): Promise<MailerStatus> {
  const user = process.env.GMAIL_USER as string;
  const pass = process.env.GMAIL_APP_PASSWORD as string;

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass },
    });

    await transporter.sendMail({
      from: `"${fromName()}" <${user}>`,
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
    });

    return { ok: true, via: "gmail" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Mailer] Gmail 발송 실패:", message);

    // 두 가지는 설정 실수라 그대로 알려 준다 — 사용자가 고쳐야 한다.
    if (/invalid credentials|535|authentication/i.test(message)) {
      console.error(
        "[Mailer] Gmail 로그인이 거부되었습니다. GMAIL_USER 와 GMAIL_APP_PASSWORD 를 확인하세요. " +
          "Gmail 로그인 자체에도 2단계 인증이 켜져 있어야 앱 비밀번호가 발급됩니다.",
      );
    } else if (/disabled|not secure|less secure/i.test(message)) {
      console.error(
        "[Mailer] Gmail 이 이 계정의 발송을 막고 있습니다. Google 로그인 보안 설정에서 " +
          "낮은 보안 앱 액세스를 허용하거나, 계정 자체가 잠긴 상태일 수 있습니다.",
      );
    }

    return { ok: false, via: "gmail", reason: "Gmail 이 발송을 거절했습니다", detail: message };
  }
}

/** Resend 로 보낸다. */
async function sendViaResend(mail: { to: string; subject: string; html: string }): Promise<MailerStatus> {
  const apiKey = process.env.RESEND_API_KEY as string;
  const from = process.env.RESEND_FROM || "찰떡 <auth@chalddeok.com>";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: mail.to, subject: mail.subject, html: mail.html }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("[Mailer] Resend API Error:", res.status, body);

      // 403 은 거의 항상 발신 도메인 미검증이다. 무엇을 해야 하는지도 같이 찍는다.
      if (res.status === 403) {
        console.error(
          `[Mailer] 발신 주소가 Resend 에서 거부되었습니다: ${from} — ` +
            `resend.com > Domains 에서 도메인을 인증하거나 RESEND_FROM 을 바꾸세요. ` +
            `(*.vercel.app 같은 공유 도메인은 인증할 수 없습니다.)`,
        );
      }

      return { ok: false, via: "resend", reason: "Resend 가 거절했습니다", detail: body };
    }

    return { ok: true, via: "resend" };
  } catch (err) {
    console.error("[Mailer] Resend 발송 중 오류:", err);
    return { ok: false, via: "resend", reason: "발송 중 오류" };
  }
}

/**
 * 메일 하나를 보낸다. 설정된 경로로만 보내고, **실패를 성공으로 바꾸지 않는다.**
 *
 * 호출자는 이 결과가 `ok: false` 면 사용자에게 발송 실패라고 말해야 한다. 여기서 성공을
 * 보고하면 그 위에 무엇을 얹어도 고칠 수 없다 — 그게 처음에 이 인증번호가 "보냈는데
 * 안 온다"가 되던 이유였다.
 */
export async function sendMail(mail: { to: string; subject: string; html: string }): Promise<MailerStatus> {
  const mailer = configuredMailer();

  if (mailer === "gmail") return sendViaGmail(mail);
  if (mailer === "resend") return sendViaResend(mail);

  console.error(
    "[Mailer] 보낼 수단이 없습니다. Vercel 환경변수에 GMAIL_USER · GMAIL_APP_PASSWORD(무료 Gmail 경로) " +
      "또는 RESEND_API_KEY(도메인 필요)를 넣으세요.",
  );
  return { ok: false, via: null, reason: "보낼 수단이 설정되어 있지 않습니다" };
}
