# Brand Framework Migration — Phase 0 Audit

**日期：** 2026-08-03  
**目的：** 在任何代码修改之前，建立完整的数据路径审计基准线。  
**调查范围：** `erp/src/app/api/` + `erp/src/lib/`

---

## 核心问题

系统在历史演进中形成了两套独立的 Provider 数据路径：

| 数据层 | 表名 | 用途 | 状态 |
|--------|------|------|------|
| 旧全局层 | `gp_config`, `gp_credentials`, `gp_providers` | 全局（不区分品牌）| 待废弃 |
| 新品牌层 | `brand_provider_config`, `brand_provider_credentials`, `brand_providers` | 每品牌独立 | 目标唯一源 |

Connection Test 读旧全局层，但 Brand Center 保存数据到新品牌层 → 数据永远对不上。

---

## 一、旧全局层 API（需迁移或废弃）

### 1.1 直接读写 gp_config / gp_credentials

| 文件 | 操作 | 旧表 | 迁移 Phase |
|------|------|------|-----------|
| `api/games/settings/[code]/route.ts` | GET：读取展示 | `gp_config`, `gp_credentials` | Phase 1 |
| `api/games/settings/[code]/route.ts` | PATCH (config)：写入 | `gp_config` | Phase 1 |
| `api/games/settings/[code]/route.ts` | PATCH (credential)：写入 | `gp_credentials` | Phase 1 |
| `api/games/settings/[code]/test/route.ts` | POST：Connection Test | `gp_config`, `gp_credentials` | Phase 1 |
| `api/games/settings/[code]/duplicate/route.ts` | POST：复制 Provider | `gp_config`, `gp_credentials` | Phase 3 |
| `api/games/settings/[code]/export/route.ts` | GET：导出配置 | `gp_config`, `gp_credentials` | Phase 3 |
| `api/games/settings/[code]/import/route.ts` | POST：导入配置 | `gp_config` | Phase 3 |
| `api/games/settings/[code]/history/rollback/route.ts` | POST：回滚 | `gp_config_history` → `gp_config` | Phase 3 |
| `api/games/settings/[code]/history/route.ts` | GET：历史记录 | `gp_config_history` | Phase 3 |
| `lib/gaming.ts` | buildKiss918Adapter | `gp_providers`, `gp_credentials`, `gp_config` | Phase 2 |

### 1.2 直接读写 gp_providers（运行时状态字段）

| 文件 | 操作 | 字段 | 迁移 Phase |
|------|------|------|-----------|
| `api/games/settings/[code]/route.ts` | PATCH (status)：写入 | `gp_providers.status` | Phase 1 |
| `api/games/settings/[code]/route.ts` | DELETE：删除 Provider | `gp_providers`（整行） | Phase 3 |
| `api/games/settings/[code]/reload/route.ts` | POST：更新 adapter 状态 | `gp_providers.last_reload_at`, `adapter_loaded` | Phase 1 |
| `api/games/health/route.ts` | GET：检查 918KISS 状态 | `gp_providers.status`, `health_status` | Phase 2 |
| `lib/gaming.ts` | buildKiss918Adapter | `gp_providers.status` | Phase 2 |
| `lib/providers/repositories/ProviderRepository.ts` | updateHealth() | `gp_providers.health_status` | Phase 1 |
| `lib/providers/core/HealthMonitor.ts` | 写入健康状态 | `gp_providers.health_status` | Phase 1 |
| `Kiss918Adapter.ts` | _loadProviderId() | `gp_providers`（惰性查询） | Phase 2 |
| `MegaH5Adapter.ts` | _loadProviderId() | `gp_providers`（惰性查询） | Phase 1 |

### 1.3 gp_providers 作为 Provider 目录（保留）

以下文件读取 `gp_providers` 中的目录字段（code, name, capabilities 等），这些不需要迁移：

| 文件 | 操作 | 字段 | 处理 |
|------|------|------|------|
| `api/games/settings/route.ts` | GET：列出所有 Provider | `gp_providers`（全部字段） | 保留目录功能 |
| `api/games/settings/route.ts` | POST：创建 Provider | `gp_providers` | 保留注册功能 |
| `api/brands/[code]/providers/route.ts` | JOIN：品牌 Provider 列表 | `JOIN gp_providers p` | 保留（只用 code/name）|
| `api/games/launch/route.ts` | 查找 Provider 记录 | `gp_providers.website_launch_mode` | 保留目录字段 |
| 各 callback routes | JOIN 获取 provider_id | `JOIN gp_providers p ON p.id` | 保留（外键关联）|

---

## 二、新品牌层 API（已正确实现）

