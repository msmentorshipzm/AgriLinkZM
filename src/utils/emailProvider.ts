export const BREVO_SEND_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
export const DEFAULT_SENDER_EMAIL = 'agrilinkzm0@gmail.com';
export const DEFAULT_SENDER_NAME = 'AgriLink ZM';

export interface BrevoEmailPayload {
  sender: {
    name: string;
    email: string;
  };
  to: Array<{
    email: string;
    name?: string;
  }>;
  replyTo: {
    name: string;
    email: string;
  };
  subject: string;
  textContent: string;
}

export function hasConfiguredBrevoKey(rawKey?: string): boolean {
  const key = rawKey?.trim() || '';
  if (!key || key === 'MY_BREVO_API_KEY') {
    return false;
  }
  return true;
}

export function resolveBrevoSender(env: {
  BREVO_SENDER_EMAIL?: string;
  BREVO_SENDER_NAME?: string;
}): { email: string; name: string } {
  const email = env.BREVO_SENDER_EMAIL?.trim() || DEFAULT_SENDER_EMAIL;
  const name = env.BREVO_SENDER_NAME?.trim() || DEFAULT_SENDER_NAME;
  return { email, name };
}

export function buildBrevoEmailPayload(params: {
  toEmail: string;
  toName?: string;
  subject: string;
  text: string;
  senderEmail?: string;
  senderName?: string;
}): BrevoEmailPayload {
  const senderEmail = params.senderEmail?.trim() || DEFAULT_SENDER_EMAIL;
  const senderName = params.senderName?.trim() || DEFAULT_SENDER_NAME;
  const cleanRecipientEmail = params.toEmail.trim();
  const cleanRecipientName = params.toName?.trim();

  return {
    sender: {
      name: senderName,
      email: senderEmail,
    },
    to: [
      cleanRecipientName
        ? { email: cleanRecipientEmail, name: cleanRecipientName }
        : { email: cleanRecipientEmail },
    ],
    replyTo: {
      name: senderName,
      email: senderEmail,
    },
    subject: params.subject.trim(),
    textContent: params.text,
  };
}
