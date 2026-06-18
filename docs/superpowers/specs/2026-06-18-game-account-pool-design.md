# Game Account Pool System — Phase 1 设计文档

**日期：** 2026-06-18
**范围：** Phase 1 扩展 — 游戏账号池管理 + 用户自助领取/更换
**技术栈：** Python · Aiogram 3.x · asyncpg · PostgreSQL · Docker

---

## 1. 系统概述

游戏平台账号由运营预先准备，系统负责：

- 账号池导入（管理员 CSV 上传）
- 账号自助领取（用户自行操作）
- 账号自助更换（用户自行操作，有频率限制）
- 账号停用/启用（管理员操作）
- 账号库存查看（管理员操作）

**设计原则：** 用户自助完成日常操作，管理员只负责维护账号池。

---

## 2. Provider 列表（集中管理）

所有涉及 Provider 的代码统一引用此常量，避免散落多个文件：

```python
# bot/constants.py
PROVIDERS = [
    "918Kiss",
    "Mega888",
    "Pussy888",
    "Newtown",
    "Ace333",
    "Live22",
]
```

新增 Provider 只需修改此一处。

---

## 3. 数据库设计

### 3.1 `users` 表变更（Migration）

新增 `total_bonus` 字段，用于客服查询显示：

```sql
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS total_bonus NUMERIC(15,2) DEFAULT 0.00;
```

完整财务字段：
- `total_deposit` — 总充值（Phase 3 更新）
- `total_withdraw` — 总提款（Phase 5 更新）
- `total_bonus` — 总优惠（Phase 4 更新）
- `net_deposit` — `GENERATED ALWAYS AS (total_deposit - total_withdraw) STORED`

### 3.2 `account_pool` 表（新建）

```sql
CREATE TABLE IF NOT EXISTS account_pool (
    id               SERIAL PRIMARY KEY,
    provider         VARCHAR(20)  NOT NULL
                     CHECK (provider IN ('918Kiss','Mega888','Pussy888','Newtown','Ace333','Live22')),
    username         VARCHAR(100) NOT NULL,
    password         VARCHAR(100) NOT NULL,
    status           VARCHAR(10)  NOT NULL DEFAULT 'AVAILABLE'
                     CHECK (status IN ('AVAILABLE','ASSIGNED','DISABLED')),
    assigned_user_id INTEGER      REFERENCES users(id),
    assigned_at      TIMESTAMPTZ,
    note             VARCHAR(255),
    created_at       TIMESTAMPTZ  DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE(provider, username)
);

CREATE INDEX IF NOT EXISTS idx_account_pool_provider_status
    ON account_pool(provider, status);

DROP TRIGGER IF EXISTS trg_account_pool_updated_at ON account_pool;
CREATE TRIGGER trg_account_pool_updated_at
    BEFORE UPDATE ON account_pool
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

**字段说明：**
- `status = AVAILABLE` — 可分配
- `status = ASSIGNED` — 已分配给会员
- `status = DISABLED` — 停用，不参与分配
- `note` — 备注（可选，如"VIP专用"）

### 3.3 `user_game_accounts` 表（新建）

```sql
CREATE TABLE IF NOT EXISTS user_game_accounts (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id),
    provider        VARCHAR(20) NOT NULL
                    CHECK (provider IN ('918Kiss','Mega888','Pussy888','Newtown','Ace333','Live22')),
    account_pool_id INTEGER NOT NULL REFERENCES account_pool(id),
    assigned_at     TIMESTAMPTZ DEFAULT NOW(),
    assigned_by     BIGINT,          -- NULL = 用户自助；admin telegram_id = 管理员操作
    last_changed_at TIMESTAMPTZ DEFAULT NOW(),  -- 换号冷却限制基准
    UNIQUE(user_id, provider)        -- 同一 Provider 同时只能拥有一个账号
);

CREATE INDEX IF NOT EXISTS idx_uga_user_id ON user_game_accounts(user_id);
```

---

## 4. 环境变量新增

```env
# 联系客服 Telegram 用户名（不含 @ 符号）
CS_USERNAME=yourcs

