'use server';

import { createClient } from '@/utils/supabase/server';

export interface IngestionEvent {
  id: string;
  source_name: string;
  provider: string;
  signature_status: 'verified' | 'failed' | 'not_verified';
  signature_reason: string | null;
  received_at: string;
  raw_body_sha256: string;
}

type IngestionEventRow = {
  id: string;
  signature_status: 'verified' | 'failed' | 'not_verified';
  signature_reason: string | null;
  received_at: string;
  raw_body_sha256: string;
  detected_provider: string | null;
  workspaces: {
    name: string;
    provider: string | null;
  } | {
    name: string;
    provider: string | null;
  }[];
};

export async function getRecentIngestionEvents(limit = 20) {
  const supabase = await createClient();
  
  // We need to join workspaces to get source name
  // ingested_events -> join workspaces
  
  const { data, error } = await supabase
    .from('ingested_events')
    .select(`
      id,
      signature_status,
      signature_reason,
      received_at,
      raw_body_sha256,
      detected_provider,
      workspaces!inner (
        name,
        provider
      )
    `)
    .order('received_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Get History Error:', error);
    return [];
  }

  // Transform for UI
  return (data as IngestionEventRow[]).map((event) => {
    // Handle both object and array forms of the join result
    const ws = Array.isArray(event.workspaces) ? event.workspaces[0] : event.workspaces;
    return {
      id: event.id,
      source_name: ws?.name ?? 'Unknown',
      provider: event.detected_provider || ws?.provider || 'unknown',
      signature_status: event.signature_status,
      signature_reason: event.signature_reason,
      received_at: event.received_at,
      raw_body_sha256: event.raw_body_sha256
    };
  });
}
