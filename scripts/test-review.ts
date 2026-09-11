import 'dotenv/config';
import { reviewDiff } from '../src/services/gemini.js';
import { defaultCustomRules } from '../src/config/rules.js';

/**
 * Test script for Gemini AI Review
 * Tests the Gemini API with a sample diff containing deliberate issues:
 * 1. Missing try/catch around payment call
 * 2. SQL injection via string concatenation
 * 3. Hardcoded API secret
 */
async function runTestReview() {
  console.log('🧪 Starting Gemini AI Review test...\n');

  const sampleDiff = `diff --git a/src/controllers/paymentController.ts b/src/controllers/paymentController.ts
new file mode 100644
index 0000000..f924b12
--- /dev/null
+++ b/src/controllers/paymentController.ts
@@ -0,0 +1,24 @@
+import { Request, Response } from 'express';
+import stripe from 'stripe';
+import { db } from '../db';
+
+const STRIPE_SECRET = 'sk_live_51NABC1234567890FAKE_SECRET';
+
+export async function handleCheckout(req: Request, res: Response) {
+  const { userId, amount, cardNumber } = req.body;
+
+  // Vulnerability 1: SQL Injection
+  const user = await db.query(\`SELECT * FROM users WHERE id = '\${userId}'\`);
+
+  // Vulnerability 2: Payment call without try/catch error handling
+  const charge = await stripe.charges.create({
+    amount,
+    currency: 'usd',
+    source: cardNumber,
+  });
+
+  res.status(200).json({ success: true, chargeId: charge.id });
+}
+`;

  try {
    console.log('📤 Sending diff to Gemini API...');
    const startTime = Date.now();
    const reviewResult = await reviewDiff(sampleDiff, defaultCustomRules);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`\n✅ Review completed in ${duration}s!`);
    console.log('\n📋 Summary:');
    console.log(reviewResult.summary);

    console.log(`\n💬 Generated Comments (${reviewResult.comments.length}):`);
    for (const [index, comment] of reviewResult.comments.entries()) {
      console.log(`\n--- Comment #${index + 1} [${comment.severity.toUpperCase()}] ---`);
      console.log(`📍 File: ${comment.path} (Line ${comment.line})`);
      console.log(`📝 Body: ${comment.body}`);
    }

    console.log('\n🎉 Gemini integration test successful!');
  } catch (error: any) {
    console.error('\n❌ Review test failed:', error.message);
  }
}

runTestReview();
