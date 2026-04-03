import { NextRequest, NextResponse } from 'next/server';
import { alpacaService } from '@/services/exchange/alpacaService';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      symbol: string;
      side: 'buy' | 'sell';
      type: 'market' | 'limit' | 'stop' | 'stop_limit';
      qty: number;
      time_in_force?: 'day' | 'gtc' | 'ioc' | 'fok';
      limit_price?: number;
      stop_price?: number;
      extended_hours?: boolean;
    };

    if (!body.symbol || !body.side || !body.type || !body.qty) {
      return NextResponse.json(
        { success: false, error: 'symbol, side, type, and qty are required' },
        { status: 422 }
      );
    }

    const order = await alpacaService.placeOrder({
      symbol: body.symbol.toUpperCase(),
      side: body.side,
      type: body.type,
      qty: body.qty,
      time_in_force: body.time_in_force ?? 'day',
      limit_price: body.limit_price,
      stop_price: body.stop_price,
      extended_hours: body.extended_hours,
    });

    return NextResponse.json({ success: true, order });
  } catch (error) {
    logger.error('Alpaca order placement failed', error as Error, { context: 'AlpacaOrderRoute' });
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Order failed' },
      { status: 503 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get('symbol');
    const orderId = searchParams.get('orderId');

    if (orderId) {
      await alpacaService.cancelOrder(orderId);
      return NextResponse.json({ success: true, message: `Order ${orderId} cancelled` });
    }

    if (symbol) {
      const order = await alpacaService.closePosition(symbol.toUpperCase());
      return NextResponse.json({ success: true, order });
    }

    return NextResponse.json(
      { success: false, error: 'Provide symbol (close position) or orderId (cancel order)' },
      { status: 422 }
    );
  } catch (error) {
    logger.error('Alpaca order/position close failed', error as Error, { context: 'AlpacaOrderRoute' });
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Operation failed' },
      { status: 503 }
    );
  }
}
