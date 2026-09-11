import {
  WebhookPayload,
  GeminiReviewResponse,
  GeminiComment,
  ReviewComment,
} from "../types/index.js";
import { getPRDiff, getPRDetails, postReviewComments, getExistingReviewComments } from "./github.js";
import { reviewDiff } from "./openrouter.js";
import { parseUnifiedDiff } from "../utils/diffParser.js";
import { defaultCustomRules } from "../config/rules.js";

export interface ReviewExecutionResult {
  skipped: boolean;
  reason?: string;
  summary?: string;
  comments: GeminiComment[];
  ignoredFiles: string[];
  reviewPosted: boolean;
}

/**
 * Formats an inline review comment with a markdown badge and source indicator.
 */
function formatCommentBody(comment: GeminiComment): string {
  const badges: Record<string, string> = {
    bug: "🐛 **[BUG]**",
    security: "🚨 **[SECURITY]**",
    style: "🎨 **[STYLE]**",
    custom: "📋 **[CUSTOM RULE]**",
  };
  const badge = badges[comment.severity] || "💡 **[SUGGESTION]**";
  return `${badge} *Codelens AI Review*\n\n${comment.body}`;
}

/**
 * Builds the top-level PR review summary markdown.
 */
function buildReviewSummary(
  summary: string,
  commentsCount: number,
  model: string,
): string {
  let text = `## 🔍 Codelens AI Code Review\n\n${summary}\n\n`;
  if (commentsCount === 0) {
    text += `✨ **No critical issues found.** Code changes look clean and well-structured!\n\n`;
  } else {
    text += `⚠️ **Found ${commentsCount} issue${commentsCount === 1 ? "" : "s"}** requiring attention.\n\n`;
  }
  text += `---\n*Automated review powered by [Codelens](https://github.com/sumon-chandra/codelens)*`;
  return text;
}

/**
 * Builds a fallback summary containing all comment feedback in case inline comment line placement fails.
 */
function buildFallbackSummary(
  baseSummary: string,
  comments: GeminiComment[],
): string {
  let text = `${baseSummary}\n\n### Detailed Inline Feedback:\n`;
  for (const c of comments) {
    text += `\n- **\`${c.path}:${c.line}\`** [${c.severity.toUpperCase()}]: ${c.body}`;
  }
  return text;
}

/**
 * Orchestrates the full AI Code Review pipeline (Phases 3 & 4):
 * 1. Fetches unified diff from GitHub.
 * 2. Parses diff hunks and filters out lockfiles, binaries, and minified bundles.
 * 3. Injects custom rules and sends diff to OpenRouter for structured JSON analysis.
 * 4. Filters out any hallucinated lines not present in the actual diff hunks (prevents GitHub 422 errors).
 * 5. Posts inline review comments directly to the GitHub Pull Request!
 *
 * @param payload GitHub webhook pull_request payload
 */
