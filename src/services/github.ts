import type { Octokit as OctokitType } from '@octokit/rest';
import { ReviewComment, PRDiffResult } from '../types/index.js';

let octokitInstance: OctokitType | null = null;

/**
 * Returns GitHub API rate limit status.
 */
export async function getRateLimitStatus(): Promise<{ remaining: number; limit: number; resetDate: string }> {
  try {
    const octokit = await getOctokit();
    const res = await octokit.rest.rateLimit.get();
    const core = res.data.resources.core;
    return {
      remaining: core.remaining,
      limit: core.limit,
      resetDate: new Date(core.reset * 1000).toLocaleTimeString(),
    };
  } catch (err: any) {
    return { remaining: -1, limit: -1, resetDate: 'unknown' };
  }
}

/**
 * Returns an authenticated Octokit client instance.
 * Uses dynamic import() to guarantee compatibility across all Node environments,
 * serverless runtimes (Vercel/AWS Lambda), and bundlers without ERR_REQUIRE_ESM.
 */
export async function getOctokit(installationId?: number): Promise<OctokitType> {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_PRIVATE_KEY;

  const { Octokit } = await import('@octokit/rest');

  // 1. If GitHub App credentials and installationId are present, authenticate as GitHub App installation
  if (appId && privateKey && installationId) {
    const { createAppAuth } = await import('@octokit/auth-app');
    return new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId,
        privateKey: privateKey.replace(/\\n/g, '\n'),
        installationId,
      },
    });
  }

  // 2. Otherwise fall back to PAT (GITHUB_TOKEN)
  if (octokitInstance) {
    return octokitInstance;
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('Neither GitHub App credentials (GITHUB_APP_ID + GITHUB_PRIVATE_KEY) nor GITHUB_TOKEN are defined.');
  }

  octokitInstance = new Octokit({
    auth: token,
  });
  return octokitInstance;
}

/**
 * Fetches the unified code diff for a given pull request using GitHub REST API.
 * Uses `Accept: application/vnd.github.v3.diff` header to retrieve the raw diff.
 *
 * @param owner Repository owner / organization
 * @param repo Repository name
 * @param pullNumber Pull request number
 * @param installationId Optional GitHub App installation ID
 * @returns Raw unified diff text
 */
export async function getPRDiff(
  owner: string,
  repo: string,
  pullNumber: number,
  installationId?: number,
): Promise<string> {
  try {
    const octokit = await getOctokit(installationId);
    const response = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
      headers: {
        accept: "application/vnd.github.v3.diff",
      },
    });

    // When the diff Accept header is passed, Octokit returns the raw diff string in response.data
    return response.data as unknown as string;
  } catch (error: any) {
    console.error(
      `[GitHub] Failed to fetch diff for ${owner}/${repo}#${pullNumber}:`,
      error?.message || error,
    );
    throw new Error(
      `GitHub API error fetching diff: ${error?.message || "Unknown error"}`,
    );
  }
}

/**
 * Fetches current Pull Request details, notably the latest head commit SHA.
 */
export async function getPRDetails(
  owner: string,
  repo: string,
  pullNumber: number,
  installationId?: number,
): Promise<{ headSha: string; title: string }> {
  try {
    const octokit = await getOctokit(installationId);
    const response = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    });
    return {
      headSha: response.data.head.sha,
      title: response.data.title,
    };
  } catch (error: any) {
    console.error(`[GitHub] Failed to fetch PR details for ${owner}/${repo}#${pullNumber}:`, error?.message || error);
    throw error;
  }
}

/**
 * Fetches the unified diff and parses metadata (line count, files count).
 *
 * @param owner Repository owner
 * @param repo Repository name
 * @param pullNumber Pull request number
 * @param installationId Optional GitHub App installation ID
 * @returns PRDiffResult object with diff and metadata
 */
export async function getPRDiffWithMeta(
  owner: string,
  repo: string,
  pullNumber: number,
  installationId?: number,
): Promise<PRDiffResult> {
  const diff = await getPRDiff(owner, repo, pullNumber, installationId);
  const lines = diff.split("\n");
  const filesCount = lines.filter((line) =>
    line.startsWith("diff --git "),
  ).length;

  return {
    owner,
    repo,
    pullNumber,
    diff,
    linesCount: lines.length,
    filesCount,
  };
}

