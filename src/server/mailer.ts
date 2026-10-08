/**
 * Wysyłka e-maili przez SMTP (Brevo): potwierdzenie rejestracji, reset hasła, powiadomienia o koncie.
 * Konfiguracja wyłącznie ze zmiennych środowiskowych; klucz SMTP nigdy nie trafia do repozytorium.
 */
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { esc, SITE_URL } from './seo';

const SMTP_HOST = (process.env.SMTP_HOST || '').trim();
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10) || 587;
const SMTP_USER = (process.env.SMTP_USER || '').trim();
const SMTP_PASSWORD = (process.env.SMTP_PASSWORD || '').trim();
const MAIL_FROM = (process.env.MAIL_FROM || 'Mana Screw <noreply@manascrew.eu>').trim();

/** Czy serwer potrafi wysyłać maile. Bez tego rejestracja nie wymaga potwierdzenia (np. lokalnie). */
export const isMailConfigured = (): boolean => Boolean(SMTP_HOST && SMTP_USER && SMTP_PASSWORD);

let transporter: Transporter | null = null;
function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      // Port 587: połączenie musi przejść na TLS (STARTTLS), inaczej hasło poszłoby otwartym tekstem
      requireTLS: SMTP_PORT !== 465,
      auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000
    });
  }
  return transporter;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendMail(msg: MailMessage): Promise<void> {
  if (!isMailConfigured()) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Mail] SMTP nie jest skonfigurowany. Wiadomość do ${msg.to}: ${msg.subject}\n${msg.text}`);
      return;
    }
    throw new Error('SMTP nie jest skonfigurowany (SMTP_HOST, SMTP_USER, SMTP_PASSWORD).');
  }
  await getTransporter().sendMail({ from: MAIL_FROM, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
}

/** Sprawdza połączenie i logowanie do SMTP przy starcie, żeby błędną konfigurację widać było w logach od razu. */
export async function verifyMailer(): Promise<void> {
  if (!isMailConfigured()) {
    console.warn('[Mail] SMTP nie jest skonfigurowany: rejestracja nie wymaga potwierdzenia e-mail, reset hasła przez e-mail jest wyłączony.');
    return;
  }
  try {
    await getTransporter().verify();
    console.log(`[Mail] Połączenie SMTP z ${SMTP_HOST}:${SMTP_PORT} działa.`);
  } catch (err: any) {
    console.error(`[Mail] Nie udało się połączyć z SMTP ${SMTP_HOST}:${SMTP_PORT}:`, err?.message || err);
  }
}

// ---------- Linki ----------

export const verifyEmailLink = (token: string) => `${SITE_URL}/potwierdz-email?token=${encodeURIComponent(token)}`;
export const resetPasswordLink = (token: string) => `${SITE_URL}/nowe-haslo?token=${encodeURIComponent(token)}`;

// ---------- Szablony ----------

function layout(title: string, paragraphs: string[], button?: { label: string; href: string }, footnote?: string): string {
  const p = paragraphs
    .map((t) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#d6d3d1;">${t}</p>`)
    .join('');
  const btn = button
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 24px;"><tr><td style="border-radius:12px;background:#fbbf24;">
<a href="${esc(button.href)}" style="display:inline-block;padding:14px 24px;font-size:15px;font-weight:700;color:#1c1917;text-decoration:none;border-radius:12px;">${esc(button.label)}</a>
</td></tr></table>
<p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#a8a29e;">Jeśli przycisk nie działa, skopiuj ten adres do przeglądarki:<br><a href="${esc(button.href)}" style="color:#fbbf24;word-break:break-all;">${esc(button.href)}</a></p>`
    : '';
  const note = footnote ? `<p style="margin:0;font-size:13px;line-height:1.6;color:#a8a29e;">${footnote}</p>` : '';
  return `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#0c0a09;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0c0a09;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#1c1917;border:1px solid #292524;border-radius:16px;">
<tr><td style="padding:28px 28px 8px;"><p style="margin:0;font-size:17px;font-weight:700;color:#fafaf9;">Mana Screw</p></td></tr>
<tr><td style="padding:16px 28px 28px;">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#fafaf9;">${esc(title)}</h1>
${p}${btn}${note}
</td></tr></table>
<p style="margin:16px 0 0;font-size:12px;color:#78716c;">Wiadomość wysłana automatycznie z <a href="${esc(SITE_URL)}" style="color:#a8a29e;">${esc(SITE_URL.replace(/^https?:\/\//, ''))}</a>. Nie odpowiadaj na nią.</p>
</td></tr></table>
</body></html>`;
}

