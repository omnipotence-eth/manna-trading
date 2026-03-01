/**
 * Simulation Mode API
 * Provides endpoints for simulation trading data
 */

import { NextRequest, NextResponse } from 'next/server';
import { simulationService } from '@/services/trading/simulationService';
import { asterConfig } from '@/lib/configService';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/simulation
 * Get simulation status, balance, trades, and statistics
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    switch (action) {
      case 'status':
        return NextResponse.json({
          success: true,
          data: {
            simulationMode: asterConfig.trading.simulationMode,
            balance: simulationService.getBalance(),
            accountValue: simulationService.getAccountValue(),
            positions: simulationService.getPositions(),
            stats: simulationService.getStats()
          }
        });

      case 'trades':
        return NextResponse.json({
          success: true,
          data: {
            trades: simulationService.getTrades(),
            stats: simulationService.getStats()
          }
        });

      case 'positions':
        // Update positions with current prices
        await simulationService.updatePositions();
        return NextResponse.json({
          success: true,
          data: {
            positions: simulationService.getPositions(),
            accountValue: simulationService.getAccountValue()
          }
        });

      case 'stats':
        await simulationService.updatePositions();
        return NextResponse.json({
          success: true,
          data: simulationService.getStats()
        });

      default:
        return NextResponse.json({
          success: true,
          data: {
            simulationMode: asterConfig.trading.simulationMode,
            balance: simulationService.getBalance(),
            accountValue: simulationService.getAccountValue(),
            stats: simulationService.getStats(),
            endpoints: [
              'GET /api/simulation?action=status',
              'GET /api/simulation?action=trades',
              'GET /api/simulation?action=positions',
              'GET /api/simulation?action=stats',
              'POST /api/simulation?action=reset'
            ]
          }
        });
    }
  } catch (error) {
    logger.error('[ERROR] Simulation API error', error instanceof Error ? error : new Error(String(error)), {
      context: 'SimulationAPI',
      action: 'GET'
    });
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch simulation data'
    }, { status: 500 });
  }
}

/**
 * POST /api/simulation
 * Reset simulation or close positions
 */
export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    const body = action === 'close' ? await request.json() : null;

    switch (action) {
      case 'reset':
        simulationService.reset();
        return NextResponse.json({
          success: true,
          message: 'Simulation reset successfully',
          data: {
            balance: simulationService.getBalance(),
            stats: simulationService.getStats()
          }
        });

      case 'close':
        if (!body || !body.symbol || !body.side) {
          return NextResponse.json({
            success: false,
            error: 'Missing symbol or side parameter'
          }, { status: 400 });
        }

        const closedTrade = await simulationService.closePosition(
          body.symbol,
          body.side,
          body.reason || 'Manual Close'
        );

        if (closedTrade) {
          return NextResponse.json({
            success: true,
            message: 'Position closed successfully',
            data: { trade: closedTrade }
          });
        } else {
          return NextResponse.json({
            success: false,
            error: 'Position not found or could not be closed'
          }, { status: 404 });
        }

      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action'
        }, { status: 400 });
    }
  } catch (error) {
    logger.error('[ERROR] Simulation API POST error', error instanceof Error ? error : new Error(String(error)), {
      context: 'SimulationAPI',
      action: 'POST'
    });
    return NextResponse.json({
      success: false,
      error: 'Failed to process simulation action'
    }, { status: 500 });
  }
}

