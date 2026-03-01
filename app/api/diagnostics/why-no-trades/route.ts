/**
 * Why no trades? Returns runner status and last cycle diagnostic.
 * GET /api/diagnostics/why-no-trades
 */

import { NextResponse } from 'next/server';
import { agentRunnerService } from '@/services/ai/agentRunnerService';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = agentRunnerService.getStatus();
    const last = status.lastCycleDiagnostic;

    let strategySummary: Record<string, unknown> = {};
    try {
      const { asterConfig, effectiveTradingConfig, paperPreset } = await import('@/lib/configService');
      strategySummary = {
        simulationMode: asterConfig.trading.simulationMode,
        paperPreset: paperPreset ?? 'none',
        minOpportunityScore: effectiveTradingConfig.minOpportunityScore,
        confidenceThreshold: effectiveTradingConfig.confidenceThreshold,
        maxConcurrentWorkflows: effectiveTradingConfig.maxConcurrentWorkflows,
        maxDailyLossPercent: effectiveTradingConfig.maxDailyLossPercent ?? 0,
        maxDailyLossUsd: effectiveTradingConfig.maxDailyLossUsd ?? 0,
      };
    } catch {
      // config may throw if env is missing
    }

    return NextResponse.json({
      ok: true,
      runner: {
        isRunning: status.isRunning,
        activeWorkflowCount: status.activeWorkflowCount,
        config: {
          intervalMinutes: status.config.intervalMinutes,
          enabled: status.config.enabled,
          symbolsCount: status.config.symbols?.length ?? 0,
        },
      },
      lastCycleDiagnostic: last ?? null,
      strategySummary,
      message: last
        ? last.hadOpportunities
          ? 'Last cycle had opportunities; workflows may be in progress.'
          : last.circuitBreakerTriggered
            ? last.reason ?? 'Circuit breaker triggered.'
            : `No trade: ${last.reason ?? 'all opportunities filtered out'} (score/confidence thresholds: ${last.minScoreUsed}/${(last.confidenceThresholdUsed * 100).toFixed(0)}%).`
        : 'No cycle has run yet; start the agent runner or wait for the next cycle.',
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
