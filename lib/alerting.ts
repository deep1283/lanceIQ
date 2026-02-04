import { Resend } from "resend";
import type { Redis } from "@upstash/redis";
import { acquireCooldown, incrementWindowCounter } from "@/lib/ingest-helpers";

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

export async function maybeSendCriticalEmailAlert(opts: {
  redis: Redis | null;
  setting: AlertSetting;
  workspaceName: string;
  provider: string;
  reason: string;
  eventId?: string | null;
}): Promise<void> {
  const { redis, setting, workspaceName, provider, reason, eventId } = opts;

  if (!setting.enabled || setting.channel !== "email") return;
  if (!setting.destination) return;
  if (!isCriticalReason(reason)) return;
  if (!redis) return;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const countKey = `alerts:failures:${setting.workspace_id}:${provider}:${reason}`;
  const windowSec = Math.max(1, setting.window_minutes) * 60;
  const count = await incrementWindowCounter(redis, countKey, windowSec);
  if (count < Math.max(1, setting.critical_fail_count)) return;

  const cooldownKey = `alerts:cooldown:${setting.workspace_id}:${provider}:${reason}`;
  const cooldownSec = Math.max(1, setting.cooldown_minutes) * 60;
  const acquired = await acquireCooldown(redis, cooldownKey, cooldownSec);
  if (!acquired) return;

  const resend = new Resend(apiKey);
  const siteUrl = getSiteUrl();
  const subject = `[LanceIQ] Signature failures detected for ${workspaceName}`;
  const from = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

  const lines = [
    `Critical alert: repeated signature verification failures detected.`,
    ``,
    `Workspace: ${workspaceName}`,
    `Provider: ${provider}`,
    `Reason: ${reason}`,
    `Failures in last ${setting.window_minutes}m: ${count}`,
    eventId ? `Latest event id: ${eventId}` : null,
    ``,
    `Review: ${siteUrl}/dashboard`,
    ``,
    `This alert is rate-limited (cooldown ${setting.cooldown_minutes}m) to avoid noise.`,
  ].filter(Boolean);

  try {
    await resend.emails.send({
      from,
      to: setting.destination,
      subject,
      text: lines.join("\n"),
    });
  } catch (err) {
    console.error("Alert email failed:", err);
  }
}
