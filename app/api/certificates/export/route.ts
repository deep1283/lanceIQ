import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { checkProStatus } from "@/app/actions/subscription";

const PAGE_SIZE = 1000;

function csvEscape(value: string | number | null | undefined) {
  if (value === null || value === undefined) return '""';
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
}

export async function GET(_request: NextRequest) {
  const supabase = await createClient();

  // 1. Auth Check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Plan Check (Pro/Team only)
  const { isPro } = await checkProStatus();
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
  ].join(",");

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`${headerRow}\n`));

      let offset = 0;

      while (true) {
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
              'hash',
              'expires_at',
            ].join(',')
          )
          .eq('user_id', user.id)
          .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
          .order("created_at", { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);

        if (error) {
          controller.error(error);
          return;
        }

        if (!certificates || certificates.length === 0) {
          break;
        }

        for (const cert of certificates) {
          const payloadHash = cert.raw_body_sha256 || cert.hash || '';
          const signatureStatus = cert.signature_status || 'not_verified';
          const planTier = cert.plan_tier || 'free';
          const provider = cert.provider || 'unknown';
          const statusCode = typeof cert.status_code === 'number' ? cert.status_code : '';

          const row = [
            csvEscape(cert.report_id),
            csvEscape(new Date(cert.created_at).toISOString()),
            csvEscape(signatureStatus),
            csvEscape(planTier),
            csvEscape(provider),
            csvEscape(statusCode),
            csvEscape(payloadHash),
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
