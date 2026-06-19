# Phase 1 Final Report

**版本：** v1.0.0  
**日期：** 2026-06-19  
**状态：** PRODUCTION READY

---

## 1. 功能列表

### 用户功能

| 功能 | 状态 | 说明 |
|------|:----:|------|
| 对话式注册 | ✅ | 电话 → 银行 → 账号 → 姓名，每步支持 ⬅️ 返回 |
| 银行选择 | ✅ | 8 大银行 + 6 电子钱包 + Other（自定义） |
| 电话号码标准化 | ✅ | 0xx / 60xx / +60xx → 60xxxxxxxxx |
| 已注册 /start | ✅ | 直接显示主菜单，不重新进入注册 |
| 注册成功主菜单 | ✅ | 注册完成立即显示主菜单 |
| 📋 我的资料 | ✅ | 显示：电话 / 银行 / 账号 / 姓名 / 注册时间 |
| 🎮 我的游戏账号 | ✅ | 显示所有已领取账号 + 可领取 Provider |
| 领取游戏账号 | ✅ | 原子性分配，FOR UPDATE SKIP LOCKED |
| 🔄 更换游戏账号 | ✅ | 有新库存才换，无库存旧账号不释放 |
| 更换冷却时间 | ✅ | 可配置冷却时长（小时） |
| 📞 联系客服 | ✅ | Inline 按钮跳转客服 Telegram |

### 管理员功能

| 功能 | 权限 | 状态 |
|------|------|:----:|
| /search_user | ALL | ✅ |
| /search_phone | ALL | ✅ |
| /search_bank | ALL | ✅ |
| /stats | ALL | ✅ |
| /account_stats | SUPER_ADMIN, ADMIN | ✅ |
| /import_accounts (CSV) | SUPER_ADMIN | ✅ |
| /disable_account | SUPER_ADMIN | ✅ |
| /enable_account | SUPER_ADMIN | ✅ |
| /freeze_user | SUPER_ADMIN | ✅ |
| /unfreeze_user | SUPER_ADMIN | ✅ |
| /update_bank | SUPER_ADMIN | ✅ |
| /add_admin | SUPER_ADMIN | ✅ |
| /remove_admin | SUPER_ADMIN | ✅ |
| /list_admins | SUPER_ADMIN, ADMIN | ✅ |
| /import_free_list | SUPER_ADMIN | ✅ |

---

## 2. 数据库结构

### users

| 列 | 类型 | 说明 |
|----|------|------|
| id | SERIAL PK | 内部用户 ID |
| telegram_id | BIGINT UNIQUE | Telegram User ID |
| telegram_username | VARCHAR(100) | TG 用户名（可空） |
| first_name | VARCHAR(100) | TG 显示名 |
| phone | VARCHAR(20) UNIQUE | 标准化电话（60xxxxxxxxx） |
| bank_name | VARCHAR(100) | 银行名称 |
| bank_account | VARCHAR(50) UNIQUE | 银行账号 |
| bank_holder_name | VARCHAR(100) | 银行户口姓名 |
| eligible_free_credit | BOOLEAN | 是否符合免费资格（内部） |
| status | VARCHAR(10) | ACTIVE / FROZEN |
| total_deposit | NUMERIC(12,2) | 总充值（Phase 2 使用） |
| total_withdraw | NUMERIC(12,2) | 总提款（Phase 2 使用） |
| total_bonus | NUMERIC(12,2) | 总优惠（Phase 2 使用） |
| net_deposit | NUMERIC GENERATED | 净充值 = 总充值 - 总提款 |
| referral_code | VARCHAR(20) | 推荐码（Phase 3 使用） |
| created_at | TIMESTAMPTZ | 注册时间 |

### account_pool

| 列 | 类型 | 说明 |
|----|------|------|
| id | SERIAL PK | |
| provider | VARCHAR(20) | 918Kiss / Mega888 / Pussy888 / Newtown / Ace333 / Live22 |
| username | VARCHAR(100) | 游戏账号 |
| password | VARCHAR(100) | 游戏密码 |
| status | VARCHAR(10) | AVAILABLE / ASSIGNED / DISABLED |
| assigned_user_id | INTEGER FK→users | 当前持有用户 |
| assigned_at | TIMESTAMPTZ | 分配时间 |
| note | VARCHAR(255) | 备注 |

UNIQUE(provider, username)

### user_game_accounts

| 列 | 类型 | 说明 |
|----|------|------|
| id | SERIAL PK | |
| user_id | INTEGER FK→users | |
| provider | VARCHAR(20) | |
| account_pool_id | INTEGER FK→account_pool | 当前分配的账号 |
| assigned_by | INTEGER | 分配操作者（管理员 ID，可空） |
| assigned_at | TIMESTAMPTZ | 首次分配时间 |
| last_changed_at | TIMESTAMPTZ | 最后更换时间（冷却计时用） |

UNIQUE(user_id, provider)

### admins

| 列 | 类型 | 说明 |
|----|------|------|
| id | SERIAL PK | |
| telegram_id | BIGINT UNIQUE | 管理员 Telegram ID |
| role | VARCHAR(20) | SUPER_ADMIN / ADMIN / CS |
| created_at | TIMESTAMPTZ | |

### free_list

| 列 | 类型 | 说明 |
|----|------|------|
| id | SERIAL PK | |
| phone | VARCHAR(20) UNIQUE | 标准化电话 |
| created_at | TIMESTAMPTZ | |

---

## 3. 部署方式

### 前提条件

- Docker Desktop 已安装
- 已从 BotFather 获取 Bot Token
- 已知道自己的 Telegram User ID（通过 @userinfobot 查询）

