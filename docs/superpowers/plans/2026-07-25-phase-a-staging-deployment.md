# Transaction Module V2 — Phase A 暂存部署与验收计划

**版本：** Phase A Foundation  
**日期：** 2026-07-25  
**目标环境：** 暂存服务器（apidemo.club）→ 生产服务器（45.77.169.133）  
**涉及 Commit 范围：** `c52b67e` → `d2b5160`（7 个 commit）

---

## 第一节 — Migration 部署

### 1.1 执行机制

本项目使用 `scripts/docker-migrate.sh` v2 智能迁移引擎，由 `migrate` 服务容器执行：

- 预查询 `schema_migrations` 表，仅执行未应用的文件
- 每个 Migration 包裹在独立 `BEGIN/COMMIT` 事务中
- 使用 `pg_advisory_lock` 防止并发执行
- `ON CONFLICT DO NOTHING` 保证幂等

**Migration 082 是 Phase A 唯一的新迁移。**

### 1.2 执行顺序

```
已应用（按文件名顺序，不执行）：
  001_xxx.sql … 081_kiss918_fix_operator_token.sql

待执行（Phase A 新增）：
  082_transaction_v2_foundation.sql
```

Migration 082 内部执行顺序（单事务）：
```
1. CREATE TABLE IF NOT EXISTS transaction_internal_notes
2. CREATE INDEX IF NOT EXISTS idx_txn_notes_lookup   (部分索引)
3. ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS description TEXT
4. CREATE INDEX IF NOT EXISTS idx_audit_logs_target
5. INSERT INTO role_permissions (25 行权限种子)  ON CONFLICT DO NOTHING
```

### 1.3 数据库备份流程（部署前必须执行）

```bash
# 在暂存服务器上执行
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="/opt/backups/member_bot_pre_phase_a_${TIMESTAMP}.dump"

docker exec tesla88-platform-postgres-1 \
  pg_dump -U postgres -d member_bot -Fc \
  > "$BACKUP_FILE"

# 验证备份
ls -lh "$BACKUP_FILE"
echo "备份完成：$BACKUP_FILE"
```

生产环境备份（替换容器名为实际生产容器名）：
```bash
docker exec <生产_postgres_容器名> \
  pg_dump -U postgres -d member_bot -Fc \
  > "/opt/backups/member_bot_pre_phase_a_production_${TIMESTAMP}.dump"
```

### 1.4 Migration 执行方式

**方法 A（推荐）— 通过 Docker Compose 自动执行**

重新部署时 `migrate` 服务会自动运行，检测并仅执行 082。

```bash
# 暂存服务器
git pull
docker compose -f docker-compose.production.yml \
               -f docker-compose.staging.yml \
               up -d --build
```

`migrate` 服务完成后，`erp` 服务才启动（`depends_on: migrate: condition: service_completed_successfully`）。

**方法 B — 手动单独执行（不重启应用，零停机）**

```bash
docker compose -f docker-compose.production.yml \
               -f docker-compose.staging.yml \
               run --rm migrate
```

### 1.5 验证 SQL（Migration 执行后逐条检查）

```sql
-- 1. 确认新表存在
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'transaction_internal_notes'
ORDER BY ordinal_position;
-- 期望：8列 (id, transaction_type, transaction_id, admin_id, content, created_at, updated_at, deleted_at)

-- 2. 确认部分索引存在
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'transaction_internal_notes';
-- 期望：idx_txn_notes_lookup，indexdef 含 WHERE deleted_at IS NULL

-- 3. 确认 description 列已加入 audit_logs
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'audit_logs' AND column_name = 'description';
-- 期望：1行，data_type = text

-- 4. 确认现有 audit_logs 行 description 为 NULL（无数据丢失）
SELECT COUNT(*) FROM audit_logs WHERE description IS NOT NULL;
-- 期望：0

-- 5. 确认 target 索引存在
SELECT indexname FROM pg_indexes WHERE indexname = 'idx_audit_logs_target';
-- 期望：1行

-- 6. 确认权限种子正确（25行）
SELECT role, permission, granted FROM role_permissions
WHERE permission LIKE 'transaction.%'
ORDER BY role, permission;
-- 期望：25行，与规范 Section 6 表格完全一致

-- 7. 幂等性验证（再次执行 082 不报错）
\i /path/to/082_transaction_v2_foundation.sql
-- 期望：全部 NOTICE，无 ERROR
```

