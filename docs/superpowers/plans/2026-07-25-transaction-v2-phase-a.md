# Transaction Module V2 — Phase A 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变任何现有生产工作流的前提下，为 Transaction Module V2 建立基础设施：Internal Notes、Timeline、Event System、Repository 层，以及 5 条新 API 路由。

**Architecture:** 纯增量（Additive-Only）。新模块与现有路由并列存在；现有路由、函数签名、DB 列一律不变。Phase B/C/D 逐步采用新模块。

**Tech Stack:** TypeScript、Next.js App Router（API Routes）、PostgreSQL、`audit_repo`、`require_permission`、`role_permissions`

**设计规范：** `docs/superpowers/specs/2026-07-25-transaction-v2-phase-a-design.md`

## 全局约束（Global Constraints）

- **向后兼容绝对强制**：Deposit/Withdraw 创建、处理、审核、拒绝、余额更新、SSE、LISTEN/NOTIFY、Audit、Media 等所有现有流程必须与 Phase A 前完全相同。
- Phase A 无任何前端 UI 变更。API 建好备用，UI 在 Phase B 实现。
- Repository 层：standalone exported async functions，不用 class。
- `as const` 对象用于事件名——禁止 TypeScript enum。
- Notes 软删除（`deleted_at`）——禁止物理删除行。
- 新权限使用点号字符串（`transaction.notes.view` 等）。
- 禁止修改 `users.id`。
- 禁止修改外部集成层（API Providers、Provider APIs、Callback APIs、Webhooks、Game Provider Integration）。
- `gp_credentials` 明文绝不从任何 API 返回。

---

## 一、实施顺序

按以下顺序执行，每步都有明确依赖理由：

```
步骤 1 — 迁移（Migration 082）
  依赖：无。必须最先执行，后续所有代码依赖新表和新列。

步骤 2 — 事件系统（transaction_events.ts）
  依赖：无外部依赖。定义 TransactionEvent 常量、TransactionAuditPayload 接口、
         emitTransactionEvent() 占位符。后续所有模块 import 此文件。

步骤 3 — Repository 层（notes_repo.ts + audit_repo.ts 扩展）
  依赖：步骤 1（表/列已存在）、步骤 2（TransactionType 类型）。
  先做 notes_repo，再扩展 audit_repo（仅加函数，不改现有函数）。

步骤 4 — 业务逻辑层（transaction_audit.ts + transaction_notes.ts + index.ts）
  依赖：步骤 2、步骤 3。调用 repo 函数，触发 emit，封装审计。

步骤 5 — API Routes（5 条路由）
  依赖：步骤 2~4（types/logic 已就位）。
  按顺序：notes GET+POST → notes PUT+DELETE → timeline GET。

步骤 6 — 回归验证
  依赖：步骤 1~5 全部完成。验证现有流程未受影响。
```

**顺序理由：** 数据库先行，确保 TypeScript 代码引用的表和列在编译阶段已确认存在。事件系统在 repo 之前，避免 repo 层产生循环引用。业务层在 repo 之后，保证调用的函数签名已定义。API 层最后，保证调用的 service/repo 函数均可用。

---

## 二、待创建文件

| 文件路径 | 责任 |
|---|---|
| `erp/migrations/082_transaction_v2_foundation.sql` | 建表、加列、加索引、种权限 |
| `erp/src/lib/transactions/transaction_events.ts` | TransactionEvent 常量、TransactionAuditPayload 接口、TransactionType、emitTransactionEvent() |
| `erp/src/lib/transactions/transaction_audit.ts` | recordTransactionAudit() — 包装 audit_repo，添加 description 和 metadata |
| `erp/src/lib/transactions/transaction_notes.ts` | createNote、updateNote、deleteNote、listNotes — 调用 notes_repo + audit + emit |
| `erp/src/lib/transactions/index.ts` | 统一 re-export（TransactionEvent、TransactionAuditPayload、所有 Notes 函数） |
| `erp/src/lib/repositories/notes_repo.ts` | 纯 DB 层：dbCreateNote、dbUpdateNote、dbSoftDeleteNote、dbListNotes、dbGetNoteById |
| `erp/src/app/api/transactions/[type]/[id]/notes/route.ts` | GET（列表）+ POST（创建） |
| `erp/src/app/api/transactions/[type]/[id]/notes/[noteId]/route.ts` | PUT（更新）+ DELETE（软删除） |
| `erp/src/app/api/transactions/[type]/[id]/timeline/route.ts` | GET（分页 TimelineItem 列表） |

