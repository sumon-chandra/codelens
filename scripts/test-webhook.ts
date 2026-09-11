import 'dotenv/config';
import crypto from 'crypto';

/**
 * Phase 2 Webhook Test Suite
 * Run with: bun run test:webhook
 *
 * Validates:
 * 1. Security Check: Rejection of invalid HMAC signatures (401 Unauthorized)
 * 2. Signature Verification: Acceptance of valid HMAC signatures (200 OK)
 * 3. Payload Parsing & Pipeline processing
 */
async function runPhase2Tests() {
  const port = process.env.PORT ?? 3000;
  const url = `http://localhost:${port}/webhook`;
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!secret) {
    console.error('❌ GITHUB_WEBHOOK_SECRET is missing in .env');
    process.exit(1);
  }

  const mockPayload = {
    action: 'opened',
    number: 1,
    pull_request: {
      number: 1,
      title: 'feat: add payment retry logic',
      body: 'Implements retry handling for failed charges',
      state: 'open',
      head: {
        ref: 'feature/payment-retry',
        sha: 'a1b2c3d4e5f678901234567890abcdef12345678',
      },
      base: {
        ref: 'main',
      },
    },
    repository: {
      name: 'codelens-demo',
      full_name: 'test-org/codelens-demo',
      owner: {
        login: 'test-org',
      },
    },
    sender: {
      login: 'developer',
    },
  };

  const payloadString = JSON.stringify(mockPayload);

  console.log('🔒 Running Phase 2: Security & Webhook Tests...\n');

  // Test 1: Tampered / Invalid Signature (Should return 401)
  console.log('--- Test 1: Testing Tampered Signature Rejection ---');
  try {
    const invalidSig = 'sha256=0000000000000000000000000000000000000000000000000000000000000000';
    const res1 = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-github-event': 'pull_request',
        'x-github-delivery': crypto.randomUUID(),
        'x-hub-signature-256': invalidSig,
      },
      body: payloadString,
    });

    if (res1.status === 401) {
      console.log('✅ Test 1 Passed: Server correctly rejected invalid signature with 401 Unauthorized.');
    } else {
      console.warn(`⚠️ Test 1 Warning: Server responded with status ${res1.status}, expected 401.`);
    }
  } catch (err: any) {
    if (err.code === 'ECONNREFUSED') {
      console.error(`❌ Cannot connect to ${url}. Make sure your server is running ('bun run dev').`);
      return;
    }
    console.error('❌ Test 1 Error:', err.message);
  }

  // Test 2: Valid HMAC-SHA256 Signature (Should return 200)
  console.log('\n--- Test 2: Testing Valid HMAC Signature & Payload Parsing ---');
  try {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payloadString);
    const validSig = `sha256=${hmac.digest('hex')}`;

    const res2 = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-github-event': 'pull_request',
        'x-github-delivery': crypto.randomUUID(),
        'x-hub-signature-256': validSig,
      },
      body: payloadString,
    });

    const body = await res2.json();
    if (res2.status === 200) {
      console.log('✅ Test 2 Passed: Server verified HMAC signature and accepted payload (200 OK)!');
      console.log('📦 Server Response:', body);
    } else {
      console.warn(`⚠️ Test 2 Warning: Server responded with status ${res2.status}. Body:`, body);
    }
  } catch (err: any) {
    console.error('❌ Test 2 Error:', err.message);
  }

  console.log('\n🎉 Phase 2 local test run complete!');
}

runPhase2Tests();
