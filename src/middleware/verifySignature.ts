import crypto from 'crypto';
import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Express middleware to verify GitHub webhook HMAC-SHA256 signatures.
 * 
 * GitHub signs every webhook payload with the shared secret using HMAC-SHA256
 * and passes the hex-encoded digest in the `x-hub-signature-256` header.
 * 
 * IMPORTANT: Signature verification MUST use the unaltered raw Buffer of the body.
 * If JSON parsing runs before this check, whitespace or key reordering will cause
 * the computed HMAC to differ, failing validation.
 */
export const verifySignature: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!secret) {
    console.error('[Security] GITHUB_WEBHOOK_SECRET environment variable is missing.');
    res.status(500).json({
      error: 'Server misconfiguration: GITHUB_WEBHOOK_SECRET is not set.',
    });
    return;
  }

  if (!signature) {
    console.warn('[Security] Missing x-hub-signature-256 header in webhook request.');
    res.status(401).json({
      error: 'Unauthorized: Missing x-hub-signature-256 signature header.',
    });
    return;
  }

  // Verify request body is a raw Buffer from express.raw()
  if (!Buffer.isBuffer(req.body)) {
    console.error('[Security] Request body is not a Buffer. Ensure express.raw({ type: "application/json" }) is configured.');
    res.status(500).json({
      error: 'Server misconfiguration: Webhook route requires raw body Buffer for HMAC verification.',
    });
    return;
  }

  try {
    // Compute HMAC-SHA256 signature from raw body
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(req.body);
    const expectedSignature = `sha256=${hmac.digest('hex')}`;

    const sigBuffer = Buffer.from(signature, 'utf-8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf-8');

    // timingSafeEqual requires equal length buffers; unequal lengths indicate signature mismatch
    if (
      sigBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      console.warn('[Security] HMAC signature verification failed. Request rejected.');
      res.status(401).json({
        error: 'Unauthorized: Invalid HMAC signature.',
      });
      return;
    }

    // Signature is authentic and matches GitHub secret
    next();
  } catch (error: any) {
    console.error('[Security] Unexpected error during signature verification:', error);
    res.status(500).json({ error: 'Internal error verifying webhook signature.' });
  }
};
