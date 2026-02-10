import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = request.nextUrl.searchParams.get('workspace_id');
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspace_id required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('api_key_rotations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('rotated_at', { ascending: false });

  if (error) {
    console.error('Rotation fetch failed:', error);
    return NextResponse.json({ error: 'Failed to load rotations' }, { status: 500 });
  }

  return NextResponse.json({ rotations: data || [] });
}
