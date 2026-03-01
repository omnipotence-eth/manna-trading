/**
 * Readiness check: env and critical services
 * GET /api/health/ready - returns ready: true/false and missing/warnings
 */

import { NextResponse } from 'next/server';
import { getValidationStatus } from '@/lib/envValidation';

export const dynamic = 'force-dynamic';

export async function GET() {
  const validation = getValidationStatus();
  const missing: string[] = [...validation.errors];
  const warnings: string[] = [...validation.warnings];

  let aster = false;
  let llm = false;
  let database = false;

  try {
    const { asterConfig, aiConfig, dbConfig } = await import('@/lib/configService');
    aster = !!(asterConfig.apiKey && asterConfig.secretKey);
    if (aiConfig.provider === 'groq') llm = !!aiConfig.groqApiKey;
    else if (aiConfig.provider === 'ollama') llm = true; // checked below
    database = dbConfig.isConfigured;

    if (!aster && !missing.some((m) => m.includes('ASTER'))) {
      missing.push('ASTER_API_KEY and ASTER_SECRET_KEY are required');
    }
    if (aiConfig.provider === 'groq' && !aiConfig.groqApiKey) {
      missing.push('GROQ_API_KEY is required when LLM_PROVIDER=groq');
    }
    if (aiConfig.provider === 'ollama') {
      try {
        const r = await fetch(`${aiConfig.ollamaBaseUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
        if (!r.ok) warnings.push('Ollama returned non-OK; is the model loaded?');
      } catch {
        warnings.push('Ollama is not reachable at ' + aiConfig.ollamaBaseUrl);
      }
      llm = true; // we tried
    }
    if (!database) {
      warnings.push('DATABASE_URL not set; persistence and circuit breaker will be limited');
    }
  } catch (e) {
    missing.push('Config failed to load: ' + (e instanceof Error ? e.message : String(e)));
  }

  const ready = missing.length === 0;

  return NextResponse.json({
    ready,
    timestamp: new Date().toISOString(),
    missing,
    warnings,
    checks: { aster, llm, database },
  });
}
