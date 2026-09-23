import { join } from 'path';
import { readFile } from 'fs/promises';
import ejs from 'ejs';
import nodemailer from 'nodemailer';

export type SendEmailData = Record<string, unknown>;

function createGmailTransporter() {
  const user = process.env.SMTP_USER ?? process.env.GMAIL_USER;
  const pass = process.env.SMTP_PASS ?? process.env.GMAIL_PASS;

  if (!user || !pass) {
    throw new Error(
      'Missing SMTP credentials. Set SMTP_USER and SMTP_PASS (Gmail app password) in .env',
    );
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
}

function resolveTemplatePath(template: string) {
  const fileName = template.endsWith('.ejs') ? template : `${template}.ejs`;
  return join(__dirname, 'assets', 'email-templates', fileName);
}

export async function sendEmail(
  to: string,
  subject: string,
  template: string,
  data: SendEmailData,
): Promise<void> {
  const transporter = createGmailTransporter();
  const templatePath = resolveTemplatePath(template);
  const templateSource = await readFile(templatePath, 'utf8');
  const html = ejs.render(templateSource, data);

  const from =
    process.env.SMTP_FROM ?? process.env.SMTP_USER ?? process.env.GMAIL_USER;

  await transporter.sendMail({
    from,
    to,
    subject,
    html,
  });
}