**文件职责原则：** 每个文件单一职责。notes_repo 只做 DB 操作，transaction_notes 只做业务编排，API route 只做 HTTP 层（权限 + 验证 + 调用 service + 响应）。

---

## 三、待修改文件

| 文件路径 | 改动内容 | 向后兼容保证 |
|---|---|---|
| `erp/src/lib/repositories/audit_repo.ts` | ① 新增 `getAuditLogsByTarget()` 函数 ② 在 `logAudit()` 参数中新增可选 `description?: string` | 现有调用不传 description 继续工作，默认为 NULL。现有 `getAuditLogs()` 函数签名及行为不变。 |
| `erp/src/lib/types.ts` | 在 `AuditLog` interface 新增 `description?: string` 字段 | 现有使用 AuditLog 类型的代码无需改动（新字段可选）。 |

**关于 audit_repo.ts 的修改边界：**
修改 `logAudit()` 时，**必须**更新函数体内的 SQL INSERT 语句以包含 `description` 列（否则新列永远为 NULL）。允许的修改范围是：参数 interface 加 `description?` 字段、SQL INSERT 加第 7 个参数。除此之外，函数签名、返回类型、调用约定均不变。现有调用点不传 description 时，值写入 NULL，行为与 Phase A 前完全一致。

**禁止改动的文件：** 所有现有 deposit/withdrawal API routes、所有 game provider adapter 文件、所有 webhook/callback 处理文件、所有 SSE 路由。

---

## 四、迁移计划（Migration 082）

### 4.1 执行前准备

- 在暂存环境确认 `audit_logs` 表已存在，`role_permissions` 表已存在。
- 确认 `admins` 表存在（`transaction_internal_notes.admin_id` REFERENCES 它）。
- 确认迁移脚本编号 082 尚未被其他迁移占用（检查 `erp/migrations/` 目录）。

### 4.2 迁移内容（按顺序）

1. **创建 `transaction_internal_notes` 表**
   - `id SERIAL PRIMARY KEY`
   - `transaction_type VARCHAR(20) CHECK IN ('deposit','withdrawal')`
   - `transaction_id INTEGER NOT NULL`（不加外键，因存在两张事务表）
   - `admin_id INTEGER NOT NULL REFERENCES admins(id)`
   - `content TEXT NOT NULL`
   - `created_at / updated_at TIMESTAMPTZ DEFAULT NOW()`
   - `deleted_at TIMESTAMPTZ NULL`（软删除标记）
   - 使用 `CREATE TABLE IF NOT EXISTS` 保证幂等。

2. **创建复合索引 `idx_txn_notes_lookup`**
   - 在 `(transaction_type, transaction_id, created_at DESC)` 上
   - WHERE `deleted_at IS NULL`（部分索引，只索引未删除行）

3. **扩展 `audit_logs` 表**
   - `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS description TEXT`
   - 使用 `ADD COLUMN IF NOT EXISTS`，已存在时不报错。

4. **创建索引 `idx_audit_logs_target`**
   - 在 `(target_type, target_id, created_at DESC)` 上
   - 支持 Timeline 按事务 ID 快速查询

5. **种入权限记录**
   - 5 个权限 × 5 个角色（CS/SUPPORT/FINANCE/SUPERVISOR/ADMIN）= 25 行
   - `ON CONFLICT (role, permission) DO NOTHING` — 幂等，已存在则跳过
   - SUPER_ADMIN 不需要行（代码层绕过权限检查）

### 4.3 执行方式

**暂存环境：**
```
docker exec tesla88-platform-postgres-1 \
  psql -U postgres -d member_bot \
  -f /path/to/082_transaction_v2_foundation.sql
```

