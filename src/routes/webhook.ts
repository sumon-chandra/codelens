import { Router, Request, Response } from 'express';

const webhookRouter = Router();

/**
 * POST /webhook
 * Handles incoming GitHub webhook payloads.
 * Logs event metadata and body so the developer can confirm the pipeline works.
 */
webhookRouter.post('/', (req: Request, res: Response) => {
  const githubEvent = req.headers['x-github-event'] as string | undefined;
  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  const delivery = req.headers['x-github-delivery'] as string | undefined;

  console.log('\n================== [INCOMING GITHUB WEBHOOK] ==================');
  console.log(`[Webhook] Event: ${githubEvent ?? 'unknown'}`);
  console.log(`[Webhook] Delivery ID: ${delivery ?? 'unknown'}`);
  console.log(`[Webhook] Signature: ${signature ? `${signature.slice(0, 16)}...` : 'none'}`);

  let payload: Record<string, any> = {};

  try {
    if (Buffer.isBuffer(req.body)) {
      payload = JSON.parse(req.body.toString('utf-8'));
    } else if (typeof req.body === 'string') {
      payload = JSON.parse(req.body);
    } else if (req.body && typeof req.body === 'object') {
      payload = req.body;
    }
  } catch (err) {
    console.warn('[Webhook] Warning: Could not parse request body as JSON:', err);
  }

  // Handle GitHub initial "ping" event (sent when webhook is first created or tested in GitHub UI)
  if (githubEvent === 'ping') {
    console.log('[Webhook] GitHub ping event received! Webhook configuration is active.');
    console.log(`[Webhook] Zen: "${payload?.zen ?? 'No zen quote'}"`);
    console.log(`[Webhook] Repo: "${payload?.repository?.full_name ?? 'unknown'}"`);
    res.status(200).json({
      received: true,
      event: 'ping',
      message: 'GitHub webhook ping received successfully!',
      timestamp: new Date().toISOString(),
    });
    console.log('===============================================================\n');
    return;
  }

  // Handle pull_request events
  if (githubEvent === 'pull_request') {
    const action = payload?.action;
    const prNumber = payload?.pull_request?.number ?? payload?.number;
    const repoName = payload?.repository?.full_name;
    const sender = payload?.sender?.login;
    const title = payload?.pull_request?.title;
    const headBranch = payload?.pull_request?.head?.ref;
    const baseBranch = payload?.pull_request?.base?.ref;

    console.log(`[Webhook] PR Event: action="${action}" | PR #${prNumber} | Repo="${repoName}"`);
    console.log(`[Webhook] PR Title: "${title}" | Author: @${sender}`);
    console.log(`[Webhook] Branches: ${baseBranch} <- ${headBranch}`);
  } else {
    console.log(`[Webhook] Unhandled event type: "${githubEvent}", action: "${payload?.action}"`);
  }

  console.log('===============================================================\n');

  // Immediately respond with 200 OK so GitHub knows the webhook was delivered
  res.status(200).json({
    received: true,
    event: githubEvent ?? 'unknown',
    action: payload?.action ?? null,
    timestamp: new Date().toISOString(),
  });
});

export default webhookRouter;
