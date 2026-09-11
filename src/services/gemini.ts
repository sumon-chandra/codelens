import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { GeminiReviewResponse } from '../types/index.js';
import { defaultCustomRules, formatRulesForPrompt } from '../config/rules.js';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error('GEMINI_API_KEY environment variable is not defined.');
}

const genAI = new GoogleGenerativeAI(apiKey);

/**
 * Strips markdown code fences (e.g. ```json ... ```) from Gemini's output
 * to ensure reliable JSON parsing.
 */
export function cleanJsonResponse(rawText: string): string {
  let cleaned = rawText.trim();
  // Remove markdown code fences if present
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  return cleaned.trim();
}

/**
 * Reviews a unified code diff using Gemini API with structured JSON output.
 *
 * @param diff The unified diff string to review.
 * @param customRules Array of custom rules to enforce.
 * @returns Structured review result containing summary and inline comments.
 */
export async function reviewDiff(
  diff: string,
  customRules: string[] = defaultCustomRules
): Promise<GeminiReviewResponse> {
  if (!diff || !diff.trim()) {
    return {
      summary: 'No reviewable code changes detected in this pull request.',
      comments: [],
    };
  }

  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
    generationConfig: {
      temperature: 0.1, // Low temperature for consistent, deterministic reviews
      responseMimeType: 'application/json',
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          summary: {
            type: SchemaType.STRING,
            description: 'A concise 1-2 sentence overall summary of the review findings.',
          },
          comments: {
            type: SchemaType.ARRAY,
            description: 'Inline comments for specific lines in the diff.',
            items: {
              type: SchemaType.OBJECT,
              properties: {
                path: {
                  type: SchemaType.STRING,
                  description: 'The file path as given in the diff header (e.g., src/index.ts).',
                },
                line: {
                  type: SchemaType.INTEGER,
                  description: 'The exact new file line number from the diff hunk (a line added or modified with +).',
                },
                body: {
                  type: SchemaType.STRING,
                  description: 'Actionable, constructive explanation of the bug, security risk, or improvement.',
                },
                severity: {
                  type: SchemaType.STRING,
                  enum: ['bug', 'security', 'style', 'custom'],
                  description: 'Severity level of the comment.',
                },
              },
              required: ['path', 'line', 'body', 'severity'],
            },
          },
        },
        required: ['summary', 'comments'],
      },
    },
  });

  const prompt = `You are Codelens, an expert senior staff software engineer performing a thorough, pragmatic code review on a GitHub Pull Request diff.

### Instructions:
1. Carefully analyze the provided git diff for potential logic bugs, security vulnerabilities, missing error handling, and performance regressions.
2. Only place inline comments on lines that were ADDED or MODIFIED in the diff (marked with '+').
3. For each comment, specify the exact file "path" (relative path without leading 'b/'), the new file "line" number, a clear constructive "body", and the "severity" ('bug' | 'security' | 'style' | 'custom').
4. Do NOT leave trivial or pedantic style comments unless they severely impact readability or violate custom rules.
5. If the code is solid and has no notable issues, return an empty "comments": [] list with an appreciative summary.

### Custom Review Rules to Strictly Enforce:
${formatRulesForPrompt(customRules)}

### Unified Diff to Review:
\`\`\`diff
${diff}
\`\`\`

Return ONLY valid JSON matching the schema.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const cleanedJson = cleanJsonResponse(text);
    const parsed = JSON.parse(cleanedJson) as GeminiReviewResponse;

    // Ensure response adheres to structure
    return {
      summary: parsed.summary || 'Code review completed.',
      comments: Array.isArray(parsed.comments) ? parsed.comments : [],
    };
  } catch (error: any) {
    console.error('[Gemini] Error generating code review:', error?.message || error);
    throw new Error(`Gemini review failed: ${error?.message || 'Unknown error'}`);
  }
}
