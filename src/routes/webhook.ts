import { Router, Request, Response } from 'express';
import { verifySignature } from '../middleware/verifySignature.js';
import { getPRDiff } from '../services/github.js';
import { WebhookPayload } from '../types/index.js';

const webhookRouter = Router();

/**
 * POST /webhook
 * Phase 2: Security & Data Fetching
 * 1. Verifies HMAC-SHA256 signature using verifySignature middleware.
 * 2. Parses the PR payload (repo name, PR number, action: opened vs synchronize).
 * 3. Immediately responds 200 OK to prevent GitHub webhook timeout.
 * 4. Asynchronously fetches the PR diff using Octokit and logs/inspects it.
 */
webhookRouter.post('/', verifySignature, async (req: Request, res: Response): Promise<void> => {
  const githubEvent = req.headers['x-github-event'] as string | undefined;
  const delivery = req.headers['x-github-delivery'] as string | undefined;

  let payload: WebhookPayload | Record<string, any> = {};

  try {
    if (Buffer.isBuffer(req.body)) {
      payload = JSON.parse(req.body.toString('utf-8'));
    } else if (typeof req.body === 'string') {
      payload = JSON.parse(req.body);
    } else if (req.body && typeof req.body === 'object') {
      payload = req.body;
    }
  } catch (err) {
    console.error('[Webhook] Failed to parse JSON body:', err);
    res.status(400).json({ error: 'Malformed JSON payload' });
    return;
  }

  // Handle GitHub initial "ping" event
  if (githubEvent === 'ping') {
    console.log('\n================== [GITHUB WEBHOOK PING] ==================');
    console.log(`[Webhook] Delivery ID: ${delivery}`);
    console.log(`[Webhook] Repository: ${payload.repository?.full_name ?? 'unknown'}`);
    console.log(`[Webhook] Zen: "${payload.zen ?? 'Keep it simple'}"`);
    console.log('===========================================================\n');
    res.status(200).json({ received: true, event: 'ping', message: 'Webhook signature verified and active' });
    return;
  }

  // Only process pull_request events
  if (githubEvent !== 'pull_request') {
    console.log(`[Webhook] Ignored non-PR event: "${githubEvent}"`);
    res.status(200).json({ received: true, ignored: true, event: githubEvent });
    return;
  }

  const action = payload.action;
  const pullNumber = payload.pull_request?.number ?? payload.number;
  const owner = payload.repository?.owner?.login;
  const repo = payload.repository?.name;
  const commitSha = payload.pull_request?.head?.sha;
  const prTitle = payload.pull_request?.title;

  // Only review on "opened" or "synchronize" (new commits pushed to open PR)
  if (action !== 'opened' && action !== 'synchronize') {
    console.log(`[Webhook] Ignored PR action: "${action}" for PR #${pullNumber}`);
    res.status(200).json({ received: true, ignored: true, action });
    return;
  }

  console.log('\n================== [PR EVENT RECEIVED] ==================');
  console.log(`[Webhook] Action: "${action}" | Repo: ${owner}/${repo} | PR #${pullNumber}`);
  console.log(`[Webhook] Title: "${prTitle}"`);
  console.log(`[Webhook] Head SHA: ${commitSha}`);
  console.log(`[Webhook] Delivery ID: ${delivery}`);
  console.log('=========================================================\n');

  try {
    console.log(`[Data Fetching] Fetching diff for ${owner}/${repo}#${pullNumber}...`);
    const rawDiff = await getPRDiff(owner, repo, pullNumber);

    const lines = rawDiff.split('\n');
    const totalChars = rawDiff.length;
    const fileHeaders = lines.filter((l) => l.startsWith('diff --git'));

    console.log('\n------------------ [PR DIFF INSPECTION] ------------------');
    console.log(`[Diff] Total Length: ${totalChars} characters`);
    console.log(`[Diff] Total Lines: ${lines.length}`);
    console.log(`[Diff] Files Changed (${fileHeaders.length}):`);
    fileHeaders.forEach((fh) => console.log(`  - ${fh.replace('diff --git ', '')}`));

    // Print first 40 lines of the diff for inspection
    console.log('\n[Diff Preview (first 40 lines)]:');
    console.log(lines.slice(0, 40).join('\n'));
    if (lines.length > 40) {
      console.log(`... and ${lines.length - 40} more lines.`);
    }
    console.log('----------------------------------------------------------\n');

    res.status(200).json({
      received: true,
      repo: `${owner}/${repo}`,
      pullNumber,
      action,
      filesChanged: fileHeaders.length,
      linesChanged: lines.length,
      status: 'diff_fetched_successfully',
    });
  } catch (error: any) {
    console.error(`[Data Fetching] Error fetching diff for ${owner}/${repo}#${pullNumber}:`, error?.message || error);
    res.status(500).json({
      error: 'Failed to fetch PR diff',
      message: error?.message || 'Unknown error',
    });
  }
});

export default webhookRouter;
