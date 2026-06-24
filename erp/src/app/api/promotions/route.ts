import { NextRequest, NextResponse } from 'next/server';
import { getAllPromotions, getActivePromotions, createPromotion } from '@/lib/repositories/promotion_repo';

export async function GET(request: NextRequest) {
  const active = request.nextUrl.searchParams.get('active');
  const promotions = active === 'true'
    ? await getActivePromotions()
    : await getAllPromotions();
  return NextResponse.json(promotions);
}

export async function POST(request: NextRequest) {
  let body: {
    name?: string;
    description?: string | null;
    promotion_type?: string;
    bonus_type?: string;
    bonus_value?: number;
    min_deposit?: number;
    max_bonus?: number | null;
    turnover_multiplier?: number;
    turnover_type?: string;
    allowed_games?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const required = ['name', 'promotion_type', 'bonus_type', 'bonus_value',
                    'min_deposit', 'turnover_multiplier', 'turnover_type', 'allowed_games'];
  const missing = required.filter((k) => body[k as keyof typeof body] === undefined);
  if (missing.length > 0) {
    return NextResponse.json({ error: `Missing fields: ${missing.join(', ')}` }, { status: 400 });
  }

  const promo = await createPromotion({
    name:                body.name!,
    description:         body.description ?? null,
    promotion_type:      body.promotion_type!,
    bonus_type:          body.bonus_type!,
    bonus_value:         body.bonus_value!,
    min_deposit:         body.min_deposit!,
    max_bonus:           body.max_bonus ?? null,
    turnover_multiplier: body.turnover_multiplier!,
    turnover_type:       body.turnover_type!,
    allowed_games:       body.allowed_games!,
  });
  return NextResponse.json(promo, { status: 201 });
}