**验证语句（执行后逐条检查）：**
- `\d transaction_internal_notes` — 验证表结构和列
- `\di idx_txn_notes_lookup` — 验证索引存在
- `SELECT column_name FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='description'` — 验证列已加
- `SELECT COUNT(*) FROM role_permissions WHERE permission LIKE 'transaction.%'` — 验证 25 行权限

### 4.4 回滚方案

如需回滚（仅在暂存环境，生产不可逆时需人工确认）：
1. `DROP TABLE IF EXISTS transaction_internal_notes` — 删除新表
2. `ALTER TABLE audit_logs DROP COLUMN IF EXISTS description` — 移除列
3. `DROP INDEX IF EXISTS idx_txn_notes_lookup` — 删除新索引
4. `DROP INDEX IF EXISTS idx_audit_logs_target` — 删除新索引
5. `DELETE FROM role_permissions WHERE updated_by = 'migration-082'` — 删除权限种子

**注意：** `audit_logs.description` 加列是安全的（现有行 description = NULL）。`DROP COLUMN` 会丢失已写入的 description，`DROP TABLE transaction_internal_notes` 会丢失所有 notes 数据。生产环境若已有数据，**不执行 DROP 操作，改为修复代码**。

**生产环境大表索引注意：** `idx_audit_logs_target` 在 `audit_logs` 上创建索引，若该表数据量大（数十万行以上），标准 `CREATE INDEX` 会锁表。**生产环境执行迁移时，应将此条替换为 `CREATE INDEX CONCURRENTLY`**（注意：CONCURRENTLY 不能在事务块内使用，需单独执行）。暂存环境数据量小，使用标准 `CREATE INDEX` 即可。

---

## 五、Repository 层计划

### 5.1 notes_repo.ts

**职责：** 纯 DB 操作，无业务逻辑，无权限检查，无 emit。

**函数列表及行为说明：**

| 函数 | 参数 | 返回值 | 行为 |
|---|---|---|---|
| `dbCreateNote` | `{transaction_type, transaction_id, admin_id, content}` | `NoteRow` | INSERT 一行，返回含 id/created_at/updated_at 的完整行 |
| `dbUpdateNote` | `noteId: number, content: string` | `NoteRow` | UPDATE content + updated_at = NOW()，WHERE id = noteId AND deleted_at IS NULL，返回更新后行 |
| `dbSoftDeleteNote` | `noteId: number` | `void` | UPDATE deleted_at = NOW()，WHERE id = noteId AND deleted_at IS NULL |
| `dbListNotes` | `{transaction_type, transaction_id, includeDeleted?: boolean}` | `NoteRow[]` | SELECT WHERE type+id，默认过滤 deleted_at IS NULL，ORDER BY created_at ASC |
| `dbGetNoteById` | `noteId: number` | `NoteRow \| null` | SELECT by id，包含已删除行（供权限检查用） |

**NoteRow interface：** `{id, transaction_type, transaction_id, admin_id, content, created_at, updated_at}`（不含 deleted_at，已删除行不在正常查询结果中）

**pool 使用：** 从 `@/lib/db` import pool，与现有 repo 一致。

### 5.2 audit_repo.ts 扩展

**现有函数保持不变：**
- `logAudit(data)` — 仅新增可选 `description?: string` 到参数 interface，若不传则 description 列写 NULL
- `getAuditLogs(opts)` — 签名和行为完全不变

**新增函数 `getAuditLogsByTarget`：**

| 参数 | 类型 | 说明 |
|---|---|---|
| `target_type` | `string` | 例如 `'deposit'` 或 `'withdrawal'` |
| `target_id` | `number` | 具体事务 ID |
| `page` | `number` | 1-based，默认 1 |
| `pageSize` | `number` | 默认 20，上限 100 |

**返回：** `{ data: AuditLog[], total: number }`

**SQL 策略：** 利用 `idx_audit_logs_target` 索引，`WHERE target_type = $1 AND target_id = $2`，ORDER BY `created_at DESC`，LIMIT/OFFSET 分页。

**JOIN admins：** LEFT JOIN admins ON audit_logs.admin_id = admins.id，填充 `admin_username`（与现有 getAuditLogs 方式一致）。

