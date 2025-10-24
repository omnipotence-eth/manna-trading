import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Test database connection
    const { Pool } = await import('pg');
    
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });

    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    await pool.end();

    return NextResponse.json({ 
      success: true, 
      message: 'Database connection successful',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Database connection failed:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
