import 'dotenv/config';
import crypto from 'crypto';

/**
 * Local Webhook Test Simulation
 * Run with: bun run scripts/test-webhook.ts
 *
 * Sends a sample GitHub pull_request payload to your local server
 * to verify that the Express pipe and webhook handler are functioning properly.
 */
async function sendTestWebhook() {
  const port = process.env.PORT ?? 3000;
  const url = `http://localhost:${port}/webhook`;
  const secret = process.env.GITHUB_WEBHOOK_SECRET ?? 'test-secret';

  const mockPayload = {
    action: 'opened',
    number: 1,
    pull_request: {
      number: 1,
      title: 'feat: add user authentication module',
      body: 'Implements JWT-based auth flow',
      state: 'open',
      head: {
        ref: 'feature/auth',
        sha: '6dcb09b5b57875f334f61aebed695e2e4193db5e',
      },
      base: {
        ref: 'main',
      },
    },
    repository: {
      name: 'codelens-test',
      full_name: 'test-user/codelens-test',
      owner: {
        login: 'test-user',
      },
    },
    sender: {
      login: 'test-user',
    },
  };

  const payloadString = JSON.stringify(mockPayload);

  // Compute HMAC signature for when signature verification is activated
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payloadString);
  const signature = `sha256=${hmac.digest('hex')}`;

  console.log(`📡 Sending test webhook POST to ${url}...`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-github-event': 'pull_request',
        'x-github-delivery': crypto.randomUUID(),
        'x-hub-signature-256': signature,
      },
      body: payloadString,
    });

    const responseData = await response.json();
    console.log(`✅ Status: ${response.status} ${response.statusText}`);
    console.log('📦 Response:', responseData);
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED') {
      console.error(`❌ Connection refused at ${url}. Make sure your server is running ('bun run dev').`);
    } else {
      console.error('❌ Error sending test webhook:', error.message);
    }
  }
}

sendTestWebhook();
