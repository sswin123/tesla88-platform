import { NextRequest, NextResponse } from 'next/server';
import { getFinanceReport } from '@/lib/repositories/finance_repo';
import { requirePermission } from '@/lib/require_permission';

function getDefaultDates(): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString().split('T')[0];
  const d = new Date(now);
  d.setDate(d.getDate() - 29);
  const start = d.toISOString().split('T')[0];
  return { start, end };
}

// GET /api/finance/reports?start=YYYY-MM-DD&end=YYYY-MM-DD
export async function GET(request: NextRequest) {
  if (!await requirePermission('finance.view')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const defaults = getDefaultDates();
  const start = searchParams.get('start') ?? defaults.start;
  const end = searchParams.get('end') ?? defaults.end;

  // Basic date format validation
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(start) || !datePattern.test(end)) {
    return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD.' }, { status: 400 });
  }

  try {
    const report = await getFinanceReport(start, end);
    return NextResponse.json(report);
  } catch (err) {
    console.error('[finance/reports] DB error:', err);
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}
