/**
 * Simple in-memory rate limit for public API (e.g. by API key or IP).
 * Use when PUBLIC_API_KEY is set to limit abuse of public endpoints.
 */

const windowMs = 60 * 1000; // 1 minute
const maxPerWindow = 60; // 60 requests per minute per key

const store = new Map<string, { count: number; resetAt: number }>();

function getKey(identifier: string): string {
  return `rl:${identifier}`;
}

/**
 * Check rate limit; returns true if allowed, false if over limit.
 * Call consume() after a successful check to record the request.
 */
export function checkRateLimit(identifier: string): boolean {
  const key = getKey(identifier);
  const now = Date.now();
  const entry = store.get(key);
  if (!entry) return true;
  if (now >= entry.resetAt) return true; // window expired
  return entry.count < maxPerWindow;
}

/**
 * Record one request for identifier. Call after checkRateLimit returns true.
 */
export function consumeRateLimit(identifier: string): void {
  const key = getKey(identifier);
  const now = Date.now();
  let entry = store.get(key);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    store.set(key, entry);
  }
  entry.count++;
}

/**
 * If PUBLIC_API_KEY is set, require X-API-Key header to match and enforce rate limit.
 * Returns null if allowed, or a Response to return (401/429).
 */
export function requirePublicApiKey(request: Request): Response | null {
  const publicKey = process.env.PUBLIC_API_KEY;
  if (!publicKey) return null; // no key configured = no check

  const provided = request.headers.get('x-api-key') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!provided || provided !== publicKey) {
    return new Response(JSON.stringify({ error: 'Missing or invalid X-API-Key' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const id = `key:${provided.slice(0, 8)}`;
  if (!checkRateLimit(id)) {
    return new Response(JSON.stringify({ error: 'Too many requests', retryAfter: 60 }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
    });
  }
  consumeRateLimit(id);
  return null;
}
