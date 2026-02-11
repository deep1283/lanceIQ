import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const token = m?.[1]?.trim() ?? "";

  if (token.length !== secret.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(secret));
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const nowIso = new Date().toISOString();

  // Privacy-first cleanup: retain event record + hashes, remove raw body when expired.
  const { data, error } = await supabase
    .from("ingested_events")
    .update({ raw_body: null, raw_body_expires_at: null })
    .not("raw_body", "is", null)
    .not("raw_body_expires_at", "is", null)
    .lte("raw_body_expires_at", nowIso)
    .select("id");

  if (error) {
    console.error("Raw body cleanup failed:", error);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }

  let auditCleaned = 0;
  const { data: auditData, error: auditError } = await supabase.rpc("cleanup_expired_audit_logs");
  if (auditError) {
    console.error("Audit log cleanup failed:", auditError);
  } else if (typeof auditData === "number") {
    auditCleaned = auditData;
  }

  let certsCleaned = 0;
  const { data: certData, error: certError } = await supabase.rpc("cleanup_expired_certificates");
  if (certError) {
    console.error("Certificate cleanup failed:", certError);
  } else if (typeof certData === "number") {
    certsCleaned = certData;
  }

  return NextResponse.json(
    { cleaned_raw_bodies: data?.length ?? 0, cleaned_audit_logs: auditCleaned, cleaned_certificates: certsCleaned },
    { status: 200 }
  );
}