### 步骤

```bash
# 1. 复制环境变量模板
cp .env.example .env

# 2. 编辑 .env，填入所有必填项
nano .env

# 3. 启动
docker compose up -d --build

# 4. 查看日志确认启动成功
docker compose logs -f app
# 期望日志：Bot starting — polling...

# 5. 验证
# 向 Bot 发送 /start，应显示注册界面
```

### 重置数据库

```bash
docker compose down -v
docker compose up -d --build
```

### 更新 Bot

```bash
git pull
docker compose up -d --build
```

---

## 4. 环境变量说明

| 变量 | 必填 | 示例 | 说明 |
|------|:----:|------|------|
| `BOT_TOKEN` | ✅ | `1234567890:AAFw...` | BotFather 生成 |
| `SUPER_ADMIN_ID` | ✅ | `5831034216` | 超级管理员 Telegram ID |
| `POSTGRES_HOST` | ✅ | `db` | Docker 内固定填 `db` |
| `POSTGRES_PORT` | ✅ | `5432` | PostgreSQL 端口 |
| `POSTGRES_DB` | ✅ | `member_bot` | 数据库名 |
| `POSTGRES_USER` | ✅ | `postgres` | 数据库用户 |
| `POSTGRES_PASSWORD` | ✅ | `changeme` | 数据库密码 |
| `CS_USERNAME` | ✅ | `cs_support` | 客服 TG 用户名（不含 @） |
| `ACCOUNT_CHANGE_COOLDOWN_HOURS` | ✅ | `24` | 更换账号冷却时间（小时） |

---

## 5. 管理员操作手册

### 新建管理员
```
/add_admin <Telegram_ID> ADMIN
/add_admin <Telegram_ID> CS
```

### 导入游戏账号
1. 向 Bot 发送 `/import_accounts`
2. 从弹出键盘选择 Provider（如 918Kiss）
3. 上传 CSV 文件（格式：`username,password`）
4. Bot 回报导入结果：总记录 / 新增 / 重复 / 失败

### 查询会员
```
/search_user 123          ← 按用户 ID
/search_phone 60123456789 ← 按电话
/search_bank 1234567890   ← 按银行账号
```
查询结果包含：个人资料 + 游戏账号 + 充值统计

### 停用游戏账号
```
/disable_account 918Kiss player001
```
- 若账号已分配用户：弹出确认按钮，确认后解绑
- 若账号未分配：直接 DISABLED

### 启用游戏账号
```
/enable_account 918Kiss player001
```
仅限 DISABLED 状态的账号

### 冻结 / 解冻会员
```
/freeze_user 123
/unfreeze_user 123
```

### 修改会员银行资料
```
/update_bank 123
```
进入对话式修改流程

---

## 6. 已知限制

| 限制 | 说明 |
|------|------|
| 每个 Provider 仅限一个账号 | 用户对同一 Provider 只能持有一个游戏账号 |
| 更换账号需库存 | 无可用库存时更换失败，旧账号不释放 |
| 冷却时间全局设置 | 所有 Provider 共用同一冷却时长 |
| Bot Token 需从 BotFather 手动更新 | Token 泄露需立即在 BotFather 重新生成 |
| 无 Webhook 支持 | 当前使用 Long Polling，适合小规模部署 |
| 管理员 ID 只能在 .env 预设一个 SUPER_ADMIN | 其他管理员通过 /add_admin 添加 |

---

## 7. 技术架构

```
┌─────────────────────────────────────────┐
│  Telegram ←→ Bot (Aiogram 3.13.1)       │
│                                         │
│  ┌─────────────┐  ┌──────────────────┐  │
│  │  User       │  │  Admin           │  │
│  │  Handlers   │  │  Handlers        │  │
│  └──────┬──────┘  └────────┬─────────┘  │
│         │                  │            │
│  ┌──────▼──────────────────▼─────────┐  │
│  │  DB Repositories (asyncpg)        │  │
│  │  user_repo / account_repo /       │  │
│  │  admin_repo / free_list_repo      │  │
│  └──────────────────┬────────────────┘  │
│                     │                   │
│  ┌──────────────────▼────────────────┐  │
│  │  PostgreSQL 14                    │  │
│  │  users / account_pool /           │  │
│  │  user_game_accounts / admins /    │  │
│  │  free_list                        │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

**关键设计决策：**
- `FOR UPDATE SKIP LOCKED`：防止并发领取同一账号
- `release_and_reassign` 原子事务：无库存时不释放旧账号
- `IsAdmin` filter 直接查 pool（workflow data），不依赖 middleware 注入
- `from __future__ import annotations`：兼容 Python 3.9.6

---

## 8. Phase 2 Roadmap

基于 Phase 1 完成后的业务需求优先级：

| 优先级 | 功能 | 说明 |
|--------|------|------|
| P1 | **充值申请流程** | 用户提交充值 → 管理员审核 → 上分确认 |
| P1 | **提款申请流程** | 用户提交提款 → 管理员审核 → 扣分确认 |
| P1 | **审核页显示游戏账号** | 充值/提款审核时直接显示对应 Provider 游戏账号（已收到需求）|
| P2 | **Admin 广播消息** | 向全体或指定会员发送公告 |
| P2 | **会员升级体系 (VIP)** | 按净充值自动升级 |
| P3 | **客服工单系统** | 用户提交问题 → Admin 回复 |
| P3 | **推荐奖励** | 推荐码注册奖励（DB 字段已预留） |

---

*Phase 1 冻结于 2026-06-19。代码库状态：FROZEN。*
