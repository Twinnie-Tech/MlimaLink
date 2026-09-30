import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

export type MailMessage = {
  to: string;
  subject: string;
  /** Plain text; each entry becomes a paragraph. */
  paragraphs: string[];
  link?: { label: string; url: string };
};

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ESCAPES[char]);

export function renderMail({ paragraphs, link }: MailMessage): string {
  const body = paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 12px">${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`,
    )
    .join('');
  const button = link
    ? `<p style="margin:20px 0 0"><a href="${escapeHtml(link.url)}" style="background:#111827;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">${escapeHtml(link.label)}</a></p>`
    : '';
  return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#111827;max-width:560px">${body}${button}<p style="margin:24px 0 0;color:#6b7280;font-size:13px">MlimaLink</p></div>`;
}

/** Sends notification emails with the same SMTP settings as auth-service. */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter?: Transporter;

  private client(): Transporter | undefined {
    if (this.transporter) return this.transporter;
    const user = process.env.SMTP_USER ?? process.env.GMAIL_USER;
    const pass = (process.env.SMTP_PASS ?? process.env.GMAIL_PASS)?.replace(
      /\s+/g,
      '',
    );
    if (!user || !pass) return undefined;
    this.transporter = nodemailer.createTransport({
      service: process.env.SMTP_SERVICE || 'gmail',
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 465,
      secure: (Number(process.env.SMTP_PORT) || 465) === 465,
      auth: { user, pass },
    });
    return this.transporter;
  }

  /** Best effort: the action that triggered the email has already happened, so failures are only logged. */
  async send(message: MailMessage): Promise<boolean> {
    const client = this.client();
    if (!client) {
      this.logger.warn(
        `SMTP isn't configured, so "${message.subject}" wasn't emailed. Set SMTP_USER and SMTP_PASS in .env.`,
      );
      return false;
    }
    try {
      await client.sendMail({
        from:
          process.env.SMTP_FROM ??
          process.env.SMTP_USER ??
          process.env.GMAIL_USER,
        to: message.to,
        subject: message.subject,
        text: [
          ...message.paragraphs,
          ...(message.link
            ? [`${message.link.label}: ${message.link.url}`]
            : []),
        ].join('\n\n'),
        html: renderMail(message),
      });
      return true;
    } catch (error) {
      this.logger.error(`Couldn't email "${message.subject}"`, error);
      return false;
    }
  }
}
