import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { checkProStatus } from "@/app/actions/subscription";
import { pickPrimaryWorkspace } from "@/lib/workspace";

const PAGE_SIZE = 1000;

function csvEscape(value: string | number | null | undefined) {
  if (value === null || value === undefined) return '""';
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
}

function retentionPolicyLabel(storeRawBody?: boolean | null, retentionDays?: number | null) {
  if (!storeRawBody) return 'raw_body_not_retained';
  const days = typeof retentionDays === 'number' && Number.isFinite(retentionDays) ? retentionDays : null;
  if (days && days > 0) return `raw_body_retained_${days}d`;
  return 'raw_body_retained';
}

export async function GET(_request: NextRequest) {
  const supabase = await createClient();

  // 1. Auth Check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Resolve Workspace Context (must happen before streaming)
  const { data: workspaces } = await supabase
    .from("workspace_members")
    .select(`workspace_id, workspaces ( id, plan, created_at )`)
    .eq("user_id", user.id);

  const activeWorkspace = pickPrimaryWorkspace(workspaces);
  if (!activeWorkspace) {
    return NextResponse.json({ error: "No workspace found" }, { status: 400 });
  }

  const workspaceId = activeWorkspace.id;

  const { data: workspaceConfig } = await supabase
    .from("workspaces")
    .select("store_raw_body, raw_body_retention_days")
    .eq("id", workspaceId)
    .single();

  const retentionLabel = retentionPolicyLabel(
    workspaceConfig?.store_raw_body ?? null,
    workspaceConfig?.raw_body_retention_days ?? null
  );

  // 3. Plan Check (Pro/Team only)
  const { isPro } = await checkProStatus(workspaceId);
  if (!isPro) {
    return NextResponse.json(
      { error: "Export is available on Pro and Team plans only." },
      { status: 403 }
    );
  }

  const nowIso = new Date().toISOString();
  const fileDate = nowIso.split('T')[0];
  const encoder = new TextEncoder();
  const headerRow = [
    "Report ID",
    "Date (UTC)",
    "Signature Status",
    "Plan",
    "Provider",
    "Status Code",
    "Payload Hash",
    "Raw Body Expires At",
    "Raw Body Present",
    "Retention Policy",
  ].join(",");

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`${headerRow}\n`));

      let offset = 0;

      while (true) {
        // Query by workspace_id instead of user_id
        const { data: certificates, error } = await supabase
          .from("certificates")
          .select(
            [
              'report_id',
              'created_at',
              'signature_status',
              'plan_tier',
              'provider',
              'status_code',
              'raw_body_sha256',
              'provider_event_id',
              'hash',
              'expires_at',
            ].join(',')
          )
          .eq('workspace_id', workspaceId)
          .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
          .order("created_at", { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);

        if (error) {
          controller.error(error);
          return;
        }

        if (!certificates || (certificates as any[]).length === 0) {
          break;
        }

        const providerEventIds = Array.from(
          new Set(
            (certificates as any[])
              .map((cert) => cert.provider_event_id)
              .filter((value) => typeof value === 'string' && value.length > 0)
          )
        );
        const rawHashes = Array.from(
          new Set(
            (certificates as any[])
              .map((cert) => cert.raw_body_sha256)
              .filter((value) => typeof value === 'string' && value.length > 0)
          )
        );

        const ingestedByProvider = new Map<string, { raw_body_expires_at: string | null }>();
        const ingestedByHash = new Map<string, { raw_body_expires_at: string | null }>();

        if (providerEventIds.length) {
          const { data: eventsByProvider, error: providerError } = await supabase
            .from('ingested_events')
            .select('provider_event_id, raw_body_expires_at')
            .eq('workspace_id', workspaceId)
            .in('provider_event_id', providerEventIds);

          if (providerError) {
            controller.error(providerError);
            return;
          }

          for (const event of (eventsByProvider || [])) {
            if (event.provider_event_id && !ingestedByProvider.has(event.provider_event_id)) {
              ingestedByProvider.set(event.provider_event_id, {
                raw_body_expires_at: event.raw_body_expires_at ?? null,
              });
            }
          }
        }

        if (rawHashes.length) {
          const { data: eventsByHash, error: hashError } = await supabase
            .from('ingested_events')
            .select('raw_body_sha256, raw_body_expires_at, received_at')
            .eq('workspace_id', workspaceId)
            .in('raw_body_sha256', rawHashes)
            .order('received_at', { ascending: false });

          if (hashError) {
            controller.error(hashError);
            return;
          }

          for (const event of (eventsByHash || [])) {
            if (event.raw_body_sha256 && !ingestedByHash.has(event.raw_body_sha256)) {
              ingestedByHash.set(event.raw_body_sha256, {
                raw_body_expires_at: event.raw_body_expires_at ?? null,
              });
            }
          }
        }

        for (const cert of (certificates as any[])) {
          const payloadHash = cert.raw_body_sha256 || cert.hash || '';
          const signatureStatus = cert.signature_status || 'not_verified';
          const planTier = cert.plan_tier || 'free';
          const provider = cert.provider || 'unknown';
          const statusCode = typeof cert.status_code === 'number' ? cert.status_code : '';
          const ingestedByEventId = cert.provider_event_id
            ? ingestedByProvider.get(cert.provider_event_id)
            : undefined;
          const ingestedByRawHash = cert.raw_body_sha256
            ? ingestedByHash.get(cert.raw_body_sha256)
            : undefined;
          const ingested = ingestedByEventId || ingestedByRawHash || null;
          const rawBodyExpiresAt = ingested?.raw_body_expires_at
            ? new Date(ingested.raw_body_expires_at).toISOString()
            : '';
          const rawBodyPresent = rawBodyExpiresAt ? 'true' : 'false';

          const row = [
            csvEscape(cert.report_id),
            csvEscape(new Date(cert.created_at).toISOString()),
            csvEscape(signatureStatus),
            csvEscape(planTier),
            csvEscape(provider),
            csvEscape(statusCode),
            csvEscape(payloadHash),
            csvEscape(rawBodyExpiresAt),
            csvEscape(rawBodyPresent),
            csvEscape(retentionLabel),
          ].join(',');

          controller.enqueue(encoder.encode(`${row}\n`));
        }

        if (certificates.length < PAGE_SIZE) {
          break;
        }

        offset += PAGE_SIZE;
      }

      controller.close();
    }
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lanceiq_export_${fileDate}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