### 5.3 层间交互规则

```
API Route
  └─ transaction_notes.ts (业务编排)
       ├─ notes_repo.ts (DB 操作)
       ├─ transaction_audit.ts (写 audit_log)
       │    └─ audit_repo.logAudit() (现有函数，加 description)
       └─ emitTransactionEvent() (Phase A no-op)

API Route (timeline)
  └─ audit_repo.getAuditLogsByTarget() (新函数)
       └─ 映射为 TimelineItem (ViewModel 转换在 route 层)
```

**禁止跨层：** API route 禁止直接调用 pool 或 notes_repo。业务层禁止直接操作 pool（通过 repo 函数）。

---

## 六、API Layer 计划

### Route 命名约定

所有新路由均在 `erp/src/app/api/transactions/[type]/[id]/` 下，与现有 `route.ts`（GET 事务详情）并列，不覆盖。

`[type]` 值：`deposit` 或 `withdrawal`  
`[id]` 值：正整数字符串

### 6.1 GET `/api/transactions/[type]/[id]/notes`

**请求流程：**
1. 解析 params（`type`, `id`）
2. 验证 `type` 是否为 `deposit` 或 `withdrawal`，否则 400
3. 验证 `id` 为合法正整数，否则 400
4. 调用 `requirePermission('transaction.notes.view')`，401 if null
5. 调用 `listNotes(type, id)`（来自 transaction_notes.ts）
6. 返回 200 `{ notes: NoteRow[] }`

**权限：** `transaction.notes.view`  
**无分页：** Notes 数量预期不大，全量返回。  
**错误响应：** 400 Invalid type / 400 Invalid id / 401 Unauthorized

### 6.2 POST `/api/transactions/[type]/[id]/notes`

**请求流程：**
1. 解析 params（`type`, `id`）
2. 验证 type、id（同上）
3. `requirePermission('transaction.notes.create')` → 401 if null，payload 含 `adminId`
4. 解析 request body `{ content: string }`
5. 验证 content 非空、非空白字符串，否则 400
6. 验证 content 长度 ≤ 2000 字符，否则 400
7. 调用 `createNote({ transactionType: type, transactionId: id, adminId, content })`
8. 返回 201 `{ note: NoteRow }`

**权限：** `transaction.notes.create`  
**验证：** content 必填，非空，≤ 2000 字符  
**副作用：** createNote 内部写 audit_log（INTERNAL_NOTE_CREATED + description）+ emit（no-op）  
**错误响应：** 400 Invalid type / 400 Invalid id / 400 Missing/invalid content / 401 Unauthorized

### 6.3 PUT `/api/transactions/[type]/[id]/notes/[noteId]`

**请求流程：**
1. 解析 params（`type`, `id`, `noteId`）
2. 验证 type、id、noteId 均合法
3. `requirePermission('transaction.notes.edit')` → 401 if null，payload 含 adminId
4. 调用 `dbGetNoteById(noteId)` 确认 note 存在且 `deleted_at IS NULL`，否则 404
5. 验证 note 的 `transaction_type` 和 `transaction_id` 与 URL params 一致，否则 403（防止跨事务操作）
6. 解析 body `{ content: string }`，验证非空、≤ 2000 字符
7. 调用 `updateNote(noteId, content, adminId)`（transaction_notes.ts）
8. 返回 200 `{ note: NoteRow }`

**权限：** `transaction.notes.edit`  
**校验：** note 存在 + 未删除 + 属于正确事务  
**副作用：** updateNote 写 audit_log（INTERNAL_NOTE_UPDATED）+ emit  
**错误响应：** 404 Note not found / 403 Note does not belong to transaction / 400 Invalid content

### 6.4 DELETE `/api/transactions/[type]/[id]/notes/[noteId]`

**请求流程：**
1. 解析 params（`type`, `id`, `noteId`）
2. 验证 type、id、noteId
3. `requirePermission('transaction.notes.delete')` → 401 if null
4. `dbGetNoteById(noteId)` 确认存在且未删除，否则 404
5. 验证 note 属于正确事务，否则 403
6. 调用 `deleteNote({ noteId, adminId })`（soft delete）
7. 返回 **200 `{ ok: true }`**（规范明确要求，非 204）

