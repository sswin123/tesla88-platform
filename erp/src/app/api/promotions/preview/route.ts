import { NextRequest, NextResponse } from 'next/server';

function calcBonus(
  deposit: number,
  bonusType: string,
  bonusValue: number,
  maxBonus: number | null,
  turnoverMultiplier: number,
  turnoverType: string
): { bonus: number; total: number; turnover: number } {
  let bonus = bonusType === 'PERCENTAGE'
    ? deposit * (bonusValue / 100)
    : bonusValue;
  if (maxBonus !== null && bonus > maxBonus) bonus = maxBonus;
  bonus    = Math.round(bonus * 100) / 100;
  const total   = deposit + bonus;
  const base    = turnoverType === 'DEPOSIT' ? deposit : bonus;
  const turnover = Math.round(base * turnoverMultiplier * 100) / 100;
  return { bonus, total, turnover };
}

export async function POST(request: NextRequest) {
  let body: {
    deposit?: number;
    bonus_type?: string;
    bonus_value?: number;
    max_bonus?: number | null;
    turnover_multiplier?: number;
    turnover_type?: string;
  };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { deposit, bonus_type, bonus_value, max_bonus, turnover_multiplier, turnover_type } = body;
  if (deposit == null || !bonus_type || bonus_value == null || turnover_multiplier == null || !turnover_type) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const result = calcBonus(deposit, bonus_type, bonus_value, max_bonus ?? null, turnover_multiplier, turnover_type);
  return NextResponse.json(result);
}
