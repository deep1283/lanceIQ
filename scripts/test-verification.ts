import { verifyStripeSignature, verifyRazorpaySignature } from '../lib/signature-verification';
import crypto from 'crypto';

// Setup environment for testing
process.env.STRIPE_TIMESTAMP_TOLERANCE_SEC = '300';

async function runTests() {
  console.log('🧪 Starting Verification Library Tests...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, name: string) {
    if (condition) {
      console.log(`✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${name}`);
      failed++;
    }
  }

  // --- Stripe Tests ---
  
  const stripeSecret = 'whsec_test_secret';
  const stripePayload = JSON.stringify({ id: 'evt_123', object: 'event' });
  const now = Math.floor(Date.now() / 1000);
  
  // 1. Valid Stripe Signature
  const validSignedPayload = `${now}.${stripePayload}`;
  const validSignature = crypto.createHmac('sha256', stripeSecret).update(validSignedPayload).digest('hex');
  const validHeader = `t=${now},v1=${validSignature}`;
  
  const result1 = verifyStripeSignature(stripePayload, { 'stripe-signature': validHeader }, stripeSecret, '****');
  assert(result1.status === 'verified', 'Stripe Valid Signature');

  // 2. Expired Timestamp
  const oldTime = now - 600; // 10 mins ago
  const expiredSignedPayload = `${oldTime}.${stripePayload}`;
  const expiredSignature = crypto.createHmac('sha256', stripeSecret).update(expiredSignedPayload).digest('hex');
  const expiredHeader = `t=${oldTime},v1=${expiredSignature}`;
  
  const result2 = verifyStripeSignature(stripePayload, { 'stripe-signature': expiredHeader }, stripeSecret, '****');
  assert(result2.status === 'failed' && result2.reason === 'timestamp_expired', 'Stripe Expired Timestamp');

  // 3. Invalid Secret
  const result3 = verifyStripeSignature(stripePayload, { 'stripe-signature': validHeader }, 'wrong_secret', '****');
  assert(result3.status === 'failed' && result3.reason === 'mismatch', 'Stripe Invalid Secret');

  // --- Razorpay Tests ---
  
  const razorpaySecret = 'rzp_test_secret';
  const razorpayPayload = JSON.stringify({ entity: 'event' });
  const razorpaySignature = crypto.createHmac('sha256', razorpaySecret).update(razorpayPayload).digest('hex');
  
  // 4. Valid Razorpay Signature
  const result4 = verifyRazorpaySignature(
    razorpayPayload, 
    { 'x-razorpay-signature': razorpaySignature }, 
    razorpaySecret, 
    '****'
  );
  assert(result4.status === 'verified', 'Razorpay Valid Signature');
  
  // 5. Razorpay Mismatch
  const result5 = verifyRazorpaySignature(
    razorpayPayload, 
    { 'x-razorpay-signature': 'invalid_sig' }, 
    razorpaySecret, 
    '****'
  );
  assert(result5.status === 'failed' && result5.reason === 'mismatch', 'Razorpay Mismatch');

  console.log(`\n🎉 Tests Completed: ${passed} Passed, ${failed} Failed`);
  
  if (failed > 0) process.exit(1);
}

runTests().catch(console.error);