export async function runReview(
  payload: WebhookPayload,
): Promise<ReviewExecutionResult> {
  const owner = payload.repository.owner.login;
  const repo = payload.repository.name;
  const pullNumber = payload.pull_request.number;
  const modelName = process.env.OPENROUTER_MODEL || "nex-agi/nex-n2.5-pro:free";

  // Always resolve the latest head commit SHA from GitHub to match the fetched diff
  let headSha = payload.pull_request?.head?.sha;
  try {
    const prDetails = await getPRDetails(owner, repo, pullNumber);
    if (prDetails.headSha) {
      headSha = prDetails.headSha;
    }
  } catch (err: any) {
    console.warn(
      `[AI Reviewer] Could not fetch latest PR details, falling back to webhook SHA:`,
      err?.message,
    );
  }

  console.log(
    `\n🤖 [AI Reviewer] Starting OpenRouter review for ${owner}/${repo}#${pullNumber} (Commit: ${headSha?.slice(0, 7)})...`,
  );

  // 1. Fetch unified diff from GitHub
  const rawDiff = await getPRDiff(owner, repo, pullNumber);

  // 2. Parse diff and filter non-code / lockfiles
  const { files, reviewableDiff, ignoredFiles } = parseUnifiedDiff(rawDiff);

  if (ignoredFiles.length > 0) {
    console.log(
      `[AI Reviewer] Filtered out ${ignoredFiles.length} non-code/lock files:`,
      ignoredFiles,
    );
  }

  // Handle edge case: No reviewable code files modified
  if (!reviewableDiff.trim()) {
    console.log(
      "[AI Reviewer] No reviewable code modifications found in diff. Skipping AI review.",
    );
    return {
      skipped: true,
      reason:
        "No reviewable code files touched (only lockfiles, assets, or deletions).",
      comments: [],
      ignoredFiles,
      reviewPosted: false,
    };
  }

  // 3. Send diff + custom rules to OpenRouter
  console.log("[AI Reviewer] Sending reviewable diff to OpenRouter API...");
  const startTime = Date.now();
  const aiResponse: GeminiReviewResponse = await reviewDiff(
    reviewableDiff,
    defaultCustomRules,
  );
  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(
    `[AI Reviewer] OpenRouter analysis completed in ${durationSec}s.`,
  );
  console.log(`[AI Reviewer] Summary: "${aiResponse.summary}"`);
  console.log(
    `[AI Reviewer] Raw comments returned: ${aiResponse.comments.length}`,
  );

  // 4. Validate comments against actual diff hunks (GitHub 422 Prevention)
  const fileHunksMap = new Map<string, Set<number>>();
  for (const f of files) {
    fileHunksMap.set(f.filePath, f.validNewLines);
  }

  const validComments: GeminiComment[] = [];
  const rejectedComments: GeminiComment[] = [];

  for (const comment of aiResponse.comments) {
    const validLines = fileHunksMap.get(comment.path);

    if (!validLines) {
      console.warn(
        `[AI Reviewer] Dropping comment on file not in diff: "${comment.path}"`,
      );
      rejectedComments.push(comment);
      continue;
    }

    if (!validLines.has(comment.line)) {
      console.warn(
        `[AI Reviewer] Line ${comment.line} in "${comment.path}" is not in an added/modified diff hunk. Dropping to prevent GitHub 422.`,
      );
      rejectedComments.push(comment);
      continue;
    }

    validComments.push(comment);
  }

  console.log(
    `[AI Reviewer] Validated ${validComments.length} comments (rejected ${rejectedComments.length} out-of-hunk lines).`,
  );

  for (const [idx, c] of validComments.entries()) {
    console.log(
      `  [#${idx + 1}] [${c.severity.toUpperCase()}] ${c.path}:${c.line} -> ${c.body.slice(0, 70)}...`,
    );
  }

  // 5. Deduplication against existing PR review comments (handling synchronize events)
  console.log(`[AI Reviewer] Checking existing PR review comments for deduplication...`);
  const existingComments = await getExistingReviewComments(owner, repo, pullNumber);

  const deduplicatedComments: GeminiComment[] = [];
  let skippedDuplicatesCount = 0;

  for (const comment of validComments) {
    const isDuplicate = existingComments.some((existing) => {
      if (existing.path !== comment.path || existing.line !== comment.line) {
        return false;
      }
      // Consider a duplicate if already generated by Codelens or shares matching body snippet
      return (
        existing.body.includes('Codelens AI Review') ||
        existing.body.includes(comment.body.slice(0, 30))
      );
    });

    if (isDuplicate) {
      console.log(`[AI Reviewer] Skipping duplicate comment on ${comment.path}:${comment.line}`);
      skippedDuplicatesCount++;
    } else {
      deduplicatedComments.push(comment);
    }
  }

  console.log(
    `[AI Reviewer] Deduplication complete: ${deduplicatedComments.length} new comments to post (${skippedDuplicatesCount} duplicates skipped).`,
  );

  // 6. Post comments back to GitHub as an inline Review
  const reviewComments: ReviewComment[] = deduplicatedComments.map((c) => ({
    path: c.path,
    line: c.line,
    body: formatCommentBody(c),
  }));

  // Create contextual summary for re-reviews vs new reviews
  let summaryText = aiResponse.summary;
  if (skippedDuplicatesCount > 0 && deduplicatedComments.length === 0) {
    summaryText += `\n\n🔄 **Re-review Update:** All detected issues on modified files were previously flagged. No new issues were introduced in this push.`;
  }

  const topLevelSummary = buildReviewSummary(
    summaryText,
    deduplicatedComments.length,
    modelName,
  );

  console.log(
    `[AI Reviewer] Submitting review to GitHub: ${owner}/${repo}#${pullNumber} (${reviewComments.length} comments)...`,
  );

  let reviewPosted = false;
  try {
    await postReviewComments(
      owner,
      repo,
      pullNumber,
      headSha,
      reviewComments,
      topLevelSummary,
    );
    reviewPosted = true;
    console.log(
      `[AI Reviewer] ✅ Successfully posted review comments to GitHub PR #${pullNumber}!`,
    );
  } catch (postError: any) {
    console.error(
      `[AI Reviewer] Failed to post inline review comments:`,
      postError?.message || postError,
    );

    // Resilience Fallback: If inline comment line placement fails with 422, post comments in the main body
    if (postError?.status === 422 && reviewComments.length > 0) {
      try {
        console.log(
          "[AI Reviewer] Attempting fallback: posting feedback as single review body...",
        );
        const fallbackSummary = buildFallbackSummary(
          topLevelSummary,
          validComments,
        );
        await postReviewComments(
          owner,
          repo,
          pullNumber,
          headSha,
          [],
          fallbackSummary,
        );
        reviewPosted = true;
        console.log(
          "[AI Reviewer] ✅ Fallback review body posted successfully!",
        );
      } catch (fallbackError: any) {
        console.error(
          "[AI Reviewer] Fallback review posting failed:",
          fallbackError?.message,
        );
      }
    }
  }

  return {
    skipped: false,
    summary: aiResponse.summary,
    comments: validComments,
    ignoredFiles,
    reviewPosted,
  };
}
