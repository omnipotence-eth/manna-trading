/**
 * API Response Compression Middleware
 * Provides intelligent response compression and caching headers
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from './logger';
import { PerformanceMonitor } from './performanceMonitor';

/**
 * Compression configuration
 */
interface CompressionConfig {
  enabled: boolean;
  minSize: number; // Minimum response size to compress (bytes)
  maxAge: number; // Cache max age (seconds)
  compressionLevel: number; // Compression level (1-9)
}

const compressionConfig: CompressionConfig = {
  enabled: process.env.NODE_ENV === 'production',
  minSize: 1024, // 1KB minimum
  maxAge: 300, // 5 minutes
  compressionLevel: 6
};

/**
 * Add compression and caching headers to response
 */
export function withCompression<T>(
  handler: (req: NextRequest) => Promise<NextResponse<T>>
) {
  return async (req: NextRequest): Promise<NextResponse<T>> => {
    const timer = PerformanceMonitor.startTimer('api:compression');
    
    try {
      const response = await handler(req);
      
      if (!compressionConfig.enabled) {
        timer.end();
        return response;
      }

      // Clone response to modify headers
      const newResponse = new NextResponse(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });

      // Add compression headers
      newResponse.headers.set('Content-Encoding', 'gzip');
      newResponse.headers.set('Vary', 'Accept-Encoding');
      
      // Add caching headers based on endpoint
      const url = new URL(req.url);
      const pathname = url.pathname;
      
      if (pathname.includes('/api/health')) {
        // Health checks should not be cached
        newResponse.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        newResponse.headers.set('Pragma', 'no-cache');
        newResponse.headers.set('Expires', '0');
      } else if (pathname.includes('/api/aster/account') || pathname.includes('/api/aster/positions')) {
        // Account data - short cache
        newResponse.headers.set('Cache-Control', 'private, max-age=30, must-revalidate');
      } else if (pathname.includes('/api/prices')) {
        // Price data - medium cache
        newResponse.headers.set('Cache-Control', 'public, max-age=5, must-revalidate');
      } else if (pathname.includes('/api/trades') || pathname.includes('/api/model-message')) {
        // Trade data - longer cache
        newResponse.headers.set('Cache-Control', 'public, max-age=60, must-revalidate');
      } else {
        // Default caching
        newResponse.headers.set('Cache-Control', `public, max-age=${compressionConfig.maxAge}, must-revalidate`);
      }

      // Add security headers
      newResponse.headers.set('X-Content-Type-Options', 'nosniff');
      newResponse.headers.set('X-Frame-Options', 'DENY');
      newResponse.headers.set('X-XSS-Protection', '1; mode=block');
      newResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

      const duration = timer.end();
      PerformanceMonitor.recordCounter('api:compression:success');
      PerformanceMonitor.recordGauge('api:compression:response_time', duration);

      logger.debug('Response compressed and cached', {
        context: 'Compression',
        data: {
          pathname,
          status: response.status,
          duration,
          cacheControl: newResponse.headers.get('Cache-Control')
        }
      });

      return newResponse as NextResponse<T>;
    } catch (error) {
      timer.end();
      PerformanceMonitor.recordCounter('api:compression:error');
      logger.error('Compression middleware error', error, { context: 'Compression' });
      return handler(req);
    }
  };
}

/**
 * Response size optimization
 */
export function optimizeResponseSize<T>(data: T): T {
  if (typeof data === 'object' && data !== null) {
    // Remove null/undefined values
    const cleaned = JSON.parse(JSON.stringify(data, (key, value) => {
      if (value === null || value === undefined) {
        return undefined;
      }
      return value;
    }));
    
    return cleaned;
  }
  return data;
}

/**
 * Add ETag for conditional requests
 */
export function addETag(response: NextResponse, data: any): NextResponse {
  try {
    const dataString = JSON.stringify(data);
    const crypto = require('crypto');
    const etag = crypto.createHash('md5').update(dataString).digest('hex');
    
    response.headers.set('ETag', `"${etag}"`);
    return response;
  } catch (error) {
    logger.warn('Failed to generate ETag', undefined, { context: 'Compression' });
    return response;
  }
}

/**
 * Check if client accepts compression
 */
export function acceptsCompression(request: NextRequest): boolean {
  const acceptEncoding = request.headers.get('Accept-Encoding') || '';
  return acceptEncoding.includes('gzip') || acceptEncoding.includes('deflate');
}

/**
 * Get optimal compression level based on response size
 */
export function getCompressionLevel(responseSize: number): number {
  if (responseSize < 1024) return 1; // Small responses - fast compression
  if (responseSize < 10240) return 3; // Medium responses - balanced
  if (responseSize < 102400) return 6; // Large responses - good compression
  return 9; // Very large responses - maximum compression
}

/**
 * Response streaming for large datasets
 */
export function createStreamingResponse<T>(
  data: T[],
  chunkSize: number = 100
): ReadableStream {
  let index = 0;
  
  return new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      
      function pushChunk() {
        if (index >= data.length) {
          controller.close();
          return;
        }
        
        const chunk = data.slice(index, index + chunkSize);
        const jsonChunk = JSON.stringify(chunk);
        controller.enqueue(encoder.encode(jsonChunk));
        
        index += chunkSize;
        setTimeout(pushChunk, 0); // Non-blocking
      }
      
      pushChunk();
    }
  });
}

/**
 * Pre-compress static responses
 */
const preCompressedResponses = new Map<string, Buffer>();

export function preCompressResponse(key: string, data: any): void {
  try {
    const zlib = require('zlib');
    const jsonData = JSON.stringify(data);
    const compressed = zlib.gzipSync(jsonData, { level: compressionConfig.compressionLevel });
    preCompressedResponses.set(key, compressed);
    
    logger.debug('Response pre-compressed', {
      context: 'Compression',
      data: {
        key,
        originalSize: jsonData.length,
        compressedSize: compressed.length,
        compressionRatio: ((1 - compressed.length / jsonData.length) * 100).toFixed(1) + '%'
      }
    });
  } catch (error) {
    logger.error('Failed to pre-compress response', error, { context: 'Compression' });
  }
}

export function getPreCompressedResponse(key: string): Buffer | null {
  return preCompressedResponses.get(key) || null;
}

/**
 * Compression statistics
 */
export function getCompressionStats() {
  return {
    enabled: compressionConfig.enabled,
    minSize: compressionConfig.minSize,
    maxAge: compressionConfig.maxAge,
    compressionLevel: compressionConfig.compressionLevel,
    preCompressedCount: preCompressedResponses.size,
    preCompressedSize: Array.from(preCompressedResponses.values())
      .reduce((total, buffer) => total + buffer.length, 0)
  };
}
