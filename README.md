# Telegram 会员系统 — v1.0.0

Python · Aiogram 3.13.1 · PostgreSQL 14 · Docker Compose

---

## 功能概览

### 用户端
- 对话式注册（电话 → 银行选择 → 账号 → 姓名），每步可返回
- 注册成功立即显示主菜单，无需 /start
- 查看个人资料（电话、银行、账号、姓名、注册时间）
- 游戏账号自助领取（每个 Provider 限领一个）
- 游戏账号自助更换（含冷却时间限制）
- 联系客服直接跳转 Telegram 链接

### 管理员端
- 三级权限：SUPER_ADMIN / ADMIN / CS
- 会员查询（电话 / 银行账号 / 用户ID）
- 系统统计（账号库存 + 会员总数）
- 游戏账号库存管理（导入 / 停用 / 启用）
- 冻结 / 解冻会员
- 修改会员银行资料
- 管理员增删

---

## 快速部署

### 1. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入所有必填项
```

### 2. 启动

```bash
docker compose up -d --build
```

### 3. 查看日志

```bash
docker compose logs -f app
```

### 4. 停止

```bash
docker compose down          # 保留数据
docker compose down -v       # 删除数据（重置 DB）
```

---

## 环境变量

复制 `.env.example` 并填写：

| 变量 | 必填 | 说明 |
|------|:----:|------|
| `BOT_TOKEN` | ✅ | BotFather 获取的 Bot Token |
| `SUPER_ADMIN_ID` | ✅ | 超级管理员的 Telegram User ID |
| `POSTGRES_HOST` | ✅ | Docker 内固定填 `db` |
| `POSTGRES_PORT` | ✅ | 固定 `5432` |
| `POSTGRES_DB` | ✅ | 数据库名，如 `member_bot` |
| `POSTGRES_USER` | ✅ | 数据库用户名 |
| `POSTGRES_PASSWORD` | ✅ | 数据库密码 |
| `CS_USERNAME` | ✅ | 客服 Telegram 用户名（不含 @） |
| `ACCOUNT_CHANGE_COOLDOWN_HOURS` | ✅ | 更换账号冷却时间（小时），如 `24` |

---

## 管理员命令

### 查询类（ALL）
| 命令 | 说明 |
|------|------|
| `/search_user <用户ID>` | 按内部 ID 查询会员 |
| `/search_phone <电话>` | 按电话查询会员 |
| `/search_bank <银行账号>` | 按银行账号查询会员 |
| `/stats` | 会员总数统计 |
| `/account_stats` | 游戏账号库存统计 |

### 账号管理（SUPER_ADMIN）
| 命令 | 说明 |
|------|------|
| `/import_accounts` | 上传 CSV 导入游戏账号 |
| `/disable_account <Provider> <username>` | 停用指定账号 |
| `/enable_account <Provider> <username>` | 启用已停用账号 |

### 会员管理（SUPER_ADMIN）
| 命令 | 说明 |
|------|------|
| `/freeze_user <用户ID>` | 冻结会员 |
| `/unfreeze_user <用户ID>` | 解冻会员 |
| `/update_bank <用户ID>` | 修改银行资料（FSM 对话） |

### 系统管理（SUPER_ADMIN）
| 命令 | 说明 |
|------|------|
| `/add_admin <TG_ID> [ADMIN\|CS]` | 新增管理员 |
| `/remove_admin <TG_ID>` | 移除管理员 |
| `/list_admins` | 查看所有管理员 |
| `/import_free_list` | 上传免费名单 CSV |

---

## CSV 格式

### 游戏账号导入（/import_accounts）
```csv
username,password
player001,Pass@001
player002,Pass@002
```

### 免费名单导入（/import_free_list）
```csv
phone
60123456789
60123456788
```

---

## 支持的游戏平台（Provider）

`918Kiss` · `Mega888` · `Pussy888` · `Newtown` · `Ace333` · `Live22`

---

## 测试

```bash
pytest tests/ -v
```

---

## 开发环境（不使用 Docker）

```bash
pip install -r requirements.txt
# 启动本地 PostgreSQL 并初始化 schema
psql -U postgres -d member_bot -f database.sql
# .env 中设置 POSTGRES_HOST=localhost
python -m bot.main
```
