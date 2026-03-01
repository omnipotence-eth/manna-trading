import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { db } from '@/lib/db';

/**
 * POST /api/model-message - Add a model message OR delete old messages
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    // Handle delete action
    if (payload.action === 'delete-old') {
      const hoursAgo = payload.hoursAgo || 1;
      const cutoffTime = new Date(Date.now() - (hoursAgo * 60 * 60 * 1000)).toISOString();
      
      const result = await db.execute(
        `DELETE FROM model_messages WHERE timestamp < $1`,
        [cutoffTime]
      );

      logger.info(`[CLEANUP] Deleted old model messages`, {
        context: 'ModelMessageAPI',
        data: { cutoffTime, deleted: result.rowCount || 0 }
      });

      return NextResponse.json({
        success: true,
        deleted: result.rowCount || 0,
        message: `Deleted messages older than ${hoursAgo} hour(s)`
      });
    }

    // Handle add message (existing logic)
    const message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      model: payload.model || 'Godspeed',
      message: payload.message,
      timestamp: new Date().toISOString(),
      type: payload.type || 'analysis',
    };

    // Save to database (PostgreSQL uses $1, $2, etc. for parameters)
    await db.execute(
      `INSERT INTO model_messages (id, model, message, timestamp, type) 
       VALUES ($1, $2, $3, $4, $5)`,
      [message.id, message.model, message.message, message.timestamp, message.type]
    );

    logger.info(`💬 Model message added: ${message.model}`, {
      context: 'ModelMessageAPI',
      data: { type: message.type, messageLength: message.message.length },
    });

    return NextResponse.json({
      success: true,
      message: 'Model message added',
      messageId: message.id,
    });
  } catch (error) {
    logger.error('Failed to add model message', error, { context: 'ModelMessageAPI' });
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/model-message - Get recent model messages
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50;
    // FIXED: Default to 7 days (168 hours) instead of 1 hour to prevent old chat logs
    const hoursAgo = searchParams.get('hoursAgo') ? parseInt(searchParams.get('hoursAgo')!) : 168; // Default: last 7 days

    // ENTERPRISE FIX: Filter messages by time range to prevent old messages from appearing
    const cutoffTime = new Date(Date.now() - (hoursAgo * 60 * 60 * 1000)).toISOString();

    // Fetch recent messages from database (only last N hours)
    const result = await db.execute(
      `SELECT * FROM model_messages 
       WHERE timestamp >= $1 
       ORDER BY timestamp DESC 
       LIMIT $2`,
      [cutoffTime, limit]
    );

    interface MessageRow {
      id: string;
      model: string;
      message: string;
      timestamp: Date | string;
      type: string;
    }

    const messages = result.rows.map((row: MessageRow) => ({
      id: row.id,
      model: row.model,
      message: row.message,
      timestamp: new Date(row.timestamp).getTime(), // Convert back to timestamp for frontend
      type: row.type,
    }));

    logger.debug(`📨 Fetched ${messages.length} model messages (last ${hoursAgo} hour(s))`, { 
      context: 'ModelMessageAPI',
      data: { cutoffTime, limit, messagesCount: messages.length }
    });

    const response = NextResponse.json({
      success: true,
      messages,
      count: messages.length,
      filteredBy: `last ${hoursAgo} hour(s)`,
    });
    
    // ENTERPRISE: Add cache headers for fresh data
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('X-Timestamp', Date.now().toString());
    
    return response;
  } catch (error: unknown) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    logger.error('Failed to get model messages', errorObj, { context: 'ModelMessageAPI' });
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