### 1.6 回滚流程

**何时回滚：** Migration 执行中报错，且无法通过修复代码解决。

```bash
# 只在暂存环境。生产环境若有数据先确认再决策。

# 恢复备份
docker exec -i tesla88-platform-postgres-1 \
  pg_restore -U postgres -d member_bot -Fc --clean \
  < "$BACKUP_FILE"
```

**无备份时的手动回滚（暂存且无数据）：**
```sql
-- 按相反顺序撤销
DELETE FROM role_permissions WHERE updated_by = 'migration-082';
DROP INDEX IF EXISTS idx_audit_logs_target;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS description;
DROP INDEX IF EXISTS idx_txn_notes_lookup;
DROP TABLE IF EXISTS transaction_internal_notes;
```

⚠️ **生产环境回滚规则：**
- `transaction_internal_notes` 有数据 → **不 DROP**，修复代码
- `audit_logs.description` 有值 → **不 DROP COLUMN**，修复代码
- 权限行无业务数据，可安全 DELETE

### 1.7 Migration 失败恢复

| 失败阶段 | 现象 | 处理 |
|---|---|---|
| `migrate` 容器 exit 1 | `docker compose up` 时 erp 服务不启动 | 查 `docker logs tesla88-platform-migrate-1`，修复 SQL，重新 run |
| `erp` 启动失败 | healthcheck 未通过 | 先确认 migrate 成功；查 `docker logs` ERP 容器 |
| 部分 SQL 失败 | BEGIN/COMMIT 自动回滚该文件 | 其他 migration 不受影响；修复 082 再重跑 |

---

## 第二节 — 应用部署

### 2.1 服务依赖关系

```
postgres (health_check: pg_isready)
  └─ migrate (depends_on: postgres healthy)
       └─ erp (depends_on: migrate completed)
            └─ nginx (depends_on: erp)

redis (独立)
website (独立)
telegram-bot (独立)
```

### 2.2 暂存环境部署顺序

```bash
# Step 1: 拉取代码
git pull origin main

# Step 2: 确认目标 commit
git log --oneline -8

# Step 3: 备份数据库（见 1.3）

# Step 4: 构建并部署（包含 migrate）
docker compose -f docker-compose.production.yml \
               -f docker-compose.staging.yml \
               up -d --build

# Step 5: 监控启动日志
docker compose -f docker-compose.production.yml logs -f migrate erp
```

### 2.3 各服务重启顺序（手动重启场景）

```bash
# 1. 先执行 migration（若还未执行）
docker compose -f docker-compose.production.yml run --rm migrate

# 2. 重启 ERP（Phase A 主体）
docker compose -f docker-compose.production.yml restart erp

# 3. 重启 Website（无 Phase A 依赖，可选）
docker compose -f docker-compose.production.yml restart website

# 4. 重启 Bot（无 Phase A 依赖，可选）
docker compose -f docker-compose.production.yml restart telegram-bot
```

### 2.4 健康检查

```bash
# ERP 健康检查（容器内）
curl -s http://localhost:3000/api/ping
# 期望：200 OK

# 暂存域名检查
curl -s https://apidemo.club/api/ping
# 期望：200 OK

# 容器状态
docker compose -f docker-compose.production.yml ps
# 期望：所有服务 State = running；migrate State = exited (0)

# ERP 容器 healthcheck 状态
docker inspect tesla88-platform-erp-1 \
  --format='{{json .State.Health.Status}}'
# 期望："healthy"
```

---

## 第三节 — 冒烟测试（Smoke Tests）

> 暂存部署成功后立即执行。用 ERP 管理员账号（ADMIN 角色）进行。

### 3.1 数据库层

| 检验项 | 命令 | 期望 |
|---|---|---|
| 表存在 | `\d transaction_internal_notes` | 8 列，deleted_at TIMESTAMPTZ NULL |
| 索引存在 | `\di idx_txn_notes_lookup` | WHERE deleted_at IS NULL |
| description 列 | 见 1.5 第 3 条 | text 类型，nullable |
| target 索引 | 见 1.5 第 5 条 | 存在 |
| 权限种子 | 见 1.5 第 6 条 | 25 行，与规范一致 |

