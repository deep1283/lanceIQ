import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const hashSecret = process.env.API_KEY_HASH_SECRET!;
const baseUrl = 'http://localhost:3000';

const supabase = createClient(supabaseUrl, serviceKey);

async function main() {
  console.log('🚀 Starting Phase 2 E2E Verification...');

  // 1. Setup Workspace
  console.log('\n1. Creating Test Workspace...');
  const keyRaw = 'liq_' + crypto.randomBytes(24).toString('hex');
  const keyHash = crypto.createHmac('sha256', hashSecret).update(keyRaw).digest('hex');
  const secret = 'whsec_test_' + crypto.randomBytes(12).toString('hex');

  const { data: ws, error: wsError } = await supabase
    .from('workspaces')
    .insert({
      name: 'E2E Test Workspace',
      provider: 'stripe',
      api_key_hash: keyHash,
      api_key_last4: keyRaw.slice(-4),
      store_raw_body: true
    })
    .select()
    .single();

  if (wsError) {
    console.error('❌ Failed to create workspace:', wsError);
    process.exit(1);
  }
  console.log(`✅ Workspace created: ${ws.id}`);

  // 2. Prepare Payload & Signature
  console.log('\n2. Generating Signed Webhook...');
  const payload = JSON.stringify({
    id: 'evt_test_e2e',
    object: 'event',
    type: 'payment_intent.succeeded',
    created: Math.floor(Date.now() / 1000)
  });
  
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const signature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  const headerVal = `t=${timestamp},v1=${signature}`;

  // 3. Send Webhook
  console.log(`\n3. Sending Webhook to ${baseUrl}/api/ingest/${keyRaw}...`);
  // Note: We need to pass the secret via header because we verify using BYOS now!
  const res = await fetch(`${baseUrl}/api/ingest/${keyRaw}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Stripe-Signature': headerVal,
      'X-LanceIQ-Secret': secret // BYOS!
    },
    body: payload
  });

  console.log(`Response Status: ${res.status}`);
  const body = await res.json();
  console.log('Response Body:', body);

  if (res.status !== 200 || body.verified !== 'verified') {
    console.error('❌ Webhook failed or not verified!');
    // Don't exit yet, check DB
  } else {
    console.log('✅ Webhook accepted and response says verified.');
  }

  // 4. Verify DB Storage
  console.log('\n4. Checking Database...');
  // Wait a bit? No, ingestion is sync.
  
  const { data: event, error: evError } = await supabase
    .from('ingested_events')
    .select('*')
    .eq('workspace_id', ws.id)
    .single();

  if (evError || !event) {
    console.error('❌ Event not found in DB:', evError);
  } else {
    console.log('found event:', event.id);
    console.log(`- Signature Status: ${event.signature_status} ${event.signature_status === 'verified' ? '✅' : '❌'}`);
    console.log(`- Stored Raw Body: ${event.raw_body ? 'YES (✅)' : 'NO'}`);
    
    if (event.signature_status === 'verified') {
        console.log('\n🎉 SUCCESS: E2E Verification Passed!');
    } else {
        console.log('\n⚠️ FAILURE: Event stored but verification failed.');
    }
  }

  // Cleanup
  console.log('\nCleaning up...');
  await supabase.from('workspaces').delete().eq('id', ws.id);
  console.log('Done.');
}

main().catch(console.error);
