import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyWebhookSignature } from '@/lib/dodo';
import { logAuditAction, AUDIT_ACTIONS } from '@/utils/audit';

// Use Service Role for admin updates
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-dodo-signature') || ''; // Adjust header name if different

    if (!verifyWebhookSignature(rawBody, signature)) {
      console.error('Invalid Dodo Webhook Signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const event = JSON.parse(rawBody);
    const { type, data } = event;

    console.log(`Received Dodo Event: ${type}`, data.subscription_id);

    // Extract Metadata (workspace_id is critical)
    // Note: Dodo might nest metadata in `data.metadata` or similar
    const workspaceId = await resolveWorkspaceId(data);

    if (!workspaceId && type === 'subscription.created') {
      throw new Error('Missing workspace_id in metadata');
    }
    
    // We need to map Dodo IDs to our DB
    // Common fields: data.subscription_id, data.customer_id, data.status
    
    if (type === 'subscription.created') {
      if (!workspaceId) {
        throw new Error('Missing workspace_id in metadata');
      }
      const resolvedWorkspaceId = workspaceId;
      await supabase.from('subscriptions').upsert({
        workspace_id: resolvedWorkspaceId,
        dodo_subscription_id: data.subscription_id,
        customer_id: data.customer_id,
        billing_email: data.customer?.email,
        plan_id: data.product_id,
        status: normalizeSubscriptionStatus(data.status) ?? 'active',
        current_period_end: toIsoDate(data.current_period_end),
        cancel_at_period_end: Boolean(data.cancel_at_period_end),
        plan_source: 'dodo'
      });

      // Update Workspace
      await supabase.from('workspaces')
        .update({ 
            plan: 'pro',
            subscription_status: normalizeWorkspaceStatus(data.status) ?? 'active',
            subscription_current_period_end: toIsoDate(data.current_period_end),
            billing_customer_id: data.customer_id
        })
        .eq('id', resolvedWorkspaceId);

      await logAuditAction({
        workspaceId: resolvedWorkspaceId,
        action: AUDIT_ACTIONS.PLAN_CHANGED,
        targetResource: 'subscriptions',
        details: {
          subscription_id: data.subscription_id,
          status: normalizeWorkspaceStatus(data.status) ?? 'active',
          plan: 'pro',
          current_period_end: toIsoDate(data.current_period_end),
        },
      });

    } else if (type === 'subscription.updated') {
       // Find workspace by subscription_id
       const { data: sub } = await supabase
         .from('subscriptions')
         .select('workspace_id')
         .eq('dodo_subscription_id', data.subscription_id)
         .single();
         
       if (sub) {
         const subscriptionStatus = normalizeSubscriptionStatus(data.status) ?? 'active';
         const periodEndIso = toIsoDate(data.current_period_end);
         const cancelAtPeriodEnd = Boolean(data.cancel_at_period_end);

         await supabase.from('subscriptions').update({
           status: subscriptionStatus,
           current_period_end: periodEndIso,
           cancel_at_period_end: cancelAtPeriodEnd
         }).eq('dodo_subscription_id', data.subscription_id);

         // Sync Workspace Status
         let workspaceStatus = normalizeWorkspaceStatus(data.status) ?? 'active';
         const isWithinPeriod = isFutureIso(periodEndIso);
         const plan = shouldBePro(workspaceStatus, isWithinPeriod) ? 'pro' : 'free';
         if (plan === 'free') {
           workspaceStatus = 'free';
         }

         await supabase.from('workspaces').update({ 
           subscription_status: workspaceStatus,
           subscription_current_period_end: periodEndIso,
           plan
         }).eq('id', sub.workspace_id);

         await logAuditAction({
           workspaceId: sub.workspace_id,
           action: AUDIT_ACTIONS.PLAN_CHANGED,
           targetResource: 'subscriptions',
           details: {
             subscription_id: data.subscription_id,
             status: workspaceStatus,
             plan,
             current_period_end: periodEndIso,
           },
         });
       } else if (workspaceId) {
         // If we don't have a subscription record yet, create it from update payload.
         const subscriptionStatus = normalizeSubscriptionStatus(data.status) ?? 'active';
         const periodEndIso = toIsoDate(data.current_period_end);
         const cancelAtPeriodEnd = Boolean(data.cancel_at_period_end);

         await supabase.from('subscriptions').upsert({
           workspace_id: workspaceId,
           dodo_subscription_id: data.subscription_id,
           customer_id: data.customer_id,
           billing_email: data.customer?.email,
           plan_id: data.product_id,
           status: subscriptionStatus,
           current_period_end: periodEndIso,
           cancel_at_period_end: cancelAtPeriodEnd,
           plan_source: 'dodo'
         });

         let workspaceStatus = normalizeWorkspaceStatus(data.status) ?? 'active';
         const isWithinPeriod = isFutureIso(periodEndIso);
         const plan = shouldBePro(workspaceStatus, isWithinPeriod) ? 'pro' : 'free';
         if (plan === 'free') {
           workspaceStatus = 'free';
         }

         await supabase.from('workspaces').update({ 
           subscription_status: workspaceStatus,
           subscription_current_period_end: periodEndIso,
           plan
         }).eq('id', workspaceId);

         await logAuditAction({
           workspaceId,
           action: AUDIT_ACTIONS.PLAN_CHANGED,
           targetResource: 'subscriptions',
           details: {
             subscription_id: data.subscription_id,
             status: workspaceStatus,
             plan,
             current_period_end: periodEndIso,
           },
         });
       }

    } else if (type === 'payment.failed') {
       const { data: sub } = await supabase
         .from('subscriptions')
         .select('workspace_id')
         .eq('dodo_subscription_id', data.subscription_id)
         .single();
         
       if (sub) {
          await supabase.from('subscriptions').update({ status: 'past_due' }).eq('dodo_subscription_id', data.subscription_id);
          await supabase.from('workspaces').update({ subscription_status: 'past_due' }).eq('id', sub.workspace_id);
          // Plan stays 'pro' (Grace Period)

          await logAuditAction({
            workspaceId: sub.workspace_id,
            action: AUDIT_ACTIONS.PLAN_CHANGED,
            targetResource: 'subscriptions',
            details: {
              subscription_id: data.subscription_id,
              status: 'past_due',
              plan: 'pro',
            },
          });
       }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('Webhook Handler Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

function normalizeSubscriptionStatus(status: unknown): 'active' | 'past_due' | 'canceled' | 'on_hold' | 'paused' | 'free' | null {
  if (typeof status !== 'string') return null;
  const normalized = status.toLowerCase();
  if (['active', 'past_due', 'canceled', 'on_hold', 'paused', 'free'].includes(normalized)) {
    return normalized as 'active' | 'past_due' | 'canceled' | 'on_hold' | 'paused' | 'free';
  }
  return null;
}

function normalizeWorkspaceStatus(status: unknown): 'active' | 'past_due' | 'canceled' | 'free' | null {
  if (typeof status !== 'string') return null;
  const normalized = status.toLowerCase();
  if (normalized === 'on_hold' || normalized === 'paused') return 'past_due';
  if (['active', 'past_due', 'canceled', 'free'].includes(normalized)) {
    return normalized as 'active' | 'past_due' | 'canceled' | 'free';
  }
  return null;
}

function toIsoDate(epochSeconds: unknown): string | null {
  if (typeof epochSeconds !== 'number') return null;
  return new Date(epochSeconds * 1000).toISOString();
}

function isFutureIso(iso: string | null): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() > Date.now();
}

function shouldBePro(status: string, isWithinPeriod: boolean): boolean {
  if (status === 'active') return true;
  if (status === 'past_due') return isWithinPeriod;
  if (isWithinPeriod) return true;
  return false;
}

async function resolveWorkspaceId(data: Record<string, unknown>): Promise<string | null> {
  const metadata = (data as { metadata?: { workspace_id?: string } }).metadata;
  const metadataId = metadata?.workspace_id;
  if (metadataId) return metadataId;

  const subscriptionId = (data as { subscription_id?: string }).subscription_id;
  if (subscriptionId) {
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('workspace_id')
      .eq('dodo_subscription_id', subscriptionId)
      .single();
    if (sub?.workspace_id) return sub.workspace_id;
  }

  const customerId = (data as { customer_id?: string }).customer_id;
  if (customerId) {
    const { data: ws } = await supabase
      .from('workspaces')
      .select('id')
      .eq('billing_customer_id', customerId)
      .single();
    if (ws?.id) return ws.id;
  }

  return null;
}
