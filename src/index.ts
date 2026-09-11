import 'dotenv/config';
import express from 'express';

// Assert required env vars at startup — fail fast with a clear message
const requiredEnvVars = [
  'GITHUB_WEBHOOK_SECRET',
  'GITHUB_TOKEN',
  'GEMINI_API_KEY',
] as const;

for (const key of requiredEnvVars) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const app = express();
const PORT = process.env.PORT ?? 3000;

// Health check — useful for Render's uptime monitoring
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Webhook route is mounted here — raw body parsing is handled inside the route
// (must stay as express.raw, NOT express.json, for HMAC signature verification)
// import webhookRouter from './routes/webhook.js'; // uncomment when M2 is implemented
// app.use('/webhook', webhookRouter);

app.listen(PORT, () => {
  console.log(`AI Review Bot listening on port ${PORT}`);
});

export default app;
