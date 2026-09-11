# AI Code Review Bot — Project Skill

You are an expert assistant for the **AI Code Review Bot** project — a Node.js/Express backend written in **TypeScript** that listens to GitHub webhooks, fetches PR diffs, sends them to the Gemini API, and posts inline review comments back to GitHub. There is no frontend; the entire loop is server-to-server.

## Project at a Glance

| Piece | Choice |
|---|---|
| Runtime | Node.js |
| Language | **TypeScript** (strict mode) |
| Framework | Express.js |
| AI | Gemini API (`@google/generative-ai`) |
| GitHub integration | GitHub REST API + Webhooks |
| Database (optional) | Prisma + PostgreSQL |
| Hosting | Any public Node host (Render, Railway, Fly.io) |

---

## When This Skill Is Invoked

If the user types `/ai-review-bot` with **no arguments**, give a concise project status summary:
- List any source files already present under `src/`
- Note which milestones below are complete vs. outstanding
- Suggest the single most important next step

If the user types `/ai-review-bot $ARGUMENTS`, treat $ARGUMENTS as a specific task or question and carry it out fully (see task catalogue below).

---

## Milestone Checklist (implement in order)

### M1 — Project Scaffold
- [ ] `package.json` with scripts: `dev` (ts-node-dev or tsx watches `src/index.ts`), `build` (tsc), `start` (`node dist/index.js` — compiled output, never `src/index.js`)
- [ ] `tsconfig.json` — `strict: true`, `target: ES2022`, `module: NodeNext`, `moduleResolution: NodeNext`, `outDir: dist`, `rootDir: src`
- [ ] Dependencies: `express`, `@google/generative-ai`, `@octokit/rest`, `dotenv`
- [ ] Dev dependencies: `typescript`, `tsx`, `@types/express`, `@types/node`
- [ ] `.env.example` with all required keys (no real values)
- [ ] `src/index.ts` — Express app entry point, port from `process.env.PORT` (**never reference this as `src/index.js`**)
- [ ] `.gitignore` covering `node_modules`, `.env`, `dist/`, `prisma/dev.db`

### M2 — Webhook Receiver
- [ ] `POST /webhook` route in `src/routes/webhook.ts`
- [ ] Raw body parsing (required for HMAC signature verification)
- [ ] `src/middleware/verifySignature.ts` — HMAC-SHA256 check using `crypto.timingSafeEqual`, typed as `express.RequestHandler`
- [ ] Filter to only handle `pull_request` events with action `opened` or `synchronize`
- [ ] Respond `200 OK` immediately before doing async work (prevents GitHub timeout retries)

### M3 — GitHub API Integration
- [ ] `src/services/github.ts` — thin wrapper around `@octokit/rest`
- [ ] Typed interfaces: `ReviewComment`, `PRDiffResult`
- [ ] `getPRDiff(owner: string, repo: string, pull_number: number): Promise<string>` — fetches diff via `GET /repos/{owner}/{repo}/pulls/{pull_number}` with `Accept: application/vnd.github.v3.diff`
- [ ] `postReviewComments(owner: string, repo: string, pull_number: number, commit_id: string, comments: ReviewComment[]): Promise<void>` — calls `POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews` with `event: "COMMENT"` and a `comments` array

### M4 — Gemini Integration
- [ ] `src/services/gemini.ts` — initialises `GoogleGenerativeAI` from env
- [ ] Typed interfaces: `GeminiComment`, `GeminiReviewResponse`
- [ ] `reviewDiff(diff: string, customRules: string[]): Promise<GeminiReviewResponse>` — builds a structured prompt requesting JSON output
- [ ] Prompt schema:
  ```
  { "comments": [ { "path": string, "line": number, "body": string, "severity": "bug"|"security"|"style"|"custom" } ] }
  ```
- [ ] Instructs Gemini: "Return ONLY valid JSON matching the schema. No markdown fences."
- [ ] Parses response; throws a descriptive typed error if JSON is malformed

### M5 — Orchestration
- [ ] `src/services/reviewer.ts` — `runReview(payload: WebhookPayload): Promise<void>` function that:
  1. Extracts `owner`, `repo`, `pull_number`, `after` (commit SHA) from the webhook payload — use a typed `WebhookPayload` interface
  2. Calls `getPRDiff`
  3. Calls `reviewDiff` with the diff + any custom rules from env/config
  4. Filters out comments whose `line` value doesn't map to a real diff hunk (prevents GitHub API 422 errors)
  5. Calls `postReviewComments`
- [ ] `src/types/index.ts` — shared type definitions (`WebhookPayload`, `ReviewComment`, `GeminiComment`, etc.)
- [ ] Webhook route calls `runReview` inside a `try/catch`; logs errors, never crashes the server

### M6 — Custom Rules
- [ ] `src/config/rules.ts` — exports a typed `string[]` of plain-English rule strings
- [ ] Default rules include: "Flag any payment or billing code that lacks try/catch error handling", "Flag any raw SQL string construction (SQL injection risk)"
- [ ] Rules are appended to the Gemini prompt as a "Custom Rules" section
- [ ] (Stretch) Rules stored per-repo in PostgreSQL via Prisma