/**
 * Retrieves existing review comments on a PR to enable deduplication during synchronize events.
 *
 * @param owner Repository owner
 * @param repo Repository name
 * @param pullNumber Pull request number
 * @param installationId Optional GitHub App installation ID
 */
export async function getExistingReviewComments(
  owner: string,
  repo: string,
  pullNumber: number,
  installationId?: number,
): Promise<Array<{ path: string; line: number | null; body: string }>> {
  try {
    const octokit = await getOctokit(installationId);
    const response = await octokit.rest.pulls.listReviewComments({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
    });

    return response.data.map((comment) => ({
      path: comment.path,
      line: comment.line ?? null,
      body: comment.body,
    }));
  } catch (error: any) {
    console.warn(
      `[GitHub] Could not fetch existing comments for ${owner}/${repo}#${pullNumber}:`,
      error?.message,
    );
    return [];
  }
}

/**
 * Creates and submits a pull request review containing inline comments.
 * Calls `POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews` with `event: "COMMENT"`.
 *
 * @param owner Repository owner
 * @param repo Repository name
 * @param pullNumber Pull request number
 * @param commitId Head commit SHA against which comments are placed
 * @param comments Array of inline review comments
 * @param summary Optional top-level review summary body
 * @param installationId Optional GitHub App installation ID
 */
export async function postReviewComments(
  owner: string,
  repo: string,
  pullNumber: number,
  commitId: string,
  comments: ReviewComment[],
  summary = "Codelens AI Code Review",
  installationId?: number,
): Promise<void> {
  const octokit = await getOctokit(installationId);

  const executeCreateReview = async () => {
    return await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      commit_id: commitId,
      event: "COMMENT",
      body: summary,
      comments: comments.map((c) => ({
        path: c.path,
        line: c.line,
        body: c.body,
      })),
    });
  };

  try {
    await executeCreateReview();
    console.log(
      `[GitHub] Successfully posted review with ${comments.length} comments to ${owner}/${repo}#${pullNumber}`,
    );
  } catch (error: any) {
    const errorMessage = String(error?.message || '').toLowerCase();
    const errorDetails = JSON.stringify(error?.response?.data || '').toLowerCase();
    const isPendingReviewConflict =
      error?.status === 422 &&
      (errorMessage.includes('pending review') || errorDetails.includes('pending review'));

    // Handle "User can only have one pending review per pull request"
    if (isPendingReviewConflict) {
      console.warn(
        `[GitHub] Detected conflicting pending review on ${owner}/${repo}#${pullNumber}. Cleaning up stale pending reviews...`,
      );
      try {
        const reviews = await octokit.rest.pulls.listReviews({
          owner,
          repo,
          pull_number: pullNumber,
        });
        const pendingReviews = reviews.data.filter((r) => r.state === 'PENDING');
        for (const pending of pendingReviews) {
          try {
            await octokit.rest.pulls.deletePendingReview({
              owner,
              repo,
              pull_number: pullNumber,
              review_id: pending.id,
            });
            console.log(`[GitHub] Deleted stale pending review #${pending.id}`);
          } catch (delErr: any) {
            console.warn(`[GitHub] Could not delete pending review #${pending.id}:`, delErr?.message);
          }
        }

        // Retry review creation after cleaning pending reviews
        console.log(`[GitHub] Retrying review creation after cleanup...`);
        await executeCreateReview();
        console.log(
          `[GitHub] Successfully posted review with ${comments.length} comments to ${owner}/${repo}#${pullNumber} on retry`,
        );
        return;
      } catch (retryErr: any) {
        console.error(`[GitHub] Retry failed after pending review cleanup:`, retryErr?.message || retryErr);
        throw retryErr;
      }
    }

    console.error(
      `[GitHub] Error posting review to ${owner}/${repo}#${pullNumber}:`,
      error?.message || error,
    );
    if (error?.status === 422) {
      console.error(
        "[GitHub] HTTP 422 Upstream error details:",
        error?.response?.data,
      );
    }
    throw error;
  }
}
