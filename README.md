# Telegram 会员注册系统 — Phase 1

Python · Aiogram 3 · PostgreSQL 14 · Docker

## 功能

- 用户注册（FSM 对话式，电话 → 银行 → 账号 → 姓名）
- 电话号码自动标准化（0xx / 60xx / +60xx → 60xx）
- 免费名单自动匹配（eligible_free_credit）
- 管理员三级权限（SUPER_ADMIN / ADMIN / CS）
- CSV 批量导入（Bot 上传 + CLI 两种方式）

## 快速部署

### 1. 克隆并配置环境

```bash
cp .env.example .env
# 编辑 .env，填入 BOT_TOKEN、SUPER_ADMIN_ID 和数据库密码
```

### 2. 启动

```bash
docker compose up -d --build
```

### 3. 查看日志

```bash
docker compose logs -f app
```

## 管理员指令

| 指令 | 权限 | 说明 |
|---|---|---|
| `/search_phone <号码>` | ALL | 查询会员 |
| `/search_bank <账号>` | ALL | 查询会员 |
| `/search_user <用户ID>` | ALL | 查询会员 |
| `/stats` | ALL | 系统统计 |
| `/list_admins` | SUPER_ADMIN, ADMIN | 管理员列表 |
| `/add_admin <id> [ADMIN\|CS]` | SUPER_ADMIN | 新增管理员 |
| `/remove_admin <id>` | SUPER_ADMIN | 移除管理员 |
| `/freeze_user <id>` | SUPER_ADMIN | 冻结会员 |
| `/unfreeze_user <id>` | SUPER_ADMIN | 解冻会员 |
| `/update_bank <id>` | SUPER_ADMIN | 修改银行资料 |
| `/import_free_list` | SUPER_ADMIN | 上传免费名单 CSV |

## CLI 批量导入

```bash
# 本地运行
python scripts/import_free_list.py free_list.csv

# Docker 容器内
docker exec -i $(docker compose ps -q app) python scripts/import_free_list.py free_list.csv
```

### CSV 格式

```csv
phone
60123456789
60123456788
```

## 开发环境（无 Docker）

```bash
pip install -r requirements.txt
# 启动本地 PostgreSQL，执行 database.sql
psql -U postgres -d member_bot -f database.sql
# 复制并编辑 .env（POSTGRES_HOST=localhost）
cp .env.example .env
python -m bot.main
```

## 测试

```bash
pytest tests/ -v
```

## 数据库扩展说明

`users` 表已预留 Phase 2–5 字段：

| 字段 | 用途 |
|---|---|
| `total_deposit` | Phase 3 充值统计 |
| `total_withdraw` | Phase 5 出款统计 |
| `net_deposit` | 自动计算（Generated Column） |
| `referral_code` | Phase 2 推荐码 |
| `referral_count` | Phase 2 推荐人数 |
| `referred_by` | Phase 2 推荐来源 |