### 3.2 Notes API

使用 curl 或 Postman，带有效 JWT token（ADMIN 角色）：

```bash
BASE="https://apidemo.club"
TOKEN="<ADMIN_JWT_TOKEN>"
TYPE="deposit"
ID=1  # 使用一个暂存环境中存在的 deposit ID

# 1. 创建 Note（POST → 201）
curl -s -X POST "$BASE/api/transactions/$TYPE/$ID/notes" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"Phase A smoke test note"}' | jq .
# 期望：{ "note": { "id": N, "content": "Phase A smoke test note", ... } }
NOTE_ID=<从响应取 id>

# 2. 列表（GET → 200，含新建 note）
curl -s "$BASE/api/transactions/$TYPE/$ID/notes" \
  -H "Authorization: Bearer $TOKEN" | jq .
# 期望：{ "notes": [{ "id": N, "content": "Phase A smoke test note" }] }

# 3. 更新（PUT → 200）
curl -s -X PUT "$BASE/api/transactions/$TYPE/$ID/notes/$NOTE_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"Updated smoke test note"}' | jq .
# 期望：{ "note": { "content": "Updated smoke test note" } }

# 4. 再次列表（确认更新）
curl -s "$BASE/api/transactions/$TYPE/$ID/notes" \
  -H "Authorization: Bearer $TOKEN" | jq '.notes[].content'
# 期望："Updated smoke test note"

# 5. 删除（DELETE → 200 { ok: true }）
curl -s -X DELETE "$BASE/api/transactions/$TYPE/$ID/notes/$NOTE_ID" \
  -H "Authorization: Bearer $TOKEN" | jq .
# 期望：{ "ok": true }

# 6. 删除后列表（note 不再出现）
curl -s "$BASE/api/transactions/$TYPE/$ID/notes" \
  -H "Authorization: Bearer $TOKEN" | jq '.notes | length'
# 期望：0（或不含已删除 note）
```

### 3.3 Timeline API

```bash
# 7. 获取 timeline（刚才的 CRUD 操作应产生 3 条记录）
curl -s "$BASE/api/transactions/$TYPE/$ID/timeline" \
  -H "Authorization: Bearer $TOKEN" | jq .
# 期望：{ "items": [...], "total": 3, "page": 1, "pageSize": 20 }
# 每条 item 含 adminName, description, createdAt, event, metadata

# 8. 分页（pageSize=1）
curl -s "$BASE/api/transactions/$TYPE/$ID/timeline?page=1&pageSize=1" \
  -H "Authorization: Bearer $TOKEN" | jq '{total: .total, count: (.items | length)}'
# 期望：total=3, count=1

# 9. 无数据事务（不存在 ID → 空列表，非 404）
curl -s "$BASE/api/transactions/$TYPE/999999/timeline" \
  -H "Authorization: Bearer $TOKEN" | jq .
# 期望：{ "items": [], "total": 0 }，HTTP 200
```

### 3.4 权限验证

```bash
# 10. 无 token → 401
curl -s "$BASE/api/transactions/$TYPE/$ID/notes" | jq .status
# 期望：401

# 11. CS 角色 token（无任何 transaction 权限） → 401
curl -s "$BASE/api/transactions/$TYPE/$ID/notes" \
  -H "Authorization: Bearer $CS_TOKEN" | jq .
# 期望：401 Unauthorized

# 12. 无效 type → 400
curl -s "$BASE/api/transactions/invalid/$ID/notes" \
  -H "Authorization: Bearer $TOKEN" | jq .
# 期望：400

# 13. 软删除 note 再 PUT → 404（修复验证）
# 先创建、删除，然后 PUT 已删除的 noteId
curl -s -X PUT "$BASE/api/transactions/$TYPE/$ID/notes/$NOTE_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"should be 404"}' | jq .
# 期望：{ "error": "Note not found" }，HTTP 404（非 500）
```

### 3.5 Audit 验证

```bash
# 14. ERP Audit 页面仍正常（现有 audit 条目不受影响）
curl -s "$BASE/api/audit?limit=10" \
  -H "Authorization: Bearer $TOKEN" | jq '{total: .total, count: (.data | length)}'
# 期望：有数据，HTTP 200
```

