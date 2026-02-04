import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { encrypt, decrypt } from '../lib/encryption';
import { computeRawBodySha256, verifySignature } from '../lib/signature-verification';

// Load env
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  console.log('🚀 Starting Phase 3 Verification...\n');

  // 1. Test Encryption Helper
  console.log('1. Testing Encryption Lib...');
  const testSecret = 'whsec_test_' + crypto.randomBytes(8).toString('hex');
  
  try {
    const encrypted = encrypt(testSecret);
    const decrypted = decrypt(encrypted);
    
    if (decrypted !== testSecret) {
      throw new Error(`Mismatch! Expected ${testSecret}, got ${decrypted}`);
    }
    console.log('✅ Encryption Round-Trip Success');
    console.log(`   Original: ${testSecret}`);
    console.log(`   Encrypted: ${encrypted.substring(0, 20)}...`);
  } catch (e) {
    console.error('❌ Encryption Failed:', e);
    process.exit(1);
  }

  // 2. Create Workspace with Stored Secret
  console.log('\n2. Creating Test Workspace with Stored Secret...');
  const apiKeyRaw = 'liq_test_' + crypto.randomBytes(16).toString('hex');
  const hmac = crypto.createHmac('sha256', process.env.API_KEY_HASH_SECRET!);
  const hash = hmac.update(apiKeyRaw).digest('hex');
  
  const encryptedSecret = encrypt(testSecret);
  
  // Create workspace directly via DB (simulating the Server Action)
  const { data: workspace, error } = await supabase
    .from('workspaces')
    .insert({
      name: 'Phase 3 Test',
      provider: 'stripe', // Generic usually requires secret, but let's test Stripe logic with stored secret? 
      // Actually stripe logic implies signatures.
      // Let's use 'generic' to avoid strict stripe format requirements if needed, or stick to stripe.
      // If provider is stripe, verification logic uses Stripe signature format.
      // I need to generate a valid Stripe signature using the textSecret.
      api_key_hash: hash,
      api_key_last4: apiKeyRaw.slice(-4),
      encrypted_secret: encryptedSecret,
      secret_last4: testSecret.slice(-4),
      store_raw_body: true
    })
    .select()
    .single();

  if (error) {
    console.error('❌ Failed to create workspace:', error);
    process.exit(1);
  }
  console.log(`✅ Workspace created: ${workspace.id}`);

  // 3. Send Webhook WITHOUT Header
  console.log('\n3. Sending Webhook (No X-LanceIQ-Secret header)...');
  
  const payload = JSON.stringify({ event: 'test.charge.succeeded', amount: 100 });
  const rawBodySha256 = computeRawBodySha256(payload); // Helper just calculates hash, doesn't verify
  
  // Generate STRIPE signature using the stored secret
  // Stripe format: t=timestamp,v1=signature
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const signature = crypto.createHmac('sha256', testSecret).update(signedPayload).digest('hex');
  const stripeSignature = `t=${timestamp},v1=${signature}`;
  
  const res = await fetch(`http://localhost:3000/api/ingest/${apiKeyRaw}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': stripeSignature
      // NO X-LanceIQ-Secret header!
    },
    body: payload
  });

  const body = await res.json();
  console.log(`Response Status: ${res.status}`);
  console.log('Response Body:', body);

  if (res.status === 200 && body.status === 'stored' && body.verified === 'verified') {
    console.log('✅ SUCCESS: Webhook verified using stored secret!');
    
    // Cleanup
    await supabase.from('workspaces').delete().eq('id', workspace.id);
  } else {
    console.error('❌ FAILURE: Webhook not verified as expected.');
    process.exit(1);
  }
}

main().catch(console.error);
