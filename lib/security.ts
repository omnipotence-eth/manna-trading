/**
 * Security Enhancements
 * Provides comprehensive security features for API protection
 */

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { logger } from './logger';
import { PerformanceMonitor } from './performanceMonitor';
import { asterConfig } from './configService';

/**
 * Security configuration
 */
interface SecurityConfig {
  enableRateLimiting: boolean;
  enableIPWhitelist: boolean;
  enableRequestSigning: boolean;
  enableCORS: boolean;
  enableCSRF: boolean;
  maxRequestSize: number;
  allowedOrigins: string[];
  whitelistedIPs: string[];
  apiKeyRotationInterval: number;
}

const securityConfig: SecurityConfig = {
  enableRateLimiting: true,
  enableIPWhitelist: false, // Disabled by default for development
  enableRequestSigning: true,
  enableCORS: true,
  enableCSRF: true,
  maxRequestSize: 1024 * 1024, // 1MB
  allowedOrigins: [
    'http://localhost:3000',
    'https://manna-ai-arena.vercel.app',
    'https://*.vercel.app'
  ],
  whitelistedIPs: [
    '127.0.0.1',
    '::1',
    'localhost'
  ],
  apiKeyRotationInterval: 24 * 60 * 60 * 1000 // 24 hours
};

// NOTE: API Key management is now handled by unified lib/apiKeyManager.ts
// This module provides request validation helpers only
import { apiKeyManager as unifiedKeyManager } from './apiKeyManager';

/**
 * Request API Key Validator - for validating incoming API requests
 * Checks that a supplied key matches one of our configured Aster DEX keys.
 */
class RequestKeyValidator {
  /**
   * Validate that an API key matches a key known to this system.
   * Uses constant-time comparison to prevent timing attacks.
   */
  validateKey(apiKey: string): boolean {
    if (!apiKey) return false;

    const configuredKeys: string[] = [];

    // Single key (most common)
    if (process.env.ASTER_API_KEY) configuredKeys.push(process.env.ASTER_API_KEY);

    // Comma-separated pool
    if (process.env.ASTER_API_KEYS) {
      configuredKeys.push(...process.env.ASTER_API_KEYS.split(',').map(k => k.trim()).filter(Boolean));
    }

    // Numbered pool (ASTER_API_KEY_1 … ASTER_API_KEY_N)
    const keyCount = parseInt(process.env.API_KEY_COUNT || '0', 10);
    for (let i = 1; i <= keyCount; i++) {
      const k = process.env[`ASTER_API_KEY_${i}`];
      if (k) configuredKeys.push(k);
    }

    if (configuredKeys.length === 0) return false;

    const incomingBuf = Buffer.from(apiKey);
    return configuredKeys.some(k => {
      const configuredBuf = Buffer.from(k);
      if (incomingBuf.length !== configuredBuf.length) return false;
      return crypto.timingSafeEqual(incomingBuf, configuredBuf);
    });
  }

  /**
   * Get stats for monitoring
   */
  getStats() {
    return unifiedKeyManager.getStats();
  }
}

/**
 * Request Signing Validator
 */
export class RequestSigningValidator {
  /**
   * Validate request signature
   */
  static validateSignature(
    request: NextRequest,
    expectedSignature: string,
    secret: string
  ): boolean {
    try {
      // Get request body
      const body = request.body;
      if (!body) return false;

      // Create signature
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(JSON.stringify(body));
      const signature = hmac.digest('hex');

      return signature === expectedSignature;
    } catch (error) {
      logger.error('Signature validation failed', error, { context: 'Security' });
      return false;
    }
  }

  /**
   * Generate request signature
   */
  static generateSignature(data: unknown, secret: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(data));
    return hmac.digest('hex');
  }
}

/**
 * IP Whitelist Manager
 */
export class IPWhitelistManager {
  private whitelist = new Set<string>(securityConfig.whitelistedIPs);