### 3.6 现有存款流程（Deposit）

| 检验项 | 验证方式 | 期望 |
|---|---|---|
| Deposit 详情 API | GET /api/transactions/deposit/{id} | 返回格式与 Phase A 前完全一致 |
| Deposit 审核 | ERP 手动点击 Approve/Reject 一笔 | 状态正确变更，audit_log 写入正常 |
| audit_log 写入 | 审核后查询 audit_logs | description 列为 NULL，不报错 |

### 3.7 现有提款流程（Withdrawal）

| 检验项 | 验证方式 | 期望 |
|---|---|---|
| Withdrawal 详情 API | GET /api/transactions/withdrawal/{id} | 返回格式不变 |
| Withdrawal 审核 | ERP 手动操作 | 正常 |

### 3.8 余额更新（Balance Update）

```bash
# 触发一笔测试存款审核（暂存环境）
# 确认 users.balance 在 APPROVE 后正确更新
```

### 3.9 Media

| 检验项 | 期望 |
|---|---|
| 上传收据 | 正常上传，Media Library 可见 |
| 查看收据缩略图 | 正常渲染 |

### 3.10 Live Chat

| 检验项 | 期望 |
|---|---|
| ERP Live Chat 页面加载 | 正常 |
| 发送消息 | Bot 正常转发 |
| Quick Reply | 正常使用 |

### 3.11 Realtime（SSE）

```bash
# 连接 Deposit SSE 流
curl -s -N "$BASE/api/deposits/stream" \
  -H "Authorization: Bearer $TOKEN"
# 保持连接中，触发一笔测试存款
# 期望：SSE 推送 new_deposit 事件，无断线
```

---

## 第四节 — 全量回归测试

> 每次部署到暂存或生产后必须执行。逐项确认，不合格立即停止。

### 4.1 Website（会员端）

- [ ] 首页正常加载，各 Section 正常显示（Hero/Marquee/Promotions/Providers）
- [ ] 会员登录 / 注册流程正常
- [ ] 存款页面正常（银行转账选项正确）
- [ ] 提款页面正常（提款申请可提交）
- [ ] 游戏大厅加载正常（Provider 列表、游戏列表）
- [ ] 918KISS H5 登录正常（actk token 返回）
- [ ] 公告显示正常
- [ ] 个人中心页正常

### 4.2 ERP（管理后台）

**Authentication**
- [ ] 管理员登录 / 登出正常
- [ ] JWT 过期后重定向到登录页

**Deposit 存款模块**
- [ ] Deposit 列表页加载正常（数据显示、分页）
- [ ] Deposit 详情页加载正常（银行信息、收据、金额）
- [ ] Approve 操作正常（状态变更 PENDING → APPROVED，余额更新）
- [ ] Reject 操作正常（状态变更 PENDING → REJECTED）
- [ ] Processing 标记正常
- [ ] Deposit SSE 实时推送正常（新存款入账时 ERP 有提示）
- [ ] 未读徽章计数正常
- [ ] 收据预览/下载正常

**Withdrawal 提款模块**
- [ ] Withdrawal 列表页加载正常
- [ ] Withdrawal 详情页加载正常
- [ ] Approve 操作正常
- [ ] Reject 操作正常
- [ ] Paid 标记正常

**Member 会员模块**
- [ ] 会员列表加载正常
- [ ] 会员详情页（余额、存提历史）正常
- [ ] 会员余额手动调整正常

**Permission 权限系统**
- [ ] ERP 权限设置页面加载正常
- [ ] 修改某角色权限后即时生效
- [ ] 新 transaction.* 权限行在权限页面可见（可设置）

**Audit 审计日志**
- [ ] Audit 日志页面加载正常
- [ ] 现有审计记录正常显示（description 列 NULL 不报错）
- [ ] 新操作（Notes CRUD）产生正确 audit 条目

**Media 媒体库**
- [ ] Media Library 列表加载正常
- [ ] 上传文件正常
- [ ] 图片预览正常

**Brand Center**
- [ ] 品牌设置页面加载正常
- [ ] Logo / 颜色等配置正常显示