export function verifyEmailMessage(to: string, username: string, token: string, validHours: number): MailMessage {
  const link = verifyEmailLink(token);
  return {
    to,
    subject: 'Potwierdź adres e-mail w Mana Screw',
    text:
      `Cześć ${username}!\n\n` +
      `Dziękujemy za założenie konta w Mana Screw. Aby je aktywować, otwórz ten link:\n${link}\n\n` +
      `Link jest ważny ${validHours} godzin. Jeśli to nie Ty zakładałeś konto, zignoruj tę wiadomość.\n`,
    html: layout(
      'Potwierdź adres e-mail',
      [
        `Cześć <strong style="color:#fafaf9;">${esc(username)}</strong>!`,
        'Dziękujemy za założenie konta w Mana Screw. Kliknij przycisk poniżej, aby potwierdzić adres e-mail i aktywować konto.'
      ],
      { label: 'Potwierdź adres e-mail', href: link },
      `Link jest ważny ${validHours} godzin. Jeśli to nie Ty zakładałeś konto, zignoruj tę wiadomość.`
    )
  };
}

export function resetPasswordMessage(to: string, username: string, token: string, validMinutes: number): MailMessage {
  const link = resetPasswordLink(token);
  return {
    to,
    subject: 'Ustaw nowe hasło w Mana Screw',
    text:
      `Cześć ${username}!\n\n` +
      `Otrzymaliśmy prośbę o zmianę hasła do Twojego konta. Aby ustawić nowe hasło, otwórz ten link:\n${link}\n\n` +
      `Link jest ważny ${validMinutes} minut i działa tylko raz. Jeśli to nie Ty prosiłeś o zmianę, zignoruj tę wiadomość: Twoje hasło się nie zmieni.\n`,
    html: layout(
      'Ustaw nowe hasło',
      [
        `Cześć <strong style="color:#fafaf9;">${esc(username)}</strong>!`,
        'Otrzymaliśmy prośbę o zmianę hasła do Twojego konta. Kliknij przycisk poniżej, aby ustawić nowe hasło.'
      ],
      { label: 'Ustaw nowe hasło', href: link },
      `Link jest ważny ${validMinutes} minut i działa tylko raz. Jeśli to nie Ty prosiłeś o zmianę, zignoruj tę wiadomość: Twoje hasło się nie zmieni.`
    )
  };
}

export function passwordChangedMessage(to: string, username: string): MailMessage {
  const when = new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', dateStyle: 'long', timeStyle: 'short' });
  return {
    to,
    subject: 'Hasło do Mana Screw zostało zmienione',
    text:
      `Cześć ${username}!\n\n` +
      `Hasło do Twojego konta zostało zmienione (${when}) i wylogowaliśmy Cię ze wszystkich urządzeń.\n\n` +
      `Jeśli to nie Ty, od razu ustaw nowe hasło przez „Nie pamiętasz hasła?” na ${SITE_URL}\n`,
    html: layout(
      'Hasło zostało zmienione',
      [
        `Cześć <strong style="color:#fafaf9;">${esc(username)}</strong>!`,
        `Hasło do Twojego konta zostało zmienione (${esc(when)}) i wylogowaliśmy Cię ze wszystkich urządzeń.`
      ],
      undefined,
      `Jeśli to nie Ty, od razu ustaw nowe hasło przez „Nie pamiętasz hasła?” na <a href="${esc(SITE_URL)}" style="color:#fbbf24;">${esc(SITE_URL.replace(/^https?:\/\//, ''))}</a>.`
    )
  };
}
