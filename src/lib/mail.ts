import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

/**
 * Outgoing mail via any SMTP server (QQ 邮箱, Gmail, Resend, SendGrid …).
 * Configure SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM; without them mail is disabled
 * and the app falls back to admin-generated reset links.
 */
export function mailEnabled() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transporter: Transporter | null = null;

function getTransporter() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 465);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 15_000,
    });
  }
  return transporter;
}

export async function sendMail(to: string, subject: string, text: string, html: string) {
  const from = process.env.SMTP_FROM || `就活小助手 <${process.env.SMTP_USER}>`;
  await getTransporter().sendMail({ from, to, subject, text, html });
}

export function publicUrl() {
  return (process.env.PUBLIC_URL || "http://localhost:3000").replace(/\/$/, "");
}
