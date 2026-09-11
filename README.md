# 🔍 Codelens — AI-Powered Pull Request Code Reviewer

[![Status](https://img.shields.io/badge/Status-Live%20%26%20Active-brightgreen.svg)]()
[![Platform](https://img.shields.io/badge/Integration-GitHub%20Webhooks-181717.svg?logo=github)]()
[![AI Engine](https://img.shields.io/badge/AI%20Engine-OpenRouter%20Reasoning-6366f1.svg)]()
[![Security](https://img.shields.io/badge/Security-HMAC--SHA256%20Verified-blue.svg)]()

> **Codelens** is an enterprise-grade, automated code review platform that integrates directly with GitHub. Powered by advanced reasoning language models via OpenRouter, Codelens acts as an always-on senior staff engineer—analyzing diffs in real time, catching security vulnerabilities, enforcing custom architectural standards, and posting precise inline feedback directly on your Pull Requests.

---

## 📑 Table of Contents

- [Overview](#-overview)
- [Key Capabilities](#-key-capabilities)
- [How Codelens Works](#-how-codelens-works)
- [Setup & User Manual](#-setup--user-manual)
- [Review Anatomy & Severity Categories](#-review-anatomy--severity-categories)
- [Custom Engineering Rules Engine](#-custom-engineering-rules-engine)
- [Noise Reduction & Token Budgeting](#-noise-reduction--token-budgeting)
- [Re-Review & Deduplication Behavior](#-re-review--deduplication-behavior)
- [Security, Privacy & Data Integrity](#-security-privacy--data-integrity)
- [Frequently Asked Questions (FAQ)](#-frequently-asked-questions-faq)

---

## 🌟 Overview

Code reviews are critical for software quality and security, but manual reviews are often delayed, fatigue-prone, and inconsistent. Minor security omissions—such as unhandled async rejections, SQL string concatenations, or exposed API credentials—regularly bypass human inspection.

**Codelens** solves this by automating the initial review pass. Operating silently in the cloud, it intercepts pull request activity, analyzes modified lines, and delivers constructive, badged inline suggestions within seconds.

---

## ⚡ Key Capabilities

- **Instant Automated Reviews**: Triggers immediately when a pull request is opened or when new commits are pushed.
- **Deep Semantic Reasoning**: Uses frontier reasoning models via OpenRouter to analyze context, variable lifecycles, and cross-file relationships rather than superficial regex pattern matching.
- **Line-by-Line Inline Comments**: Places feedback directly on the specific lines in the GitHub **"Files changed"** tab, complete with actionable fix recommendations.
- **Executive Review Summaries**: Delivers a top-level review comment summarizing the overall risk profile, total issues found, and architectural health of the pull request.
- **Zero Comment Spam (Smart Deduplication)**: Automatically detects previously posted bot comments during iterative pushes (`synchronize` events), ensuring developer timelines remain clean.
- **Strict Diff-Hunk Boundaries**: Validates line coordinates against the actual unified diff to prevent API errors and ensure comments only appear on newly written code.
- **Comprehensive Asset Filtering**: Intelligently ignores package manager lockfiles, binary files, minified bundles, and images to focus exclusively on reviewable business logic.

---

## 🔄 How Codelens Works

```text
[ Developer Pushes Code ]
          │
          ▼
[ GitHub Fires Webhook ]
          │
          ▼
[ Codelens Perimeter ] ──► (HMAC-SHA256 Signature Verification)
          │
          ▼
[ Diff Extraction ] ─────► (Retrieves Unified Git Diff & Latest Commit SHA)
          │
          ▼
[ Preprocessing Engine ] ─► (Filters Lockfiles, Bundles, and Asset Binaries)
          │
          ▼
[ AI Reasoning Core ] ───► (Diff + Custom Rules Evaluated via OpenRouter)
          │
          ▼
[ Validation & Dedup ] ──► (Diff-Hunk Mapping & Previous Review De-duplication)
          │
          ▼
[ Inline Review Posted ] ─► (Comments Placed Directly on GitHub PR)
```

---

## 🛠️ Setup & User Manual

Connecting Codelens to any GitHub repository requires zero code changes to your project. Configuration takes less than one minute.

### Step 1: Access Webhook Settings
1. Navigate to your repository on GitHub.
2. Click on **Settings** in the top navigation bar.
3. In the left-hand sidebar, select **Webhooks** (under *Code and automation*).
4. Click the **Add webhook** button on the top right.

### Step 2: Configure the Webhook Endpoint
Enter the following connection parameters:

| Field | Value | Notes |
|---|---|---|
| **Payload URL** | `https://<your-codelens-domain>/webhook` | The public URL of your Codelens service |
| **Content type** | `application/json` | **Must** be set to `application/json` |
| **Secret** | `<Your Shared Webhook Secret>` | Used for cryptographic HMAC-SHA256 authentication |
| **SSL verification** | `Enable SSL verification` | Keep enabled for secure HTTPS delivery |

### Step 3: Select Trigger Events
1. Under **"Which events would you like to trigger this webhook?"**, select **Let me select individual events**.
2. Check the **Pull requests** checkbox.
3. *(Optional)* Uncheck **Pushes** if you only want reviews on pull requests.
4. Ensure the **Active** checkbox at the bottom is checked.
5. Click **Add webhook**.

### Step 4: Verification
GitHub will immediately dispatch a `ping` event. A green checkmark (`✔`) with a `200 OK` response status confirms that your repository is connected and ready for automated code reviews.

---

## 🏷️ Review Anatomy & Severity Categories

Every inline comment posted by Codelens includes a visual badge indicating its priority and risk profile:

### 1. 🚨 `[SECURITY]`
Critical vulnerabilities that expose the application to compromise or data leakage:
- Hardcoded API keys, private credentials, or auth tokens.
- SQL injection vectors (direct parameter interpolation).
- Missing authentication guards or cross-site scripting (XSS) hazards.

### 2. 🐛 `[BUG]`
Functional bugs, runtime traps, and uncaught exceptions:
- Missing `try/catch` blocks around external services, billing, or database queries.
- Unhandled Promise rejections and missing `await` operators.
- Out-of-scope variable references and potential `null`/`undefined` dereferencing.

### 3. 🎨 `[STYLE]`
Maintainability, performance, and code clean-up suggestions:
- Dangerous type assertions (`as any`) where strict typings should be declared.
- Dead code, redundant operations, or unoptimized data transformations.
- Deviation from common idiom conventions.

### 4. 📋 `[CUSTOM RULE]`
Project-specific standards defined in your team's custom rule configuration.

---

## 📋 Custom Engineering Rules Engine

Codelens goes beyond generic linting by enforcing custom natural-language architectural rules that matter to your team. 

The built-in rules engine actively inspects every diff for:
1. **Financial & Transactional Integrity**: All billing, payment gateway (e.g. Stripe), and ledger operations must have robust error handling and transactional safety.
2. **Database Query Safety**: Strict enforcement of parameterized queries and ORM query builders; prohibition of raw SQL string concatenations.
3. **Secret Hygiene**: Zero-tolerance scanning for test keys, private tokens, or hardcoded credentials.
4. **Asynchronous Correctness**: Strict validation that all asynchronous calls are properly awaited and wrapped with error boundaries.
5. **Strict Typing Standards**: Identification of unsafe `any` casts that bypass TypeScript compile-time guarantees.
6. **Input Boundaries**: Verification that incoming request payloads and webhook parameters are validated before consumption.

---

## 🧹 Noise Reduction & Token Budgeting

To ensure reviews are practical, relevant, and cost-effective, Codelens includes intelligent diff preprocessing:

### Ignored Files
The following files are automatically stripped from AI review diffs:
- **Lockfiles**: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lock`, `bun.lockb`.
- **Media & Binaries**: Images (`.png`, `.jpg`, `.svg`), fonts (`.woff2`, `.ttf`), audio, and PDF assets.
- **Compiled Bundles**: Minified scripts (`.min.js`), stylesheets (`.min.css`), and source maps (`.map`).
- **Build Artifacts**: Changes inside `dist/`, `build/`, `.next/`, or test coverage directories.

### Diff Truncation Protection
For exceptionally large pull requests (e.g., initial repository imports or large refactors), diffs exceeding **100,000 characters** are safely truncated with an alert note. This preserves model reasoning capabilities and avoids context window overflow.

---

## 🔁 Re-Review & Deduplication Behavior

Pull requests are living, iterative workflows. Codelens is engineered to support fast commit cycles without cluttering the review thread:

- **On Initial Open (`opened`)**: Codelens reviews the full PR diff, posts inline comments on detected issues, and provides an executive summary.
- **On Subsequent Pushes (`synchronize`)**:
  - Codelens queries GitHub's review API to retrieve all existing comments.
  - It cross-references file paths and line coordinates.
  - **Duplicate comments are automatically skipped**, ensuring only *newly introduced issues* receive inline alerts.
  - If all previously reported issues remain unchanged and no new bugs were added, Codelens posts a non-disruptive update:
    > *🔄 Re-review Update: All detected issues on modified files were previously flagged. No new issues were introduced in this push.*
- **On Clean Commits**: When a pull request contains zero identified bugs or rule violations, Codelens provides a positive, clean approval summary to keep team momentum high.

---

## 🔒 Security, Privacy & Data Integrity

- **Cryptographic Request Authentication**: Every incoming webhook payload is verified using timing-safe HMAC-SHA256 digests (`crypto.timingSafeEqual`). Forged, missing, or altered payloads are rejected with `401 Unauthorized` before processing.
- **In-Flight Code Processing**: Codelens operates ephemerally. Repository code is read in memory to compute review feedback and is never stored in external databases or used for model training.
- **Scoped Permissions**: The bot requires only minimal read access to repository diffs and write access to pull request review comments.
- **GitHub 422 Resilience Fallback**: If GitHub's API rejects inline comment placement due to transient line shifting, Codelens automatically triggers its resilience fallback, submitting all feedback in a single consolidated review body so critical warnings are never lost.

---

## ❓ Frequently Asked Questions (FAQ)

#### Q: Does Codelens support private repositories?
**A**: Yes. Codelens supports both public and private repositories seamlessly, provided the access token configured for the service has read access to the target repository.

#### Q: Why did Codelens leave a general summary instead of inline comments?
**A**: This occurs either because:
1. The code changes passed review with zero issues detected.
2. An upstream file path or line number could not be mapped to the current commit diff, prompting Codelens's automatic **Fallback Mode** to ensure feedback was not lost.

#### Q: How can I change the underlying AI model?
**A**: Codelens is configured through OpenRouter, allowing you to select any model (e.g., `nex-agi/nex-n2.5-pro:free`, `meta-llama/llama-3.3-70b-instruct:free`, `deepseek/deepseek-r1`, or `anthropic/claude-3.5-sonnet`) by adjusting your service's model configuration.

#### Q: How long does a review take?
**A**: Typical reviews complete in **3 to 10 seconds**, depending on diff size and the reasoning depth of the selected model.

---

## 📄 License & Terms

© Codelens Platform. All rights reserved. Distributed for proprietary enterprise and personal developer use.
