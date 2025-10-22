import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { apiRateLimiter } from '@/lib/rateLimiter';

const ASTER_BASE_URL = process.env.ASTER_BASE_URL || 'https://fapi.asterdex.com';
const API_KEY = process.env.ASTER_API_KEY;
const API_SECRET = process.env.ASTER_SECRET_KEY;

// Log environment variables on startup
logger.info('API Route Environment Check', {
  context: 'API',
  data: {
    hasBaseUrl: !!ASTER_BASE_URL,
    baseUrl: ASTER_BASE_URL,
    hasApiKey: !!API_KEY,
    hasSecret: !!API_SECRET,
  },
});

export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join('/');
  const url = `${ASTER_BASE_URL}/fapi/v1/${path}`;

  // Apply rate limiting
  const clientIP = req.headers.get('x-forwarded-for') || 'unknown';
  if (!apiRateLimiter.checkLimit(clientIP)) {
    logger.warn('Rate limit exceeded', { context: 'API', data: { ip: clientIP } });
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  try {
    logger.debug(`Fetching from Aster DEX: ${path}`, { context: 'API', data: { url } });

    const response = await fetch(url, {
      headers: {
        'X-API-KEY': API_KEY || '',
        'X-API-SECRET': API_SECRET || '',
      },
    });

    if (!response.ok) {
      logger.error(`Aster DEX API error: ${response.status}`, undefined, {
        context: 'API',
        data: { path, status: response.status },
      });
      return NextResponse.json(
        { error: `Aster DEX API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    logger.debug(`Successfully fetched from Aster DEX: ${path}`, { context: 'API' });
    return NextResponse.json(data);
  } catch (error) {
    logger.error('API proxy error', error, { context: 'API', data: { path } });
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join('/');
  const url = `${ASTER_BASE_URL}/${path}`;

  // Apply stricter rate limiting for POST
  const clientIP = req.headers.get('x-forwarded-for') || 'unknown';
  if (!apiRateLimiter.checkLimit(`${clientIP}-post`)) {
    logger.warn('Rate limit exceeded for POST', { context: 'API', data: { ip: clientIP } });
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  try {
    const body = await req.json();
    logger.debug(`Posting to Aster DEX: ${path}`, { context: 'API', data: { body } });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': API_KEY || '',
        'X-API-SECRET': API_SECRET || '',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      logger.error(`Aster DEX API error: ${response.status}`, undefined, {
        context: 'API',
        data: { path, status: response.status },
      });
      return NextResponse.json(
        { error: `Aster DEX API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    logger.debug(`Successfully posted to Aster DEX: ${path}`, { context: 'API' });
    return NextResponse.json(data);
  } catch (error) {
    logger.error('API proxy POST error', error, { context: 'API', data: { path } });
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}

