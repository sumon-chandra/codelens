import { OpenRouter } from '@openrouter/sdk';
import { GeminiReviewResponse } from '../types/index.js';
import { defaultCustomRules, formatRulesForPrompt } from '../config/rules.js';

let openRouterInstance: OpenRouter | null = null;

/**
 * Lazily initializes and returns an authenticated OpenRouter client instance.
 */
export function getOpenRouterClient(): OpenRouter {
  if (openRouterInstance) {
    return openRouterInstance;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable is not defined.');
  }

  openRouterInstance = new OpenRouter({
    apiKey,
  });

  return openRouterInstance;
}

/**
 * Strips markdown fences (e.g. ```json ... ```) from model output for clean JSON parsing.
 */
export function cleanJsonResponse(rawText: string): string {
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  return cleaned.trim();
}

/**
 * Reviews a unified code diff using OpenRouter API with streaming and structured JSON output.
 *
 * @param diff The unified diff text to review.
 * @param customRules Array of custom review rules to enforce.
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

  const client = getOpenRouterClient();
  const model = process.env.OPENROUTER_MODEL || 'nex-agi/nex-n2.5-pro:free';

  const prompt = `You are Codelens, an expert senior staff software engineer performing a thorough, pragmatic code review on a GitHub Pull Request diff.

### Instructions:
1. Carefully analyze the provided git diff for potential logic bugs, security vulnerabilities, missing error handling, and performance regressions.
2. Only place inline comments on lines that were ADDED or MODIFIED in the diff (marked with '+').
3. For each comment, specify:
   - "path": exact file path as given in diff header (relative path without leading 'b/').
   - "line": the exact new file line number from the diff hunk (a line added or modified with '+').
   - "body": actionable, constructive explanation of the bug, security risk, or improvement.
   - "severity": one of 'bug' | 'security' | 'style' | 'custom'.
4. Do NOT leave trivial or pedantic style comments unless they violate custom rules or severely impact reliability.
5. If the code is solid and has no notable issues, return an empty "comments": [] list with an appreciative summary.

### Custom Review Rules to Strictly Enforce:
${formatRulesForPrompt(customRules)}

### Unified Diff to Review:
\`\`\`diff
${diff}
\`\`\`

### Output Format:
Return ONLY a valid JSON object matching this schema, with no additional conversational text:
{
  "summary": "Brief 1-2 sentence overall summary of the review findings.",
  "comments": [
    {
      "path": "src/controllers/example.ts",
      "line": 42,
      "body": "Explanation of issue and recommended fix.",
      "severity": "bug"
    }
  ]
}`;

  try {
    console.log(`[OpenRouter] Sending diff to model "${model}" with streaming...`);
    const result = await client.chat.send({
      chatRequest: {
        model,
        messages: [
          {
            role: 'system',
            content:
              'You are an automated, expert code review engine. You must output ONLY valid JSON matching the requested schema. Never output markdown fences, never include conversational commentary outside of the JSON.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        stream: true,
        temperature: 0.1,
      },
    });

    let rawOutput = '';

    // Check if result is an EventStream async iterable
    if (result && typeof (result as any)[Symbol.asyncIterator] === 'function') {
      for await (const chunk of (result as AsyncIterable<any>)) {
        const content = chunk.choices?.[0]?.delta?.content;
        if (content) {
          rawOutput += content;
        }

        if (chunk.usage?.completionTokensDetails?.reasoningTokens) {
          console.log(`[OpenRouter] Reasoning tokens: ${chunk.usage.completionTokensDetails.reasoningTokens}`);
        }
      }
    } else if (result && 'choices' in (result as any)) {
      rawOutput = (result as any).choices?.[0]?.message?.content ?? '';
    }

    const cleaned = cleanJsonResponse(rawOutput);

    // Extract the JSON object boundaries { ... } to handle any model preamble
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`OpenRouter response did not contain a valid JSON object: ${cleaned.slice(0, 150)}...`);
    }

    const parsed = JSON.parse(jsonMatch[0]) as GeminiReviewResponse;

    return {
      summary: parsed.summary || 'Code review completed.',
      comments: Array.isArray(parsed.comments) ? parsed.comments : [],
    };
  } catch (error: any) {
    console.error(`[OpenRouter] Review failed with model "${model}":`, error?.message || error);
    throw new Error(`OpenRouter review failed: ${error?.message || 'Unknown error'}`);
  }
}
