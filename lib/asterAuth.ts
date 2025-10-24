/**
 * Aster DEX HMAC SHA256 Authentication Utility
 * Based on Binance Futures API (Aster-compatible)
 */

/**
 * Generate HMAC SHA256 signature for Aster DEX API requests
 * @param queryString - The query string to sign (e.g., "symbol=BTCUSDT&timestamp=1234567890")
 * @param secret - Your Aster API secret key
 * @returns HMAC SHA256 signature in hex format
 */
export async function generateSignature(queryString: string, secret: string): Promise<string> {
  // Use Web Crypto API (available in Node.js 15+ and browsers)
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(queryString);

  // Import the secret as a crypto key
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // Generate signature
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);

  // Convert to hex string
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Build authenticated query string with signature
 * @param params - Object of query parameters
 * @param secret - Your Aster API secret key
 * @returns Complete query string with signature
 */
export async function buildSignedQuery(
  params: Record<string, string | number>,
  secret: string
): Promise<string> {
  // Add timestamp if not present
  if (!params.timestamp) {
    params.timestamp = Date.now();
  }

  // Add recvWindow if not present (max 60000ms)
  // Using 60000ms (60 seconds) to handle rate limiter delays
  if (!params.recvWindow) {
    params.recvWindow = 60000;
  }

  // Build query string (sorted alphabetically for consistency)
  const sortedParams = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');

  // Generate signature
  const signature = await generateSignature(sortedParams, secret);

  // Return query string with signature
  return `${sortedParams}&signature=${signature}`;
}

/**
 * Test function to verify Aster API credentials
 * @param apiKey - Your Aster API key
 * @param apiSecret - Your Aster API secret
 * @param baseUrl - Aster API base URL (default: https://fapi.asterdex.com)
 * @returns Account info if successful, null if failed
 */
export async function testAsterConnection(
  apiKey: string,
  apiSecret: string,
  baseUrl: string = 'https://fapi.asterdex.com'
): Promise<any> {
  try {
    const queryString = await buildSignedQuery({}, apiSecret);
    const url = `${baseUrl}/fapi/v1/account?${queryString}`;

    const response = await fetch(url, {
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Aster API test failed:', error);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Aster API connection error:', error);
    return null;
  }
}