| 文件 | 操作 | 表 | 经过 ProviderRuntimeBuilder |
|------|------|----|-----------------------------|
| `api/brands/[code]/providers/[providerCode]/test/route.ts` | Connection Test | `brand_provider_*` | ✅ 是 |
| `api/brands/[code]/providers/[providerCode]/reload/route.ts` | Reload | via BrandProviderManager | ✅ 是 |
| `api/brands/[code]/providers/[providerCode]/snapshot/route.ts` | Snapshot | via BrandProviderManager | ✅ 是 |
| `api/brands/[code]/providers/[providerCode]/metrics/route.ts` | Metrics | RuntimeMetricsStore | ✅ 是 |
| `api/brands/[code]/providers/[providerCode]/events/route.ts` | Events | RuntimeEventStore | ✅ 是 |
| `api/brands/[code]/providers/[providerCode]/route.ts` | PATCH Config/Cred/Status | `brand_provider_*` | ✅ 是 |
| `api/games/settings/[code]/brand-creds/route.ts` | PATCH 品牌 Config/Cred | `brand_provider_*` | ✅ 是 |
| `api/games/launch/route.ts` (非918KISS) | Launch | via BrandProviderManager | ✅ 是 |
| `api/games/megah5/callback/[action]/route.ts` | Wallet 回调 | via BrandProviderManager | ✅ 是 |
| `api/games/megaapp/callback/[action]/route.ts` | Wallet 回调 | via BrandProviderManager | ✅ 是 |
| `api/mega/callback/route.ts` | Wallet 回调 | via BrandProviderManager | ✅ 是 |
| `api/members/[id]/provider-accounts/[code]/sync/route.ts` | 玩家账号同步 | via BrandProviderManager | ✅ 是 |
| `api/internal/member-wallet-sync/route.ts` | 内部钱包同步 | via BrandProviderManager | ✅ 是 |

---

## 三、ProviderRuntimeBuilder 覆盖状态

```
✅ 已覆盖（Brand Center 全部路径）
  Overview → BrandProviderManager.buildSnapshot() → ProviderRuntimeBuilder.build()
  Connection Test → ProviderRuntimeBuilder.build() （直接）
  Reload → BrandProviderManager.invalidateAndReload() → ProviderRuntimeBuilder.build()
  Snapshot → BrandProviderManager.getSnapshot() → ProviderRuntimeBuilder.build()
  Launch (MegaH5/MegaApp) → BrandProviderManager.getAdapter()
  Wallet Callback → BrandProviderManager.getAdapter()

⛔ 未覆盖（旧 gaming-platform 路径）
  Connection Test → 直接读 gp_config / gp_credentials (gaming-platform)
  Reload → 直接写 gp_providers.last_reload_at (gaming-platform)
  Status 写入 → gp_providers.status (gaming-platform)
  Health 写入 → gp_providers.health_status (HealthMonitor)

⛔ 未覆盖（918KISS 旧路径）
  Launch → gaming.ts → gp_credentials / gp_config
  Adapter 构建 → 直接 SQL（不走 BrandProviderManager）
```

---

## 四、状态字段分布（双状态问题）

| 字段 | 表 | 写入方 | 读取方 |
|------|----|--------|--------|
| `gp_providers.status` | 全局 | gaming-platform PATCH | gaming-platform 列表、Launch 检查 |
| `brand_providers.status` | 品牌专属 | brand-center PATCH、brand-creds PATCH | Brand Center 展示、BrandProviderManager |
| `gp_providers.health_status` | 全局 | HealthMonitor.ts | games/health 路由 |
| `brand_providers.health_status` | 品牌专属 | brand Connection Test | Snapshot / Overview |

目标：**只保留 `brand_providers.status` 和 `brand_providers.health_status`**

---

## 五、执行计划

| Phase | 目标 | 关键改动 | 影响范围 |
|-------|------|---------|---------|
| **Phase 0** | 建立审计基准（本文档）| 无代码改动 | 无 |
| **Phase 1** | 统一 Runtime Service | gaming-platform Connection Test 废弃；Reload/Status/Health 改写 brand_providers | 仅 ERP 后端路由 |
| **Phase 2** | 迁移 Legacy Provider（918KISS）| gaming.ts 删除；918KISS 走 BrandProviderManager | Launch 路由、health 路由 |
| **Phase 3** | 删除旧 Runtime | Duplicate/Export/Import/Rollback 旧路径；ProviderRepository 旧方法 deprecated | 管理后台功能 |
| **Phase 4** | Database Migration | DROP gp_config, gp_credentials；ALTER gp_providers 删除运行时字段 | DB Schema |

---

## 六、回滚策略

每个 Phase 独立可回滚：
- Phase 1-3：git revert 即可，不涉及 DB
- Phase 4：需要有 Phase 4 之前的完整 DB 备份（update-system.sh 已自动备份）

**Phase 4 执行前必须确认：**
- Phase 1-3 在生产运行 ≥ 7 天无报错
- `gp_config` 和 `gp_credentials` 最后写入时间超过 7 天
- `gp_providers.health_status` 最后写入时间超过 7 天

---

_审计完成时间：2026-08-03_  
_下一步：等待 Phase 0 确认后执行 Phase 1_