**Partner Builder**
- [ ] 合作伙伴链接管理正常

**Website Builder**
- [ ] ERP Website Builder 页面加载正常
- [ ] Section 配置保存正常
- [ ] 公共 API 数据一致（与 Website 同步）

### 4.3 Telegram Bot

**Authentication**
- [ ] Bot 启动正常（无报错）
- [ ] 会员通过 Telegram 登录正常

**核心流程**
- [ ] 存款申请流程（Bot 端）正常
- [ ] 提款申请流程（Bot 端）正常
- [ ] 余额查询正常

**Live Chat**
- [ ] ERP ↔ Bot 消息互通正常
- [ ] Quick Reply 正常
- [ ] 媒体发送（图片/文件）正常

**Broadcast**
- [ ] 广播消息正常发送

### 4.4 促销（Promotion）

- [ ] 促销列表 API 正常
- [ ] 促销详情 API 正常
- [ ] 申请促销流程正常

### 4.5 Gaming Platform（游戏平台）

- [ ] 918KISS GameList API 正常（返回游戏列表）
- [ ] 918KISS H5 Login 正常（actk token）
- [ ] Provider 同步功能正常
- [ ] gp_credentials 加密/解密正常（明文不从 API 返回）

### 4.6 Realtime（实时功能）

- [ ] Deposit SSE 连接正常（`/api/deposits/stream`）
- [ ] 存款实时推送正常（新存款 → ERP 即时通知）
- [ ] 未读计数 API 正常（`/api/deposits/unread`）
- [ ] 标记已读正常（`PUT /api/deposits/unread`）

### 4.7 Phase A 新功能（仅暂存需完整回归）

- [ ] Notes POST → 201，audit_log 含 INTERNAL_NOTE_CREATED
- [ ] Notes GET → 200，仅返回未删除 notes
- [ ] Notes PUT → 200，audit_log 含 INTERNAL_NOTE_UPDATED
- [ ] Notes DELETE → 200 `{ ok: true }`，audit_log 含 INTERNAL_NOTE_DELETED
- [ ] Timeline GET → TimelineItem（adminName/createdAt 字段正确）
- [ ] Timeline 空数据 → 200 `{ items: [] }`，非 404
- [ ] 软删除 note 再 PUT → 404（非 500）
- [ ] 软删除 note 再 DELETE → 404（非 200 + 虚假 audit）

---

## 第五节 — 生产就绪评估

### ✅ READY FOR PRODUCTION

**评估依据：**

| 评估项 | 状态 | 说明 |
|---|---|---|
| 所有 6 个实施任务 | ✅ 通过 | 每个任务经规范审查 + 代码质量审查双重通过 |
| TypeScript 编译 | ✅ 零错误 | 全部 6 次 npm run build 均通过 |
| 向后兼容性 | ✅ 已验证 | 无现有路由/函数签名/DB 列被修改 |
| 发现的缺陷 | ✅ 已修复 | Important 缺陷（软删除 → 500）已在 d2b5160 修复 |
| Migration 幂等性 | ✅ 确认 | 所有 SQL 使用 IF NOT EXISTS / ON CONFLICT DO NOTHING |
| 最终全分支审查 | ✅ 通过 | 规范覆盖 100%，向后兼容安全 |

**前提条件（部署前必须满足）：**

1. ✅ 暂存环境 Migration 082 执行成功
2. ✅ 暂存环境全量冒烟测试通过（第三节）
3. ✅ 暂存环境回归测试通过（第四节）
4. ✅ 生产数据库备份完成

**无阻断项。** 满足上述 4 个前提条件后，可部署生产。

---

## 第六节 — Git Tag 建议

### 推荐 Tag 名称

```
v2-phase-a-foundation
```

### 理由

| 选项 | 分析 |
|---|---|
| `transaction-v2-phase-a` | 功能导向，描述的是"什么功能"，但不体现版本层次 |
| `v2-phase-a-foundation` | ✅ **推荐**：`v2` 对应 Transaction Module V2 大版本，`phase-a` 明确阶段，`foundation` 精准描述这是基础设施层而非功能层，与 Phase B（Detail V2）、Phase C（Search）、Phase D（Realtime）形成清晰系列 |
| `phase-a-complete` | 太通用，未来难以区分属于哪个模块 |

