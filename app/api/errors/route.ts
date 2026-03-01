import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const reportPath = path.join(process.cwd(), 'logs', 'error-report.json');
    if (!fs.existsSync(reportPath)) {
      return NextResponse.json({ count: 0, errors: [] });
    }

    const raw = fs.readFileSync(reportPath, 'utf-8');
    const errors = JSON.parse(raw || '[]');
    const count = Array.isArray(errors) ? errors.length : 0;

    return NextResponse.json({ count, errors: Array.isArray(errors) ? errors : [] });
  } catch (error) {
    return NextResponse.json({ count: 0, errors: [], error: (error as Error).message }, { status: 500 });
  }
}

