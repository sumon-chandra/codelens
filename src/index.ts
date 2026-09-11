import 'dotenv/config';
import express from 'express';
import webhookRouter from './routes/webhook.js';

// Assert required env vars at startup — fail fast with a clear message
const requiredEnvVars = [
  'GITHUB_WEBHOOK_SECRET',
  'GITHUB_TOKEN',
] as const;

for (const key of requiredEnvVars) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

if (!process.env.OPENROUTER_API_KEY && !process.env.GEMINI_API_KEY) {
  throw new Error('Missing required environment variable: OPENROUTER_API_KEY');
}

const app = express();
const PORT = process.env.PORT ?? 3000;

app.get("/", (_req, res) => {
  res.json({message: "Welcome to the Webhook server"})
})
// Health check — useful for Render's uptime monitoring
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Webhook route — raw body parsing is required for HMAC signature verification
app.use(
  '/webhook',
  express.raw({ type: 'application/json' }),
  webhookRouter
);

app.listen(PORT, () => {
  console.log(`AI Review Bot listening on port ${PORT}`);
});

export default app;