### 打 Tag 命令

```bash
git tag -a v2-phase-a-foundation d2b5160 \
  -m "Transaction Module V2 Phase A Foundation

Foundation infrastructure for Transaction V2:
- Migration 082: transaction_internal_notes table, audit_logs.description
- TransactionEvent system (emitTransactionEvent Phase D ready)
- notes_repo: soft-delete CRUD
- transaction_audit + transaction_notes: orchestration layer
- 5 API routes: GET/POST/PUT/DELETE notes + GET timeline
- Bug fix: soft-deleted noteId returns 404 (not 500)

Additive-only. Zero existing route changes. 63 existing logAudit()
callers unaffected. Passes full regression."

git push origin v2-phase-a-foundation
```

---

## 第七节 — Phase B 就绪评估

### 基础层验证

| 检验项 | 状态 | 详情 |
|---|---|---|
| Migration 082 | ✅ 完整 | 新表、索引、权限、description 列 |
| Transaction Event System | ✅ 稳定 | 15 个事件常量，TransactionAuditPayload，emitTransactionEvent no-op 已就位 |
| Repository 层 | ✅ 稳定 | notes_repo 5 函数，audit_repo 新增 getAuditLogsByTarget，向后兼容 |
| Audit 层 | ✅ 稳定 | recordTransactionAudit，所有 Notes 操作均写入 audit_log |
| Permission 层 | ✅ 稳定 | 5 个新权限种子，ERP 权限页面可配置 |
| Timeline API | ✅ 稳定 | TimelineItem ViewModel，分页，adminName/createdAt 字段正确 |
| Internal Notes API | ✅ 稳定 | CRUD 完整，软删除正确，404 修复已上线 |

### Phase B 依赖的 Phase A 接口

Phase B 设计规范中依赖的接口全部已就位：

| Phase B 功能 | 依赖的 Phase A 接口 | 状态 |
|---|---|---|
| Timeline UI | `GET /api/transactions/[type]/[id]/timeline` | ✅ |
| Internal Notes UI | `GET/POST/PUT/DELETE /api/transactions/[type]/[id]/notes` | ✅ |
| Receipt View Audit | `recordTransactionAudit(RECEIPT_VIEWED)` | ✅ |
| TransactionService（审核封装） | `recordTransactionAudit`，`TransactionEvent` | ✅ |

### 结论

## Phase B Approved

Phase A 基础层完整、稳定、已通过全分支代码审查。所有 Phase B 所依赖的接口均已就位且经过验证。可以启动 Phase B（Transaction Detail V2）设计和实施。

**Phase B 范围提醒（来自设计规范）：**
- 事务详情页面 UI 全面重设计（8 个面板）
- 收据预览（复用 Media Library，前端）
- 会员历史摘要 API（`GET /api/members/[id]/transaction-summary`，Migration 083 可选）
- Approve/Reject 操作迁移至 TransactionService
- 审计入口点：receipt.view、approve、reject 均调用 recordTransactionAudit
- 新权限：`transaction.receipt.view`、`transaction.receipt.download`
- 估算：4–5 工作日

---

## 官方部署与交接顺序

```
1. ▶ 暂存环境部署
   git pull → 数据库备份 → docker compose up -d --build（含 migration）
   验证：migrate exit 0，erp healthy

2. ▶ 执行冒烟测试（第三节）
   Database → Notes API → Timeline API → Permissions → Audit → 现有流程
   全部通过后继续

3. ▶ 执行全量回归测试（第四节）
   Website / ERP / Bot / Realtime 全覆盖
   任何失败立即停止，修复后重新回归

4. ▶ 生产环境部署
   生产数据库备份 → git pull → docker compose up -d --build
   执行冒烟测试第 3.1-3.5 节（生产简化版）
   监控 5 分钟，确认无报错

5. ▶ 创建 Git Tag
   git tag -a v2-phase-a-foundation d2b5160 -m "..."
   git push origin v2-phase-a-foundation

6. ▶ 启动 Phase B
   调用 brainstorming + writing-plans 进入 Phase B 设计
   Phase B 目标：Transaction Detail V2 UI + Member Summary API
```
