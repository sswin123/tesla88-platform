-- Seed 006: 默认优惠活动
-- 幂等：promotions 表为空时才插入

INSERT INTO promotions (name, description, promotion_type, bonus_type, bonus_value, min_deposit, max_bonus, turnover_multiplier, turnover_type, is_active)
SELECT
  '新会员首存优惠',
  '新会员首次存款享 100% 赠红，最高 RM 500。有效流水要求：赠红 x3。',
  'FIRST_DEPOSIT',
  'PERCENTAGE',
  100.00,
  30.00,
  500.00,
  3.00,
  'BONUS',
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM promotions WHERE name = '新会员首存优惠');

INSERT INTO promotions (name, description, promotion_type, bonus_type, bonus_value, min_deposit, max_bonus, turnover_multiplier, turnover_type, is_active)
SELECT
  '每日签到优惠',
  '每日存款满 RM 50 即享 5% 赠红，最高 RM 100。',
  'DAILY',
  'PERCENTAGE',
  5.00,
  50.00,
  100.00,
  2.00,
  'BONUS',
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM promotions WHERE name = '每日签到优惠');