### M7 — Database (Optional / Stretch)
- [ ] `prisma/schema.prisma` with models: `Repo`, `Review`, `Comment`, `Rule`
- [ ] `src/services/db.ts` — Prisma client singleton with typed exports
- [ ] Save every review run with timestamp, PR URL, comment count, and model used

---

## Task Catalogue

When $ARGUMENTS matches one of these, carry out the full task:

**`scaffold`** — Generate all M1 files. Ask for nothing; use sensible defaults. All files must be `.ts`. The generated scaffold must reference `src/index.ts` (not `src/index.js`) in all documentation, comments, and the `start` script in `package.json`.

**`webhook`** — Implement M2. Show the complete `verifySignature` middleware typed as `express.RequestHandler`. Explain *why* raw body parsing must happen before JSON parsing.

**`github`** — Implement M3. Include JSDoc. Define and export all TypeScript interfaces. Show how to pass `Accept: application/vnd.github.v3.diff` with Octokit.

**`gemini`** — Implement M4. Write the full prompt string. Define `GeminiComment` and `GeminiReviewResponse` interfaces. Explain the "Return ONLY valid JSON" instruction and why it prevents parse failures.

**`orchestrate`** — Implement M5. Define the `WebhookPayload` type in `src/types/index.ts`. Highlight the diff-hunk filtering step with a comment explaining GitHub's 422 behaviour.

**`rules`** — Implement M6. Show three example custom rules and explain how they're injected into the prompt.

**`database`** — Implement M7. Generate the Prisma schema and the db service file with typed Prisma client.

**`deploy`** — Give step-by-step instructions for deploying to Render (free tier):
  1. Run `npm run build` locally to confirm TypeScript compiles cleanly
  2. Push repo to GitHub
  3. Create a new Web Service on Render, point at repo
  4. Set build command to `npm run build`, start command to `node dist/index.js`
  5. Set env vars in Render dashboard
  6. Copy the live URL and add it as the GitHub webhook endpoint
  7. Set the webhook secret to match `GITHUB_WEBHOOK_SECRET` in Render

**`env`** — Print a complete `.env.example` with every key the project needs and one-line explanations.

**`test-webhook`** — Show how to use `curl` or the GitHub CLI to send a fake `pull_request` webhook payload to `localhost` for local testing without a live tunnel.

**`debug 422`** — Explain the most common cause (comment line not in a diff hunk) and show the TypeScript filtering logic that prevents it.

**`prompt-design`** — Explain best practices for structured Gemini prompts: JSON-only output, schema in the prompt, temperature 0 for determinism, and how to handle refusals.

**`status`** — Check which milestone files exist in `src/` and report what's done and what's next.

---

## Code Conventions for This Project

- **TypeScript everywhere** — every file is `.ts`; no `.js` files in `src/`
- **Strict mode** — `"strict": true` in `tsconfig.json`; no `any` unless absolutely unavoidable and commented
- **Explicit return types** — all exported functions must have explicit return type annotations
- **Shared types in `src/types/index.ts`** — never inline one-off interfaces in service files
- **`async`/`await` throughout** — no Promise chains or callbacks
- **No global state** — pass dependencies explicitly; don't mutate module-level variables
- **Secrets from env only** — never hard-code tokens; always read from `process.env` and assert they are defined at startup
- **One responsibility per file** — routes route, services do work, middleware guards
- **Descriptive error messages** — include the upstream status code and body when re-throwing GitHub/Gemini errors

---

## Key Gotchas to Proactively Flag

1. **Raw body for signature verification** — Express must receive the raw `Buffer` before any body parser runs. Use `express.raw({ type: 'application/json' })` on the webhook route only.
2. **GitHub 422 on review comments** — A comment's `line` must fall within an actual diff hunk. Filter comments before posting.
3. **Gemini JSON reliability** — Even with instructions, Gemini sometimes wraps output in markdown fences. Strip them before `JSON.parse`. Use a typed parse helper.
4. **Webhook re-fires on every push** — The `synchronize` event fires on each new commit to an open PR. Make the review idempotent (posting a new review each time is fine; duplicate-checking is optional).
5. **GitHub API rate limits** — Authenticated requests get 5 000/hour. For large PRs, consider caching the diff if you re-review within seconds of a previous run.
6. **Timing-safe comparison** — Use `crypto.timingSafeEqual` not `===` for the HMAC check to prevent timing attacks.
7. **TypeScript build step on deploy** — Render (and most hosts) run `npm start` directly. Ensure the build command (`tsc`) runs first and `start` points to `dist/index.js`, not `src/index.ts`.
8. **`process.env` type safety** — Assert required env vars at startup and throw a clear error if any are missing; this prevents cryptic runtime errors in production.

---

## Environment Variables Reference

```
GITHUB_WEBHOOK_SECRET=   # Shared secret configured in GitHub repo webhook settings
GITHUB_TOKEN=            # Personal access token or GitHub App token with repo scope
GEMINI_API_KEY=          # From Google AI Studio (aistudio.google.com)
PORT=3000                # Port Express listens on (Render sets this automatically)
DATABASE_URL=            # PostgreSQL connection string (optional, for Prisma)
```
