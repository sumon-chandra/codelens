import type { Octokit as OctokitType } from '@octokit/rest';
import { ReviewComment, PRDiffResult } from '../types/index.js';

let octokitInstance: OctokitType | null = null;

/**
 * Returns an authenticated Octokit client instance.
 * Uses dynamic import() to guarantee compatibility across all Node environments,
 * serverless runtimes (Vercel/AWS Lambda), and bundlers without ERR_REQUIRE_ESM.
 */
export async function getOctokit(): Promise<OctokitType> {
  if (octokitInstance) {
    return octokitInstance;
  }

  const token = process.env.GITHUB_TOKEN;
  console.log("Github Token: ", token)
  if (!token) {
    throw new Error('GITHUB_TOKEN environment variable is not defined.');
  }

  // Dynamic import works across both native ESM and CommonJS runtimes
  const { Octokit } = await import('@octokit/rest');
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
 * @returns Raw unified diff text
 */
export async function getPRDiff(
  owner: string,
  repo: string,
  pullNumber: number
): Promise<string> {
  try {
    const octokit = await getOctokit();
    const response = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
      headers: {
        accept: 'application/vnd.github.v3.diff',
      },
    });

    console.log("Octokit Response : ", response)

    // When the diff Accept header is passed, Octokit returns the raw diff string in response.data
    return response.data as unknown as string;
  } catch (error: any) {
    console.error(`[GitHub] Failed to fetch diff for ${owner}/${repo}#${pullNumber}:`, error?.message || error);
    throw new Error(`GitHub API error fetching diff: ${error?.message || 'Unknown error'}`);
  }
}

/**
 * Fetches the unified diff and parses metadata (line count, files count).
 *
 * @param owner Repository owner
 * @param repo Repository name
 * @param pullNumber Pull request number
 * @returns PRDiffResult object with diff and metadata
 */
export async function getPRDiffWithMeta(
  owner: string,
  repo: string,
  pullNumber: number
): Promise<PRDiffResult> {
  const diff = await getPRDiff(owner, repo, pullNumber);
  const lines = diff.split('\n');
  const filesCount = lines.filter((line) => line.startsWith('diff --git ')).length;

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
 */
export async function getExistingReviewComments(
  owner: string,
  repo: string,
  pullNumber: number
): Promise<Array<{ path: string; line: number | null; body: string }>> {
  try {
    const octokit = await getOctokit();
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
    console.warn(`[GitHub] Could not fetch existing comments for ${owner}/${repo}#${pullNumber}:`, error?.message);
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
 */
export async function postReviewComments(
  owner: string,
  repo: string,
  pullNumber: number,
  commitId: string,
  comments: ReviewComment[],
  summary = 'Codelens AI Code Review'
): Promise<void> {
  try {
    const octokit = await getOctokit();
    await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      commit_id: commitId,
      event: 'COMMENT',
      body: summary,
      comments: comments.map((c) => ({
        path: c.path,
        line: c.line,
        body: c.body,
      })),
    });

    console.log(`[GitHub] Successfully posted review with ${comments.length} comments to ${owner}/${repo}#${pullNumber}`);
  } catch (error: any) {
    console.error(`[GitHub] Error posting review to ${owner}/${repo}#${pullNumber}:`, error?.message || error);
    if (error?.status === 422) {
      console.error('[GitHub] HTTP 422: Comment line must be part of a diff hunk. Upstream error details:', error?.response?.data);
    }
    throw error;
  }
}
