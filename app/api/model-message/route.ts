import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

// In-memory storage for model messages (persists during server lifetime)
let modelMessages: any[] = [];

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
      timestamp: Date.now(),
      type: payload.type || 'analysis',
    };

    // Add to memory storage
    modelMessages.unshift(message);
    
    // Keep only last 100 messages
    if (modelMessages.length > 100) {
      modelMessages = modelMessages.slice(0, 100);
    }

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

    return NextResponse.json({
      success: true,
      messages: modelMessages.slice(0, limit),
      count: modelMessages.length,
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

