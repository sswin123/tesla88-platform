-- Seed 001: ERP 超级管理员账号
-- 幂等：erp_username 已存在则跳过，不覆盖已有密码
-- 密码: Admin@1234（bcryptjs rounds=10）

-- 步骤 1: 若存在 SUPER_ADMIN 但没有 ERP 登录密码 → 设置默认凭据
UPDATE admins
SET erp_username      = 'superadmin',
    erp_password_hash = '$2a$10$.9RMMQbYYCzutQeudYGYge3M09k0EpttsTJ1GkN34dt0MN/uxON7C',
    display_name      = 'Super Admin',
    is_active         = TRUE
WHERE role = 'SUPER_ADMIN'
  AND erp_username IS NULL;

-- 步骤 2: 若全新数据库（没有任何 SUPER_ADMIN 行），创建独立 ERP 账号
INSERT INTO admins (telegram_id, erp_username, erp_password_hash, display_name, role, is_active)
SELECT 0, 'superadmin', '$2a$10$.9RMMQbYYCzutQeudYGYge3M09k0EpttsTJ1GkN34dt0MN/uxON7C', 'Super Admin', 'SUPER_ADMIN', TRUE
WHERE NOT EXISTS (SELECT 1 FROM admins WHERE erp_username = 'superadmin');
