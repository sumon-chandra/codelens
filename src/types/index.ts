/**
 * Shared Type Definitions for Codelens AI Code Review Bot
 */

export type CommentSeverity = 'bug' | 'security' | 'style' | 'custom';

export interface WebhookPayload {
  zen?: string;
  action: string;
  number: number;
  pull_request: {
    number: number;
    title: string;
    body: string | null;
    state: string;
    head: {
      ref: string;
      sha: string;
    };
    base: {
      ref: string;
    };
  };
  repository: {
    name: string;
    full_name: string;
    owner: {
      login: string;
    };
  };
  sender: {
    login: string;
  };
  installation?: {
    id: number;
  };
  after?: string;
}

export interface ReviewComment {
  path: string;
  line: number;
  body: string;
}

export interface PRDiffResult {
  owner: string;
  repo: string;
  pullNumber: number;
  diff: string;
  linesCount: number;
  filesCount: number;
}

export interface GeminiComment {
  path: string;
  line: number;
  body: string;
  severity: CommentSeverity;
}

export interface GeminiReviewResponse {
  summary: string;
  comments: GeminiComment[];
}

export interface ParsedDiffFile {
  filePath: string;
  isIgnored: boolean;
  validNewLines: Set<number>;
  diffContent: string;
}

export interface DiffAnalysisResult {
  files: ParsedDiffFile[];
  reviewableDiff: string;
  ignoredFiles: string[];
}
