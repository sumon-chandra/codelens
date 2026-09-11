import { ParsedDiffFile, DiffAnalysisResult } from '../types/index.js';

// Patterns for files that should not be sent to AI review
const IGNORED_PATTERNS: RegExp[] = [
  // Package manager lockfiles
  /(?:^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lock|bun\.lockb)$/i,
  // Images, assets, binaries
  /\.(png|jpe?g|gif|svg|ico|webp|avif|pdf|woff2?|eot|ttf|otf|mp3|mp4)$/i,
  // Minified bundles and source maps
  /\.(min\.js|min\.css|map)$/i,
  // Compiled directories
  /(?:^|\/)(dist|build|\.next|\.nuxt|\.output|coverage)\//i,
];

/**
 * Checks if a given file path should be ignored from AI code review.
 */
export function isIgnoredFile(filePath: string): boolean {
  return IGNORED_PATTERNS.some((pattern) => pattern.test(filePath));
}

/**
 * Parses unified diff text into individual files and tracks valid commentable line numbers.
 * A commentable line in GitHub's Review Comments API must be an added/modified line (+)
 * in the diff hunk.
 */
export function parseUnifiedDiff(rawDiff: string, maxDiffChars = 100_000): DiffAnalysisResult {
  const files: ParsedDiffFile[] = [];
  const ignoredFiles: string[] = [];

  if (!rawDiff || !rawDiff.trim()) {
    return { files: [], reviewableDiff: '', ignoredFiles: [] };
  }

  // Split unified diff by file boundary: "diff --git a/... b/..."
  const rawFileChunks = rawDiff.split(/^diff --git /m);

  for (const chunk of rawFileChunks) {
    if (!chunk.trim()) continue;

    // Extract target file path (e.g., "a/src/index.ts b/src/index.ts")
    const headerMatch = chunk.match(/^a\/(.*?)\s+b\/(.*?)(?:\r?\n|$)/);
    const filePath = headerMatch ? headerMatch[2] : '';

    if (!filePath) continue;

    if (isIgnoredFile(filePath)) {
      ignoredFiles.push(filePath);
      files.push({
        filePath,
        isIgnored: true,
        validNewLines: new Set<number>(),
        diffContent: '',
      });
      continue;
    }

    const validNewLines = new Set<number>();
    const lines = chunk.split(/\r?\n/);
    let currentNewLine = 0;
    let inHunk = false;

    for (const line of lines) {
      // Look for hunk header: @@ -oldStart,oldLen +newStart,newLen @@
      const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (hunkMatch) {
        currentNewLine = parseInt(hunkMatch[1], 10);
        inHunk = true;
        continue;
      }

      if (!inHunk) continue;

      if (line.startsWith('+') && !line.startsWith('+++')) {
        validNewLines.add(currentNewLine);
        currentNewLine++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        // Deleted line — does not advance new file line counter
      } else {
        // Context line (unchanged)
        currentNewLine++;
      }
    }

    files.push({
      filePath,
      isIgnored: false,
      validNewLines,
      diffContent: `diff --git ${chunk}`,
    });
  }

  // Combine reviewable diff content with token budget truncation if needed
  let combinedDiff = files
    .filter((f) => !f.isIgnored)
    .map((f) => f.diffContent)
    .join('\n');

  if (combinedDiff.length > maxDiffChars) {
    console.warn(`[DiffParser] Diff size (${combinedDiff.length} chars) exceeded limit (${maxDiffChars}). Truncating.`);
    combinedDiff = combinedDiff.slice(0, maxDiffChars) + '\n\n...[diff truncated for length]...';
  }

  return {
    files,
    reviewableDiff: combinedDiff,
    ignoredFiles,
  };
}
