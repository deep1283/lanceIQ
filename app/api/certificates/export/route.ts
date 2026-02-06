import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { checkProStatus } from "@/app/actions/subscription";
import { getPlanLimits } from "@/lib/plan";

function escapeCsv(value: string) {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { plan } = await checkProStatus();
  const limits = getPlanLimits(plan);
  if (!limits.canExport) {
    return NextResponse.json({ error: "Upgrade required to export." }, { status: 403 });
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("certificates")
    .select("report_id, created_at, signature_status, provider, provider_event_id")
    .eq("user_id", user.id)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) {
    console.error("Export fetch failed:", error);
    return NextResponse.json({ error: "Export failed." }, { status: 500 });
  }

  const rows = data || [];
  const header = ["report_id", "created_at", "signature_status", "provider", "provider_event_id"];
  const csvRows = [header.join(",")];

  for (const row of rows) {
    const values = [
      row.report_id ?? "",
      row.created_at ?? "",
      row.signature_status ?? "",
      row.provider ?? "",
      row.provider_event_id ?? "",
    ].map((v) => escapeCsv(String(v)));
    csvRows.push(values.join(","));
  }

  const csv = csvRows.join("\n");
  const filename = `lanceiq-certificates-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