**权限：** `transaction.notes.delete`  
**行为：** 软删除（`deleted_at = NOW()`），不物理删除  
**副作用：** deleteNote 写 audit_log（INTERNAL_NOTE_DELETED）+ emit  
**错误响应：** 404 Note not found / 403 Note does not belong to transaction

### 6.5 GET `/api/transactions/[type]/[id]/timeline`

**请求流程：**
1. 解析 params（`type`, `id`）
2. 验证 type、id
3. `requirePermission('transaction.timeline.view')` → 401 if null
4. 解析 query params `page`（默认 1）、`pageSize`（默认 20，上限 100）
5. 调用 `getAuditLogsByTarget({ target_type: type, target_id: id, page, pageSize })`
6. 将每条 `AuditLog` 映射为 `TimelineItem` ViewModel（不暴露原始 audit_log 列名）
7. 返回 200 `{ items: TimelineItem[], total, page, pageSize }`

**TimelineItem ViewModel 字段（严格按规范定义）：**
```
id           — audit_log.id
event        — audit_log.action（事件名）
adminName    — audit_log.admin_username（JOIN admins，可为 null）
description  — audit_log.description（人读描述）
createdAt    — audit_log.created_at（ISO 8601）
metadata     — audit_log.new_value（任意 JSON，可为 null）
```

**权限：** `transaction.timeline.view`  
**排序：** 最新优先（created_at DESC）  
**空数据：** 无 audit 条目时返回 `{ items: [], total: 0, page: 1, pageSize: 20 }`，**绝不返回 404**  
**错误响应：** 400 Invalid type / 400 Invalid id / 400 Invalid page/pageSize / 401 Unauthorized

---

## 七、测试计划

### 7.1 Migration 验证（手动，暂存环境）

| 检验项 | 验证方式 | 预期结果 |
|---|---|---|
| 表已创建 | `\d transaction_internal_notes` | 所有列类型正确 |
| 软删除列 | `\d transaction_internal_notes` | `deleted_at TIMESTAMPTZ NULL` |
| 注释索引 | `\di idx_txn_notes_lookup` | 存在，WHERE 子句含 `deleted_at IS NULL` |
| description 列 | `SELECT column_name FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='description'` | 1 行 |
| 现有 audit_logs 行 | `SELECT COUNT(*) FROM audit_logs WHERE description IS NOT NULL` | 0（新列默认 NULL） |
| 权限种子 | `SELECT COUNT(*) FROM role_permissions WHERE permission LIKE 'transaction.%'` | 25 |
| 幂等性 | 再次执行迁移脚本 | 无报错，无行数变化 |

### 7.2 Repository 层验证（暂存环境，手动 curl 或 psql 直接操作）

| 检验项 | 方式 | 预期 |
|---|---|---|
| dbCreateNote | 直接插入 + 查询 | 返回含 id 和 created_at 的行 |
| dbSoftDeleteNote | 软删除后查 `dbListNotes` | 已删除行不出现；查 psql 确认 deleted_at 非 NULL |
| dbUpdateNote | 更新后查行 | content 和 updated_at 均更新 |
| getAuditLogsByTarget | 写入 audit_log 后查询 | 按 target_type + target_id 正确过滤 |
| getAuditLogs（现有） | 直接调用 | 行为与 Phase A 前完全一致 |

### 7.3 API 层验证（手动 curl，暂存环境登录后测试）

**Notes CRUD 验证序列：**
```
1. POST /api/transactions/deposit/1/notes   → 201，返回 note 对象
2. GET  /api/transactions/deposit/1/notes   → 200，列表含 1 条
3. PUT  /api/transactions/deposit/1/notes/:id → 200，content 已更新
4. GET  /api/transactions/deposit/1/notes   → 200，列表显示新 content
5. DELETE /api/transactions/deposit/1/notes/:id → 204
6. GET  /api/transactions/deposit/1/notes   → 200，空列表（或不含已删除条目）
```

