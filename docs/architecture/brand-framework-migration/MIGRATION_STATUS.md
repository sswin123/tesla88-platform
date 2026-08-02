# Brand Framework Migration — Status Tracker

| Phase | 名称 | 状态 | 完成时间 | Commit |
|-------|------|------|---------|--------|
| Phase 0 | Legacy Runtime Audit | ✅ 完成 | 2026-08-03 | — |
| Phase 1 | 统一 Runtime Service | ⏳ 等待确认 | — | — |
| Phase 2 | 迁移 Legacy Provider (918KISS) | ⏸ 待开始 | — | — |
| Phase 3 | 删除旧 Runtime | ⏸ 待开始 | — | — |
| Phase 4 | Database Migration | ⏸ 待开始 | — | — |

---

## Phase 1 改动范围（预览）

**改动文件：**
1. `api/games/settings/[code]/test/route.ts` — 返回 301/410，不再直接读数据库
2. `api/games/settings/[code]/reload/route.ts` — 改写 `brand_providers`，不再写 `gp_providers`
3. `api/games/settings/[code]/route.ts` — PATCH status 改写 `brand_providers.status`
4. `lib/providers/core/HealthMonitor.ts` — 写入目标改为 `brand_providers.health_status`
5. `lib/providers/adapters/megah5/MegaH5Adapter.ts` — 删除 `gp_providers` 惰性查询

**不改动：**
- 918KISS 路径（Phase 2 处理）
- 任何数据库 Schema（Phase 4 处理）
- 任何 UI 代码（始终不改）
