import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { db } from '@/lib/db';

/**
 * POST /api/model-message - Add a model message (from backend)
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    const message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      model: payload.model || 'Godspeed',
      message: payload.message,
      timestamp: new Date().toISOString(),
      type: payload.type || 'analysis',
    };

    // Save to database
    await db.execute(
      `INSERT INTO model_messages (id, model, message, timestamp, type) 
       VALUES (?, ?, ?, ?, ?)`,
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
  } catch (error: any) {
    logger.error('Failed to add model message', error, { context: 'ModelMessageAPI' });
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Unknown error',
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

    // Fetch from database
    const result = await db.execute(
      `SELECT * FROM model_messages ORDER BY timestamp DESC LIMIT $1`,
      [limit]
    );

    const messages = result.rows.map((row: any) => ({
      id: row.id,
      model: row.model,
      message: row.message,
      timestamp: new Date(row.timestamp).getTime(), // Convert back to timestamp for frontend
      type: row.type,
    }));

    logger.debug(`📨 Fetched ${messages.length} model messages`, { context: 'ModelMessageAPI' });

    return NextResponse.json({
      success: true,
      messages,
      count: messages.length,
    });
  } catch (error: any) {
    logger.error('Failed to get model messages', error, { context: 'ModelMessageAPI' });
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}