**权限验证：**
```
- 无 token → 401
- token 但缺少 transaction.notes.view 权限 → 401
- 正确权限 → 200/201/204
```

**Timeline 验证：**
```
1. 执行上述 CRUD 后，GET /api/transactions/deposit/1/timeline
2. 期望：timeline 含 INTERNAL_NOTE_CREATED、INTERNAL_NOTE_UPDATED、INTERNAL_NOTE_DELETED 三条
3. 每条含 adminName、description、createdAt（严格按规范字段名）
4. GET /api/transactions/deposit/999999/timeline（不存在事务） → 200 { items: [], total: 0 }（非 404）
```

**现有 audit 回归：**
```
5. GET /api/audit → 200，现有 audit 条目正常显示（含新 description 列，值为 null 时不报错）
```

**边界值测试：**
```
- POST content 为空字符串 → 400
- POST content 超过 2000 字符 → 400
- PUT/DELETE 不存在的 noteId → 404
- GET timeline，type=invalid → 400
```

### 7.4 回归检查清单（每次 Phase A 变更后必跑）

以下现有流程在 Phase A 实施后必须与之前行为完全一致：

| 功能 | 验证方式 |
|---|---|
| 存款审核流（Deposit approve/reject） | 手动触发，确认 status 变更、audit_log 写入正常 |
| 提款审核流（Withdrawal approve/reject） | 同上 |
| Deposit SSE（`/api/deposits/stream`） | 连接 SSE，触发存款，确认事件推送正常 |
| audit_log 写入（现有调用点） | 确认 logAudit 调用正常，description 列为 NULL 但不报错 |
| `GET /api/transactions/[type]/[id]`（现有详情路由） | 确认返回内容与 Phase A 前一致 |

---

## 八、Git Commit 策略

建议以下 commit 边界，每个 commit 都是可独立部署和回滚的单元：

| Commit | 内容 | 原因 |
|---|---|---|
| **commit 1** | `erp/migrations/082_transaction_v2_foundation.sql` | 迁移独立提交，便于单独回滚 |
| **commit 2** | `erp/src/lib/transactions/transaction_events.ts` + `erp/src/lib/types.ts`（AuditLog 加 description） + `erp/src/lib/repositories/audit_repo.ts`（扩展） | 类型和基础层一起，无 API 变更，安全 |
| **commit 3** | `erp/src/lib/repositories/notes_repo.ts` | 纯 DB 层，独立可测试 |
| **commit 4** | `erp/src/lib/transactions/transaction_audit.ts` + `transaction_notes.ts` + `index.ts` | 业务编排层，依赖 commit 2+3 |
| **commit 5** | Notes API routes（`notes/route.ts` + `notes/[noteId]/route.ts`） | API 层，依赖 commit 4 |
| **commit 6** | Timeline API route（`timeline/route.ts`） | 独立功能，单独提交 |

**Commit message 格式：**
```
feat(transaction-v2): [描述]
```
例如：
```
feat(transaction-v2): add migration 082 - internal notes table, audit description column
feat(transaction-v2): add TransactionEvent system and extend audit_repo
feat(transaction-v2): add notes_repo with soft-delete CRUD
feat(transaction-v2): add transaction_audit and transaction_notes service layer
feat(transaction-v2): add notes CRUD API routes
feat(transaction-v2): add timeline API route with TimelineItem ViewModel
```

---

## 九、生产部署计划

### 9.1 暂存环境（Staging）验证流程

```
1. git pull（确认最新代码）
2. npm run build — 验证 TypeScript 零编译错误（严格执行，有错误必须修复后再部署）
3. docker compose -f docker-compose.production.yml down
4. docker compose -f docker-compose.production.yml up -d --build
5. 执行 migration 082（见第四节步骤）
6. 验证 migration（见 7.1 清单）
7. 验证 API（见 7.3 清单）
8. 跑完整回归检查（见 7.4 清单）
9. ✅ 暂存通过后再进行生产部署
```

### 9.2 生产环境（Production — 45.77.169.133）部署流程

