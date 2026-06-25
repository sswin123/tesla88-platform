import { NextRequest, NextResponse } from 'next/server';
import { getAllBanks, createBank } from '@/lib/repositories/bank_repo';

export async function GET() {
  const banks = await getAllBanks();
  return NextResponse.json(banks);
}

export async function POST(request: NextRequest) {
  let body: { bank_name?: string; account_number?: string; account_name?: string; qr_image?: string | null; display_order?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.bank_name || !body.account_number || !body.account_name) {
    return NextResponse.json(
      { error: 'bank_name, account_number, account_name are required' },
      { status: 400 }
    );
  }

  const bank = await createBank({
    bank_name:      body.bank_name,
    account_number: body.account_number,
    account_name:   body.account_name,
    qr_image:       body.qr_image,
    display_order:  body.display_order,
  });
  return NextResponse.json(bank, { status: 201 });
}
