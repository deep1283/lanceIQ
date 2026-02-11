import { Resend } from 'resend';

function parseRrule(rrule: string) {
  const parts = rrule.split(';').reduce<Record<string, string>>((acc, part) => {
    const [key, value] = part.split('=');
    if (key && value) acc[key.trim().toUpperCase()] = value.trim().toUpperCase();
    return acc;
  }, {});
  const freq = parts.FREQ || 'MONTHLY';
  const interval = Math.max(1, Number(parts.INTERVAL || '1'));
  return { freq, interval };
}

export function nextRunFrom(rrule: string, base: Date) {
  const { freq, interval } = parseRrule(rrule);
  const next = new Date(base);
  if (freq === 'DAILY') {
    next.setDate(next.getDate() + interval);
  } else if (freq === 'WEEKLY') {
    next.setDate(next.getDate() + interval * 7);
  } else {
    next.setMonth(next.getMonth() + interval);
  }
  return next;
}

export async function sendAccessReviewEmail(to: string, workspaceName: string, cycleId: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false as const, error: 'Missing RESEND_API_KEY' };
  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  const subject = `[LanceIQ] Access review required for ${workspaceName}`;
  const body = `An access review cycle (${cycleId}) has been created for ${workspaceName}. Please complete it in the dashboard.`;

  try {
    const response = await resend.emails.send({
      from,
      to,
      subject,
      text: body,
    });
    return { ok: true as const, response };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  }
}