```
1. 通知相关团队：即将部署 Transaction V2 Phase A
2. git pull on VPS
3. npm run build（在 VPS 上或 CI 环境确认编译通过）
4. docker compose -f docker-compose.production.yml build app
5. 执行 migration 082（先不重启 app）：
   注意：idx_audit_logs_target 索引改用 CONCURRENTLY 方式（若 audit_logs 数据量大）：
   docker exec tesla88-platform-postgres-1 \
     psql -U postgres -d member_bot \
     -f /path/to/082_transaction_v2_foundation.sql
6. 验证 migration 结果（\d 查表结构，确认 audit_logs.description 列存在）
7. docker compose -f docker-compose.production.yml up -d app
8. 冒烟测试（Smoke Test）：
   a. POST /api/transactions/deposit/[任意现有 ID]/notes
   b. GET  /api/transactions/deposit/[同 ID]/notes
   c. GET  /api/transactions/deposit/[同 ID]/timeline
   d. 确认现有 Deposit SSE 正常推送
9. 监控 5 分钟，确认无报错
```

### 9.3 冒烟测试预期结果

| 测试 | 预期 |
|---|---|
| POST notes | 201，返回 note 含 id |
| GET notes | 200，列表含新建 note |
| GET timeline | 200，含 INTERNAL_NOTE_CREATED 条目 |
| 现有 Deposit SSE | 连接后无断线，事件正常 |
| 现有 Deposit 详情 API | 与 Phase A 前相同 JSON 结构 |

### 9.4 生产回滚流程

**代码回滚（无状态变更）：**
```
git revert [Phase A commits] && docker compose restart app
```

**Migration 回滚（谨慎，有数据丢失风险）：**
1. 确认 `transaction_internal_notes` 表无数据（`SELECT COUNT(*) FROM transaction_internal_notes`）
2. 若无数据：执行 DROP TABLE + DROP INDEX + ALTER TABLE DROP COLUMN
3. 若有数据：**不回滚**，改为修复代码
4. 权限回滚：`DELETE FROM role_permissions WHERE updated_by = 'migration-082'`（权限行无业务数据）

---

## 十、风险分析

| 步骤 | 风险等级 | 潜在问题 | 缓解措施 | 回滚方式 |
|---|---|---|---|---|
| Migration 082 — ADD COLUMN | 🟢 低 | `description TEXT` 为 nullable，不影响现有写入 | 使用 `ADD COLUMN IF NOT EXISTS`，幂等 | `DROP COLUMN IF EXISTS description` |
| Migration 082 — CREATE TABLE | 🟢 低 | 新表，不影响任何现有表 | `CREATE TABLE IF NOT EXISTS`，幂等 | `DROP TABLE IF EXISTS transaction_internal_notes` |
| Migration 082 — idx_audit_logs_target 创建 | 🟡 中 | audit_logs 大表时标准 CREATE INDEX 锁表 | 生产环境改用 `CREATE INDEX CONCURRENTLY`（需在事务外单独执行） | DROP INDEX IF EXISTS |
| Migration 082 — 权限种子 | 🟢 低 | 25 行新权限，`DO NOTHING` on conflict | `DO NOTHING` 保证幂等 | `DELETE WHERE updated_by = 'migration-082'` |
| audit_repo 扩展 | 🟡 中 | `logAudit` 签名变更影响现有调用点 | description 严格可选（默认 undefined），现有调用不传即为 NULL，无任何行为变化 | git revert commit 2 |
| AuditLog type 加字段 | 🟢 低 | TypeScript interface 加可选字段不破坏现有引用 | `description?: string` 可选，编译不报错 | git revert |
| 新 API Routes | 🟢 低 | 新路由不影响现有路由（不同路径） | 路径 `notes/` 和 `timeline/` 与现有 `route.ts` 并列不冲突 | 删除新文件 |
| emitTransactionEvent no-op | 🟢 低 | Phase A 为空函数，无副作用 | 函数体仅 `void event; void payload` | 无需回滚 |
| `[noteId]` 路由段与现有 `[type]/[id]/route.ts` | 🟢 低 | Next.js 路由段命名不冲突（子路径不同） | 路径层级不同，Next.js 不混淆 | 无 |

