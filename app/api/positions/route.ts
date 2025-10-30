/**
 * Positions API
 * Manage and monitor open trading positions
 */

import { NextRequest, NextResponse } from 'next/server';
import { positionMonitorService } from '@/services/positionMonitorService';
import { logger } from '@/lib/logger';

/**
 * GET /api/positions
 * Get all open positions or position status
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const positionId = searchParams.get('positionId');

    // Get specific position
    if (positionId) {
      const position = positionMonitorService.getPosition(positionId);
      
      if (!position) {
        return NextResponse.json({
          success: false,
          error: 'Position not found'
        }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        data: position
      });
    }

    // Get monitor status
    if (action === 'status') {
      const status = positionMonitorService.getStatus();
      return NextResponse.json({
        success: true,
        data: status
      });
    }

    // Get all open positions (default)
    const positions = positionMonitorService.getOpenPositions();
    
    logger.debug('Fetched open positions', {
      context: 'PositionsAPI',
      data: { count: positions.length }
    });

    return NextResponse.json({
      success: true,
      data: positions,
      count: positions.length
    });

  } catch (error) {
    logger.error('Failed to fetch positions', error, { context: 'PositionsAPI' });
    
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch positions',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * POST /api/positions
 * Perform actions on positions (close, partial close, set trailing stop)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, positionId, percent } = body;

    if (!positionId) {
      return NextResponse.json({
        success: false,
        error: 'Position ID is required'
      }, { status: 400 });
    }

    const position = positionMonitorService.getPosition(positionId);
    if (!position) {
      return NextResponse.json({
        success: false,
        error: 'Position not found'
      }, { status: 404 });
    }

    switch (action) {
      case 'set-trailing-stop':
        if (typeof percent !== 'number' || percent <= 0 || percent > 100) {
          return NextResponse.json({
            success: false,
            error: 'Invalid trailing stop percent (must be 0-100)'
          }, { status: 400 });
        }

        const trailingStopSet = await positionMonitorService.setTrailingStop(positionId, percent);
        
        logger.info('Trailing stop updated', {
          context: 'PositionsAPI',
          data: { positionId, percent }
        });

        return NextResponse.json({
          success: true,
          message: `Trailing stop set to ${percent}%`,
          data: { positionId, trailingStopPercent: percent }
        });

      case 'partial-close':
        if (typeof percent !== 'number' || percent <= 0 || percent > 100) {
          return NextResponse.json({
            success: false,
            error: 'Invalid close percent (must be 0-100)'
          }, { status: 400 });
        }

        const partialClosedSuccess = await positionMonitorService.partialClose(positionId, percent);
        
        if (!partialClosedSuccess) {
          return NextResponse.json({
            success: false,
            error: 'Failed to partially close position'
          }, { status: 500 });
        }

        logger.info('Position partially closed', {
          context: 'PositionsAPI',
          data: { positionId, percent }
        });

        return NextResponse.json({
          success: true,
          message: `${percent}% of position closed`,
          data: { positionId, closedPercent: percent }
        });

      case 'force-close':
        // Force close 100% of the position immediately
        const forceClosedSuccess = await positionMonitorService.forceClose(positionId);
        
        if (!forceClosedSuccess) {
          return NextResponse.json({
            success: false,
            error: 'Failed to force close position'
          }, { status: 500 });
        }

        logger.info('Position force closed', {
          context: 'PositionsAPI',
          data: { positionId, action: 'force-close' }
        });

        return NextResponse.json({
          success: true,
          message: 'Position force closed successfully',
          data: { positionId, closedPercent: 100 }
        });

      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action'
        }, { status: 400 });
    }

  } catch (error) {
    logger.error('Failed to perform position action', error, { context: 'PositionsAPI' });
    
    return NextResponse.json({
      success: false,
      error: 'Failed to perform position action',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