  /**
   * Check if IP is whitelisted
   */
  isWhitelisted(ip: string): boolean {
    if (!securityConfig.enableIPWhitelist) return true;
    
    // Check exact match
    if (this.whitelist.has(ip)) return true;
    
    // Check CIDR ranges (simplified)
    for (const whitelistedIP of this.whitelist) {
      if (this.isIPInRange(ip, whitelistedIP)) return true;
    }
    
    return false;
  }

  /**
   * Add IP to whitelist
   */
  addIP(ip: string): void {
    this.whitelist.add(ip);
    logger.info('IP added to whitelist', {
      context: 'Security',
      data: { ip, totalIPs: this.whitelist.size }
    });
  }

  /**
   * Remove IP from whitelist
   */
  removeIP(ip: string): void {
    this.whitelist.delete(ip);
    logger.info('IP removed from whitelist', {
      context: 'Security',
      data: { ip, totalIPs: this.whitelist.size }
    });
  }

  /**
   * Check if IP is in CIDR range (simplified)
   */
  private isIPInRange(ip: string, range: string): boolean {
    // Simplified CIDR check - in production, use a proper CIDR library
    if (range.includes('/')) {
      // Basic CIDR implementation
      const [rangeIP, prefix] = range.split('/');
      const prefixLength = parseInt(prefix);
      
      // This is a simplified check - use proper CIDR library in production
      return ip.startsWith(rangeIP.split('.').slice(0, Math.floor(prefixLength / 8)).join('.'));
    }
    
    return false;
  }

  /**
   * Get whitelist statistics
   */
  getStats(): {
    totalIPs: number;
    ips: string[];
  } {
    return {
      totalIPs: this.whitelist.size,
      ips: Array.from(this.whitelist)
    };
  }
}

/**
 * Security Middleware
 */
export function withSecurity<T>(
  handler: (req: NextRequest) => Promise<NextResponse<T>>
) {
  return async (req: NextRequest): Promise<NextResponse<T>> => {
    const timer = PerformanceMonitor.startTimer('security:middleware');
    
    try {
      // Fast-fail on Content-Length header as an early hint.
      // Note: Content-Length can be spoofed by clients; enforce the true body size
      // limit when reading the body in each handler (don't rely solely on this check).
      const contentLength = req.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > securityConfig.maxRequestSize) {
        PerformanceMonitor.recordCounter('security:request_too_large');
        return NextResponse.json(
          { error: 'Request too large' } as T,
          { status: 413 }
        );
      }

      // Check IP whitelist
      const ip = req.headers.get('x-forwarded-for') || 
                 req.headers.get('x-real-ip') || 
                 req.ip || 
                 'unknown';
      
      if (!ipWhitelist.isWhitelisted(ip)) {
        PerformanceMonitor.recordCounter('security:ip_blocked');
        logger.warn('IP blocked by whitelist', {
          context: 'Security',
          data: { ip, url: req.url }
        });
        return NextResponse.json(
          { error: 'Access denied' } as T,
          { status: 403 }
        );
      }

      // Check CORS
      const requestOrigin = req.headers.get('origin');
      if (securityConfig.enableCORS && requestOrigin) {
        const originAllowed = securityConfig.allowedOrigins.some(allowed => {
          if (allowed.includes('*')) {
            // Support simple wildcard patterns like https://*.vercel.app
            const pattern = new RegExp('^' + allowed.replace('.', '\\.').replace('*', '[^.]+') + '$');
            return pattern.test(requestOrigin);
          }
          return allowed === requestOrigin;
        });
        if (!originAllowed) {
          PerformanceMonitor.recordCounter('security:cors_blocked');
          return NextResponse.json(
            { error: 'CORS policy violation' } as T,
            { status: 403 }
          );
        }
      }

      // Check API key for authenticated endpoints
      if (req.url.includes('/api/aster/')) {
        const apiKey = req.headers.get('x-mbx-apikey') || 
                      req.headers.get('authorization')?.replace('Bearer ', '');
        
        if (!apiKey || !requestKeyValidator.validateKey(apiKey)) {
          PerformanceMonitor.recordCounter('security:invalid_api_key');
          logger.warn('Invalid API key', {
            context: 'Security',
            data: { ip, url: req.url }
          });
          return NextResponse.json(
            { error: 'Invalid API key' } as T,
            { status: 401 }
          );
        }
      }

      // Add security headers
      const response = await handler(req);
      
      // Add security headers to response
      response.headers.set('X-Content-Type-Options', 'nosniff');
      response.headers.set('X-Frame-Options', 'DENY');
      response.headers.set('X-XSS-Protection', '1; mode=block');
      response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
      response.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
      
      if (securityConfig.enableCORS && requestOrigin) {
        // Reflect the specific allowed origin rather than using a wildcard,
        // so the allowlist check above is not bypassed.
        response.headers.set('Access-Control-Allow-Origin', requestOrigin);
        response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-MBX-APIKEY');
        response.headers.set('Vary', 'Origin');
      }

      const duration = timer.end();
      PerformanceMonitor.recordCounter('security:middleware:success');
      PerformanceMonitor.recordGauge('security:middleware:response_time', duration);

      return response;
    } catch (error) {
      timer.end();
      PerformanceMonitor.recordCounter('security:middleware:error');
      logger.error('Security middleware error', error, { context: 'Security' });
      return NextResponse.json(
        { error: 'Security check failed' } as T,
        { status: 500 }
      );
    }
  };
}