**最高风险点：** `audit_repo.ts` 修改。虽然风险低，但它是现有生产代码。实施时：只添加可选参数和新函数，绝不修改现有函数体。

---

## 十一、验收清单（Acceptance Checklist）

### DB 层
- [ ] `transaction_internal_notes` 表存在，列类型正确
- [ ] `idx_txn_notes_lookup` 部分索引存在（WHERE deleted_at IS NULL）
- [ ] `audit_logs.description` 列存在（TEXT，NULLABLE）
- [ ] `idx_audit_logs_target` 索引存在
- [ ] 25 条权限记录存在（5 权限 × 5 角色）
- [ ] 迁移脚本可重复执行无报错（幂等性）

### Repository 层
- [ ] `dbCreateNote` 返回含 id/created_at 的 NoteRow
- [ ] `dbSoftDeleteNote` 设置 deleted_at，不物理删除
- [ ] `dbListNotes` 默认过滤已删除行
- [ ] `getAuditLogsByTarget` 按 target_type + target_id 过滤，支持分页
- [ ] 现有 `logAudit` 调用（无 description）继续正常工作
- [ ] 现有 `getAuditLogs` 函数签名和行为不变

### API 层
- [ ] GET notes 返回 200 + NoteRow 列表
- [ ] POST notes 返回 201 + 新建 NoteRow
- [ ] PUT notes 返回 200 + 更新后 NoteRow
- [ ] DELETE notes 返回 204，行未物理删除
- [ ] GET timeline 返回 200 + TimelineItem 列表（字段严格为 `adminName`、`description`、`createdAt`、`metadata`）
- [ ] timeline 无数据时返回 `{ items: [], total: 0 }`（非 404）
- [ ] 所有路由：无效 type → 400，无效 id → 400，无 token → 401

### 权限层
- [ ] `transaction.notes.view` 权限保护 GET notes 和 GET timeline
- [ ] `transaction.notes.create` 权限保护 POST notes
- [ ] `transaction.notes.edit` 权限保护 PUT notes
- [ ] `transaction.notes.delete` 权限保护 DELETE notes
- [ ] `transaction.timeline.view` 权限保护 GET timeline
- [ ] SUPER_ADMIN 角色可访问所有路由（代码层绕过，无需 DB 行）

### Audit 层
- [ ] createNote 写入 audit_log，action = INTERNAL_NOTE_CREATED，含 description
- [ ] updateNote 写入 audit_log，action = INTERNAL_NOTE_UPDATED
- [ ] deleteNote 写入 audit_log，action = INTERNAL_NOTE_DELETED
- [ ] timeline API 返回上述三类 audit 事件

### 向后兼容层（回归）
- [ ] 现有 Deposit 审核流行为不变
- [ ] 现有 Withdrawal 审核流行为不变
- [ ] 现有 Deposit SSE 正常推送
- [ ] 现有 `GET /api/transactions/[type]/[id]` 返回格式不变
- [ ] 现有 audit_log 写入（不含 description）无报错
- [ ] `GET /api/audit` 仍正常返回现有 audit 条目（`description` 字段为 null 时不报错）

### 部署
- [ ] Migration 082 在暂存环境成功执行
- [ ] `npm run build` 零 TypeScript 编译错误（暂存和生产均需）
- [ ] 暂存环境全部 API 测试通过
- [ ] 暂存环境回归检查通过
- [ ] 生产环境 Migration 082 成功执行
- [ ] 生产环境冒烟测试通过
- [ ] 生产环境 5 分钟监控无报错

---

## 估算

| 项目 | 估算 |
|---|---|
| **任务数** | 6 个 git commit 单元，约 14 个子任务 |
| **开发工时** | 约 6~8 小时（含 migration、所有文件、API routes） |
| **测试工时** | 约 2~3 小时（手动验证 + 回归 + 暂存部署） |
| **Phase A 总工时** | 约 1~1.5 工作日 |

**说明：** 工时估算基于纯增量实施（不改现有代码逻辑），最大风险点（audit_repo 扩展）仅需 3~5 行改动。生产部署包含在测试工时内。
