import { Resend } from "resend";
import type { Redis } from "@upstash/redis";
import { acquireCooldown, incrementWindowCounter } from "@/lib/ingest-helpers";
import { logAlertDelivery } from "@/utils/alerts";

export type AlertChannel = "email" | "slack" | "webhook";

export interface AlertSetting {
  id: string;
  workspace_id: string;
  channel: AlertChannel;
  destination: string;
  enabled: boolean;
  critical_fail_count: number;
  window_minutes: number;
  cooldown_minutes: number;
}

const CRITICAL_REASONS = new Set(["mismatch", "malformed_signature"]);

export function isCriticalReason(reason?: string | null): boolean {
  return reason ? CRITICAL_REASONS.has(reason) : false;
}

function getSiteUrl(): string {
  return (
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ||
    "https://lanceiq.com"
  );
}

function buildAlertLines(opts: {
  setting: AlertSetting;
  workspaceName: string;
  provider: string;
  reason: string;
  eventId?: string | null;
}) {
  const { workspaceName, provider, reason, eventId, setting } = opts;
  return [
    `Critical alert: repeated signature verification failures detected.`,
    ``,
    `Workspace: ${workspaceName}`,
    `Provider: ${provider}`,
    `Reason: ${reason}`,
    `Failures in last ${setting.window_minutes}m: (threshold reached)`,
    eventId ? `Latest event id: ${eventId}` : null,
  ].filter(Boolean) as string[];
}

async function sendEmailAlert(opts: {
  setting: AlertSetting;
  workspaceName: string;
  provider: string;
  reason: string;
  eventId?: string | null;
}) {
  const { setting, workspaceName, provider, reason, eventId } = opts;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false as const, error: "Missing RESEND_API_KEY" };

  const resend = new Resend(apiKey);
  const siteUrl = getSiteUrl();
  const subject = `[LanceIQ] Signature failures detected for ${workspaceName}`;
  const from = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

  const lines = [
    ...buildAlertLines({ setting, workspaceName, provider, reason, eventId }),
    ``,
    `Review: ${siteUrl}/dashboard`,
    ``,
    `This alert is rate-limited (cooldown ${setting.cooldown_minutes}m) to avoid noise.`,
  ];

  try {
    const response = await resend.emails.send({
      from,
      to: setting.destination,
      subject,
      text: lines.join("\n"),
    });
    const providerMessageId =
      (response as { data?: { id?: string } }).data?.id ||
      (response as { id?: string }).id ||
      undefined;
    // Cast response to satisfy Record<string, unknown>
    return { ok: true as const, response: response as unknown as Record<string, unknown>, providerMessageId };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  }
}

async function sendWebhookAlert(opts: {
  setting: AlertSetting;
  workspaceName: string;
  provider: string;
  reason: string;
  eventId?: string | null;
}) {
  const { setting, workspaceName, provider, reason, eventId } = opts;
  const siteUrl = getSiteUrl();
  let destinationUrl: URL;
  try {
    destinationUrl = new URL(setting.destination);
  } catch {
    return { ok: false as const, error: "Invalid destination URL." };
  }
  if (destinationUrl.protocol !== "https:") {
    return { ok: false as const, error: "Destination URL must use HTTPS." };
  }
  const payload =
    setting.channel === "slack"
      ? {
          text: [
            `*LanceIQ Alert*`,
            `Workspace: ${workspaceName}`,
            `Provider: ${provider}`,
            `Reason: ${reason}`,
            eventId ? `Event ID: ${eventId}` : null,
            `Review: ${siteUrl}/dashboard`,
          ].filter(Boolean).join("\n"),
        }
      : {
          type: "signature_failure",
          workspace: workspaceName,
          provider,
          reason,
          event_id: eventId ?? null,
          url: `${siteUrl}/dashboard`,
          occurred_at: new Date().toISOString(),
        };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(destinationUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) {
      const text = await response.text();
      return { ok: false as const, error: `Webhook failed: ${response.status} ${text}` };
    }
    return { ok: true as const, response: { status: response.status } };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false as const, error: "Webhook timed out after 5s." };
    }
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function maybeSendCriticalAlert(opts: {
  redis: Redis | null;
  setting: AlertSetting;
  workspaceName: string;
  provider: string;
  reason: string;
  eventId?: string | null;
}): Promise<void> {
  const { redis, setting, workspaceName, provider, reason, eventId } = opts;

  if (!setting.enabled) return;
  if (!setting.destination) return;
  if (!isCriticalReason(reason)) return;
  if (!redis) return;

  const countKey = `alerts:failures:${setting.workspace_id}:${provider}:${reason}`;
  const windowSec = Math.max(1, setting.window_minutes) * 60;
  const count = await incrementWindowCounter(redis, countKey, windowSec);
  if (count < Math.max(1, setting.critical_fail_count)) return;

  const cooldownKey = `alerts:cooldown:${setting.workspace_id}:${provider}:${reason}`;
  const cooldownSec = Math.max(1, setting.cooldown_minutes) * 60;
  const acquired = await acquireCooldown(redis, cooldownKey, cooldownSec);
  if (!acquired) return;

  try {
    let result:
      | { ok: true; response?: Record<string, unknown>; providerMessageId?: string }
      | { ok: false; error: string };

    if (setting.channel === "email") {
      result = await sendEmailAlert({ setting, workspaceName, provider, reason, eventId });
    } else {
      result = await sendWebhookAlert({ setting, workspaceName, provider, reason, eventId });
    }

    if (result.ok) {
      await logAlertDelivery({
        workspaceId: setting.workspace_id,
        alertSettingId: setting.id,
        channel: setting.channel,
        status: "sent",
        responsePayload: result.response || {},
        providerMessageId: result.providerMessageId,
      });
    } else {
      await logAlertDelivery({
        workspaceId: setting.workspace_id,
        alertSettingId: setting.id,
        channel: setting.channel,
        status: "failed",
        lastError: result.error,
      });
    }
  } catch (err) {
    console.error("Alert delivery failed:", err);
    await logAlertDelivery({
      workspaceId: setting.workspace_id,
      alertSettingId: setting.id,
      channel: setting.channel,
      status: "failed",
      lastError: err instanceof Error ? err.message : String(err),
    });
  }
}
