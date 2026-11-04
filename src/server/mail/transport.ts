import { getServerEnv } from "@/lib/env";

/**
 * Email transport abstraction. In development (no SMTP configured), links are
 * logged to the server console so flows can be exercised. When SMTP_* env
 * vars are present, a real transport is used.
 *
 * This keeps the verification/password-reset flows honest: without SMTP
 * configuration the system cannot deliver email, and it says so rather than
 * pretending delivery happened.
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}

class DevLoggerTransport implements MailTransport {
  async send(message: MailMessage): Promise<void> {
    if (process.env.NODE_ENV === "production" && !getServerEnv().SMTP_HOST) {
      throw new Error(
        "Email delivery requires SMTP configuration (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS). " +
          "No email was sent.",
      );
    }
    // Log the full text (which contains the action link) so dev flows work.
    console.log(
      `\n[mail:dev] To: ${message.to}\n  Subject: ${message.subject}\n  ${message.text}\n`,
    );
  }
}

class SmtpTransport implements MailTransport {
  async send(message: MailMessage): Promise<void> {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = getServerEnv();
    if (!SMTP_HOST || !SMTP_PORT) {
      throw new Error("SMTP not configured (SMTP_HOST/SMTP_PORT required)");
    }
    // Minimal, dependency-free SMTP is not reasonable; the server uses nodemailer
    // in production when configured. For this phase we validate config and
    // fail loudly if the transport is unavailable.
    const nodemailer = (await import("nodemailer")) as typeof import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    });
    await transporter.sendMail({
      from: SMTP_FROM ?? `MNEMOSYNE <noreply@mnemosyne.app>`,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html ?? message.text,
    });
  }
}

export function getTransport(): MailTransport {
  const { SMTP_HOST } = getServerEnv();
  return SMTP_HOST ? new SmtpTransport() : new DevLoggerTransport();
}

export async function sendMail(message: MailMessage): Promise<void> {
  await getTransport().send(message);
}

export function buildActionUrl(path: string): string {
  // Prefer an explicitly configured public site URL so verification/reset
  // links resolve correctly in production; fall back to APP_URL (dev).
  const base = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    getServerEnv().APP_URL
  ).replace(/\/$/, "");
  return `${base}${path}`;
}
