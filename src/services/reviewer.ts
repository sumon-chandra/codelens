import { WebhookPayload, GeminiReviewResponse, GeminiComment } from '../types/index.js';
import { getPRDiff } from './github.js';
import { reviewDiff } from './openrouter.js';
import { parseUnifiedDiff } from '../utils/diffParser.js';
import { defaultCustomRules } from '../config/rules.js';

export interface ReviewExecutionResult {
  skipped: boolean;
  reason?: string;
  summary?: string;
  comments: GeminiComment[];
  ignoredFiles: string[];
}

/**
 * Orchestrates the AI Code Review using OpenRouter:
 * 1. Fetches unified diff from GitHub.
 * 2. Parses diff hunks and filters out lockfiles, binaries, and minified bundles.
 * 3. Injects custom rules and sends diff to OpenRouter for structured JSON analysis.
 * 4. Filters out any hallucinated lines not present in the actual diff hunks (prevents GitHub 422 errors).
 *
 * @param payload GitHub webhook pull_request payload
 */
export async function runReview(payload: WebhookPayload): Promise<ReviewExecutionResult> {
  const owner = payload.repository.owner.login;
  const repo = payload.repository.name;
  const pullNumber = payload.pull_request.number;
  const headSha = payload.pull_request.head.sha;

  console.log(`\n🤖 [AI Reviewer] Starting OpenRouter review for ${owner}/${repo}#${pullNumber} (Commit: ${headSha.slice(0, 7)})...`);

  // 1. Fetch unified diff from GitHub
  const rawDiff = await getPRDiff(owner, repo, pullNumber);

  // 2. Parse diff and filter non-code / lockfiles
  const { files, reviewableDiff, ignoredFiles } = parseUnifiedDiff(rawDiff);

  if (ignoredFiles.length > 0) {
    console.log(`[AI Reviewer] Filtered out ${ignoredFiles.length} non-code/lock files:`, ignoredFiles);
  }

  // Handle edge case: No reviewable code files modified
  if (!reviewableDiff.trim()) {
    console.log('[AI Reviewer] No reviewable code modifications found in diff. Skipping AI review.');
    return {
      skipped: true,
      reason: 'No reviewable code files touched (only lockfiles, assets, or deletions).',
      comments: [],
      ignoredFiles,
    };
  }

  // 3. Send diff + custom rules to OpenRouter
  console.log('[AI Reviewer] Sending reviewable diff to OpenRouter API...');
  const startTime = Date.now();
  const aiResponse: GeminiReviewResponse = await reviewDiff(reviewableDiff, defaultCustomRules);
  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`[AI Reviewer] OpenRouter analysis completed in ${durationSec}s.`);
  console.log(`[AI Reviewer] Summary: "${aiResponse.summary}"`);
  console.log(`[AI Reviewer] Raw comments returned: ${aiResponse.comments.length}`);

  // 4. Validate comments against actual diff hunks (GitHub 422 Prevention)
  // Map files by relative path for quick lookup of valid line numbers
  const fileHunksMap = new Map<string, Set<number>>();
  for (const f of files) {
    fileHunksMap.set(f.filePath, f.validNewLines);
  }

  const validComments: GeminiComment[] = [];
  const rejectedComments: GeminiComment[] = [];

  for (const comment of aiResponse.comments) {
    const validLines = fileHunksMap.get(comment.path);

    if (!validLines) {
      console.warn(`[AI Reviewer] Dropping comment on file not in diff: "${comment.path}"`);
      rejectedComments.push(comment);
      continue;
    }

    if (!validLines.has(comment.line)) {
      // Find nearest valid line in hunk or warn
      console.warn(`[AI Reviewer] Line ${comment.line} in "${comment.path}" is not in an added/modified diff hunk. Dropping to prevent GitHub 422.`);
      rejectedComments.push(comment);
      continue;
    }

    validComments.push(comment);
  }

  console.log(`[AI Reviewer] Validated ${validComments.length} comments (rejected ${rejectedComments.length} out-of-hunk lines).`);

  // Log breakdown
  for (const [idx, c] of validComments.entries()) {
    console.log(`  [#${idx + 1}] [${c.severity.toUpperCase()}] ${c.path}:${c.line} -> ${c.body.slice(0, 70)}...`);
  }

  return {
    skipped: false,
    summary: aiResponse.summary,
    comments: validComments,
    ignoredFiles,
  };
}