# 换号冷却时间（小时）：24 = 每天一次，168 = 每周一次
ACCOUNT_CHANGE_COOLDOWN_HOURS=24
```

`Config` dataclass 新增：
- `cs_username: str`
- `account_change_cooldown_hours: int`（默认 24）

---

## 5. 用户端功能

### 5.1 主菜单（`/start` 更新）

已注册用户发 `/start` → 显示 `ReplyKeyboardMarkup`（常驻底部）：

```
[ 📋 我的资料 ]  [ 🎮 我的游戏账号 ]
[ 🔄 更换游戏账号 ]  [ 📞 联系客服 ]
```

未注册用户 → 保持现有流程（仅显示注册按钮）。

### 5.2 📋 我的资料

显示会员资料，包含：

```
👤 会员资料

用户ID：#1
Telegram ID：123456789
Username：@yourname
First Name：John
电话号码：60123456789
银行名称：Maybank
银行账号：1234567890
银行户口姓名：John Doe
免费资格：✅ 有资格领取 / ❌ 无资格领取
状态：🟢 ACTIVE

💰 充值统计
总充值：RM 0.00
总提款：RM 0.00
总优惠：RM 0.00
净充值：RM 0.00

📅 注册时间：2026-06-18 13:00:00
```

### 5.3 🎮 我的游戏账号

查询用户的 `user_game_accounts` 记录，同时查询每个 Provider 的 AVAILABLE 库存数量。

**显示规则（每个 Provider 独立区块）：**

| 条件 | 显示 |
|---|---|
| 已领取 | 账号信息 + 三个操作按钮 |
| 未领取 + 有库存 | `[🟢 领取账号]` 按钮 |
| 未领取 + 无库存 | **隐藏**（不显示该 Provider） |

**已领取区块格式：**
```
918Kiss
账号：918001
密码：Aaaa1111
[📋 复制账号]  [📋 复制密码]  [🔄 更换账号]
```

`📋 复制账号` / `📋 复制密码` 使用 Bot API 7.3 `CopyTextButton`，点击直接复制到剪贴板。

**领取流程（`🟢 领取账号` 点击）：**
1. 原子事务：`SELECT ... FOR UPDATE SKIP LOCKED` 取出 AVAILABLE 账号
2. 若成功：
   ```
   ✅ 领取成功

   游戏平台：918Kiss
   账号：918001
   密码：Aaaa1111
   ```
3. 若库存在点击瞬间耗尽（极少）：
   ```
   ⚠️ 当前暂无可用账号，请稍后再试或联系客服。
   ```

### 5.4 🔄 更换游戏账号

1. 显示用户**已拥有**的 Provider InlineKeyboard（只列有账号的）
2. 用户选择 Provider 后：

**冷却检查（`last_changed_at + cooldown > NOW()`）：**
```
❌ 918Kiss 距上次更换不足 24 小时。
请于 {datetime} 后再试。
```

**库存检查（先查后换，有库存才释放旧账号）：**
若无 AVAILABLE → 保留旧账号，显示：
```
⚠️ 当前没有可用的新账号。
您的现有账号保持不变：
账号：918001
密码：Aaaa1111
```

**换号成功（原子事务）：**
```
✅ 更换成功

旧账号：918001
新账号：918025
密码：Aaaa1111

[📋 复制账号]  [📋 复制密码]
```

**换号原子事务步骤：**
1. BEGIN
2. 检查冷却 → 若不符合直接回滚返回错误
3. 查询并锁定新 AVAILABLE 账号（`FOR UPDATE SKIP LOCKED`）→ 若无则回滚
4. 更新旧账号 `status = AVAILABLE`，清除 `assigned_user_id / assigned_at`
5. 更新新账号 `status = ASSIGNED`，写入 `assigned_user_id / assigned_at`
6. 更新 `user_game_accounts`（`account_pool_id`，`last_changed_at = NOW()`）
7. COMMIT

### 5.5 📞 联系客服

```
请联系在线客服：

https://t.me/{cs_username}

[💬 联系客服]  ← url 按钮
```

---

## 6. 管理员功能

### 6.1 权限矩阵（新增指令）

| 指令 | SUPER_ADMIN | ADMIN | CS |
|---|:---:|:---:|:---:|
| `/import_accounts` | ✅ | ❌ | ❌ |
| `/account_stats` | ✅ | ✅ | ❌ |
| `/disable_account <provider> <username>` | ✅ | ❌ | ❌ |
| `/enable_account <provider> <username>` | ✅ | ❌ | ❌ |

`/search_user` 权限不变（SUPER_ADMIN / ADMIN / CS 均可），但输出内容更新。

### 6.2 `/import_accounts`（FSM，SUPER_ADMIN）

1. 发 `/import_accounts` → 显示 6 个 Provider InlineKeyboard
2. 选择 Provider → `请上传 CSV 文件，格式：username,password\n或发送 /cancel 取消。`
3. 上传 CSV → 解析 → bulk 导入（`asyncpg copy_records_to_table` + `ON CONFLICT DO NOTHING`）
4. 回复统计：

```
导入完成 ✅
Provider：918Kiss

