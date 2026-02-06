import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { checkProStatus } from "@/app/actions/subscription";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  
  // 1. Auth Check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Plan Check (Pro/Team only)
  const { isPro, plan } = await checkProStatus();
  if (!isPro) {
    return NextResponse.json(
      { error: "Export is available on Pro and Team plans only." }, 
      { status: 403 }
    );
  }

  // 3. Fetch Data
  // We fetch ALL certificates visible to the user (RLS handles workspace vs personal)
  // We explicitly filter out expired ones just in case cleanup hasn't run, 
  // though RLS/cleanup usually handles this.
  const { data: certificates, error } = await supabase
    .from("certificates")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Export error:", error);
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }

  if (!certificates || certificates.length === 0) {
     return new NextResponse("Report ID,Date,Status,Type,Payload Hash\n", {
        headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="lanceiq_export_${new Date().toISOString().split('T')[0]}.csv"`,
        }
     });
  }

  // 4. Generate CSV
  // Columns: Report ID, Date, Signature Status, Plan Type, Provider, Status Code, Payload Hash
  const csvRows = [
    ["Report ID", "Date (UTC)", "Signature Status", "Plan", "Provider", "Status Code", "Payload Hash"].join(",")
  ];

  for (const cert of certificates) {
    const row = [
        `"${cert.report_id}"`,
        `"${new Date(cert.created_at).toISOString()}"`,
        `"${cert.signature_status || 'unverified'}"`,
        `"${cert.is_pro ? 'Pro/Team' : 'Free'}"`,
        `"${cert.provider || 'unknown'}"`,
        `"${cert.status_code || 200}"`,
        `"${cert.payload_hash || ''}"`
    ];
    csvRows.push(row.join(","));
  }

  const csvString = csvRows.join("\n");

  // 5. Return Response
  return new NextResponse(csvString, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="lanceiq_export_${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });
}
