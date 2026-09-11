import 'dotenv/config';
import crypto from 'crypto';
import { getPRDiffWithMeta } from '../src/services/github.js';

/**
 * CLI tool to test Phase 2 against your real GitHub Pull Request.
 * 
 * Usage:
 *   bun run scripts/test-real-pr.ts <owner> <repo> <pull_number>
 * 
 * Example:
 *   bun run scripts/test-real-pr.ts octocat Hello-World 1
 */
async function main() {
  const args = process.argv.slice(2);
  let owner = args[0];
  let repo = args[1];
  let prNumber = parseInt(args[2], 10);

  if (!owner || !repo || isNaN(prNumber)) {
    console.log('💡 Tip: You can pass your repo details as arguments:');
    console.log('   bun run scripts/test-real-pr.ts <owner> <repo> <pr_number>\n');
    console.log('Example: bun run scripts/test-real-pr.ts sumon-chandra Codelens 1\n');
    console.log('Please provide owner, repo, and PR number.');
    process.exit(1);
  }

  console.log(`🔍 Testing GitHub API diff fetching for: ${owner}/${repo}#${prNumber}...`);

  try {
    // 1. Direct GitHub REST API Test
    console.log('\n[1/2] Fetching diff via Octokit REST API...');
    const result = await getPRDiffWithMeta(owner, repo, prNumber);
    console.log(`✅ Successfully retrieved diff from GitHub!`);
    console.log(`   - Files changed: ${result.filesCount}`);
    console.log(`   - Total lines:   ${result.linesCount}`);
    console.log(`   - Total chars:   ${result.diff.length}`);

    console.log('\n--- Diff Preview (First 30 lines) ---');
    const previewLines = result.diff.split('\n').slice(0, 30).join('\n');
    console.log(previewLines);
    console.log('-------------------------------------\n');

    // 2. Simulated Webhook Pipeline to Local Server (if running)
    const port = process.env.PORT ?? 3000;
    const webhookUrl = `http://localhost:${port}/webhook`;
    const secret = process.env.GITHUB_WEBHOOK_SECRET;

    if (!secret) {
      console.warn('⚠️ GITHUB_WEBHOOK_SECRET missing in .env, skipping local webhook dispatch test.');
      return;
    }

    console.log(`[2/2] Sending signed webhook to local server at ${webhookUrl}...`);
    const mockPayload = {
      action: 'synchronize',
      number: prNumber,
      pull_request: {
        number: prNumber,
        title: `Test PR #${prNumber}`,
        body: 'Testing Codelens webhook receiver',
        state: 'open',
        head: {
          ref: 'test-branch',
          sha: 'dummy-sha',
        },
        base: {
          ref: 'main',
        },
      },
      repository: {
        name: repo,
        full_name: `${owner}/${repo}`,
        owner: {
          login: owner,
        },
      },
      sender: {
        login: owner,
      },
    };

    const payloadString = JSON.stringify(mockPayload);
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payloadString);
    const signature = `sha256=${hmac.digest('hex')}`;

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-github-event': 'pull_request',
        'x-github-delivery': crypto.randomUUID(),
        'x-hub-signature-256': signature,
      },
      body: payloadString,
    });

    const responseBody = await res.json();
    console.log(`✅ Local Server Response (${res.status} ${res.statusText}):`, responseBody);
    console.log('\n🎉 Real PR test completed successfully! Check your server console to see the diff inspection logs.');
  } catch (err: any) {
    if (err.code === 'ECONNREFUSED') {
      console.log('ℹ️ Direct GitHub fetch succeeded, but local server was not running at http://localhost:3000.');
      console.log('   Run "bun run dev" in another terminal if you want to test the full webhook server pipe.');
    } else {
      console.error('❌ Error during real PR test:', err.message || err);
    }
  }
}

main();