总记录：500
新增：498
重复：2
失败：0
```

CSV 格式（无需 provider 列，由步骤 2 选择确定）：
```csv
username,password
918001,Aaaa1111
918002,Aaaa1111
```

### 6.3 `/account_stats`（SUPER_ADMIN / ADMIN）

```
📊 账号库存统计

918Kiss
总账号：500 | 可用：120 | 已分配：370 | 停用：10
状态：🟢 正常

Mega888
总账号：300 | 可用：0 | 已分配：300 | 停用：0
状态：🔴 库存不足

...（6 个 Provider 全部显示）
```

`可用 = 0` → `🔴 库存不足`，否则 `🟢 正常`。

### 6.4 `/disable_account <provider> <username>`（SUPER_ADMIN）

- 账号不存在 → `未找到 {provider} 账号：{username}`
- 已是 DISABLED → `该账号已是停用状态。`
- 当前 AVAILABLE → 直接停用，回复：`✅ 账号已停用：{provider} {username}`
- 当前 ASSIGNED → 显示确认：

```
⚠️ 该账号目前已分配给会员：
User ID：#123 | 电话：60123456789

[✅ 强制停用并解除绑定]  [❌ 取消]
```

强制停用：`account_pool.status = DISABLED`，删除 `user_game_accounts` 对应记录，清除 `account_pool.assigned_user_id`。

### 6.5 `/enable_account <provider> <username>`（SUPER_ADMIN）

- `DISABLED` → `AVAILABLE`，回复：`✅ 账号已恢复可用：{provider} {username}`
- 非 DISABLED → 提示当前状态，无需操作

### 6.6 `/search_user`（更新输出）

会员资料区块后追加游戏账号区块：

```
🎮 游戏平台账号

918Kiss：918001
Mega888：Mega001
Live22：Live001

尚未领取：Pussy888 / Newtown / Ace333
```

财务统计区块更新（新增 total_bonus）：

```
💰 充值统计
总充值：RM 0.00
总提款：RM 0.00
总优惠：RM 0.00
净充值：RM 0.00
```

---

## 7. 文件结构

### 新建文件

```
bot/constants.py                          # PROVIDERS 常量
db/repositories/account_repo.py          # account_pool + user_game_accounts CRUD
bot/handlers/user/game_accounts.py       # 用户端：领取/更换/客服/资料
bot/handlers/admin/import_accounts.py    # /import_accounts FSM
bot/handlers/admin/account_stats.py     # /account_stats
bot/handlers/admin/account_manage.py    # /disable_account + /enable_account
bot/keyboards/game_accounts.py          # Provider 键盘 + 账号卡片 InlineKeyboard
```

### 修改文件

```
database.sql                             # 追加 account_pool / user_game_accounts / total_bonus migration
bot/config.py                           # 新增 cs_username, account_change_cooldown_hours
bot/main.py                             # 注册新路由（5 个 router）
bot/handlers/user/registration.py       # /start 已注册用户显示主菜单（ReplyKeyboard）
bot/handlers/admin/search.py            # search_user 追加游戏账号 + total_bonus
bot/utils/formatters.py                 # 更新 format_user_info（total_bonus + 免费资格文字）
                                         # 新增 format_game_accounts(accounts, all_providers)
```

---

## 8. 关键实现约束

1. **PROVIDERS 常量** — 所有文件从 `bot.constants` 导入，不允许硬编码
2. **`from __future__ import annotations`** — 所有 Python 文件第一行
3. **并发安全** — 分配和换号必须使用 `FOR UPDATE SKIP LOCKED` 事务
4. **换号不释放旧账号** — 若无新账号可用，原子事务回滚，旧账号状态不变
5. **冷却限制独立** — 每个 Provider 的 `last_changed_at` 独立计算，互不影响
6. **密码** — 系统直接保存原始密码字符串，不加密，不提供修改/重置功能
7. **CopyTextButton** — 使用 Bot API 7.3 原生能力，aiogram 3.13.1 已支持
8. **`total_bonus`** — Phase 1 默认 0.00，由 Phase 4 Promotion 模块更新，此处只展示
