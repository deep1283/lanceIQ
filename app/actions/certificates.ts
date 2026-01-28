"use server";

import { createClient } from "@/utils/supabase/server";

export interface CertificateData {
  report_id: string;
  payload: object;
  headers: object;
  payload_hash: string;
  is_pro: boolean;
}

export async function saveCertificate(data: CertificateData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const { error } = await supabase.from("certificates").insert({
    user_id: user.id,
    report_id: data.report_id,
    payload: data.payload,
    headers: data.headers,
    payload_hash: data.payload_hash,
    // Store legacy hash for backward compatibility if needed, using same value
    hash: data.payload_hash,
    is_pro: data.is_pro,
  });

  if (error) {
    console.error("Error saving certificate:", error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function getCertificateForVerification(reportId: string) {
  // Use Service Role Key to bypass RLS for public verification
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
    return { success: false, error: "Configuration error" };
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase
    .from("certificates")
    .select("created_at, payload, headers, payload_hash, is_pro")
    .eq("report_id", reportId)
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data };
}

export async function getCertificates() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { certificates: [], error: "Not authenticated" };
  }

  const { data, error } = await supabase
    .from("certificates")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Error fetching certificates:", error);
    return { certificates: [], error: error.message };
  }

  return { certificates: data || [], error: null };
}
