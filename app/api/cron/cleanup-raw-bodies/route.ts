import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return (m?.[1]?.trim() ?? "") === secret;
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

  return NextResponse.json({ cleaned: data?.length ?? 0 }, { status: 200 });
}

