-- Seed 002: 默认收款银行账号
-- 幂等：payment_banks 表为空时才插入，已有记录则跳过

INSERT INTO payment_banks (bank_name, account_number, account_name, is_active, display_order)
SELECT 'Maybank', '1234567890', 'SSWIN88 SDN BHD', TRUE, 1
WHERE NOT EXISTS (SELECT 1 FROM payment_banks LIMIT 1);

INSERT INTO payment_banks (bank_name, account_number, account_name, is_active, display_order)
SELECT 'CIMB Bank', '0987654321', 'SSWIN88 SDN BHD', TRUE, 2
WHERE NOT EXISTS (SELECT 1 FROM payment_banks WHERE bank_name = 'CIMB Bank');