/**
 * Global security instances
 * NOTE: apiKeyManager is now imported from unified lib/apiKeyManager.ts
 */
export { apiKeyManager } from './apiKeyManager';
export const requestKeyValidator = new RequestKeyValidator();
export const ipWhitelist = new IPWhitelistManager();

/**
 * Security monitoring
 */
export class SecurityMonitor {
  private suspiciousIPs = new Map<string, {
    count: number;
    lastSeen: number;
    blocked: boolean;
  }>();

  /**
   * Track suspicious activity
   */
  trackSuspiciousActivity(ip: string, reason: string): void {
    const now = Date.now();
    const existing = this.suspiciousIPs.get(ip);
    
    if (existing) {
      existing.count++;
      existing.lastSeen = now;
      
      // Block IP after 5 suspicious activities
      if (existing.count >= 5) {
        existing.blocked = true;
        ipWhitelist.removeIP(ip);
        
        logger.warn('IP blocked due to suspicious activity', {
          context: 'SecurityMonitor',
          data: {
            ip,
            count: existing.count,
            reason,
            blocked: true
          }
        });
      }
    } else {
      this.suspiciousIPs.set(ip, {
        count: 1,
        lastSeen: now,
        blocked: false
      });
    }

    PerformanceMonitor.recordCounter('security:suspicious_activity');
    
    logger.warn('Suspicious activity detected', {
      context: 'SecurityMonitor',
      data: {
        ip,
        reason,
        count: existing?.count || 1
      }
    });
  }

  /**
   * Get security statistics
   */
  getStats(): {
    suspiciousIPs: number;
    blockedIPs: number;
    totalIncidents: number;
  } {
    let blockedIPs = 0;
    let totalIncidents = 0;

    for (const data of this.suspiciousIPs.values()) {
      if (data.blocked) blockedIPs++;
      totalIncidents += data.count;
    }

    return {
      suspiciousIPs: this.suspiciousIPs.size,
      blockedIPs,
      totalIncidents
    };
  }
}

/**
 * Global security monitor
 */
export const securityMonitor = new SecurityMonitor();

/**
 * Initialize security systems
 */
export function initializeSecurity(): void {
  logger.info('Security systems initialized', {
    context: 'Security',
    data: {
      rateLimiting: securityConfig.enableRateLimiting,
      ipWhitelist: securityConfig.enableIPWhitelist,
      requestSigning: securityConfig.enableRequestSigning,
      cors: securityConfig.enableCORS,
      csrf: securityConfig.enableCSRF,
      maxRequestSize: securityConfig.maxRequestSize,
      allowedOrigins: securityConfig.allowedOrigins.length,
      whitelistedIPs: securityConfig.whitelistedIPs.length
    }
  });
}
