import { NextRequest, NextResponse } from 'next/server';
import { getAllBanks, createBank } from '@/lib/repositories/bank_repo';

export async function GET() {
  const banks = await getAllBanks();
  return NextResponse.json(banks);
}

export async function POST(request: NextRequest) {
  let body: { bank_name?: string; account_number?: string; account_holder?: string; sort_order?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.bank_name || !body.account_number || !body.account_holder) {
    return NextResponse.json(
      { error: 'bank_name, account_number, account_holder are required' },
      { status: 400 }
    );
  }

  const bank = await createBank({
    bank_name:      body.bank_name,
    account_number: body.account_number,
    account_holder: body.account_holder,
    sort_order:     body.sort_order,
  });
  return NextResponse.json(bank, { status: 201 });
}
