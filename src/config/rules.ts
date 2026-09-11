/**
 * Custom Review Rules for Gemini Code Review
 * Add or modify plain-English guidelines that the AI should enforce during PR reviews.
 */
export const defaultCustomRules: string[] = [
  'Flag any payment, billing, or financial operations that lack robust try/catch error handling or transaction safety.',
  'Flag any raw SQL query strings or parameter interpolations that represent a SQL injection vulnerability.',
  'Flag hardcoded secrets, private keys, authentication tokens, or uncommitted sensitive environment credentials.',
  'Flag unhandled Promise rejections, missing await statements on asynchronous calls, or missing catch blocks.',
  'Flag uses of TypeScript "any" or unsafe type assertions ("as any") where strict types should be declared.',
  'Flag user inputs or webhook bodies accepted without validation or sanitization before processing.',
];

/**
 * Formats custom rules into a numbered Markdown block suitable for Gemini prompts.
 */
export function formatRulesForPrompt(rules: string[] = defaultCustomRules): string {
  if (!rules.length) return 'None specified.';
  return rules.map((rule, idx) => `${idx + 1}. ${rule}`).join('\n');
}
