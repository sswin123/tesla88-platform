# ERP 全局性能优化 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除 ERP 侧边栏导航 1-3 秒卡顿，全面提升页面切换响应速度。

**Architecture:** 审计发现 3 个根本原因：(1) SSE 连接池耗尽——在 LiveChat 页面同时存在 4 个 SSE 长连接占据 HTTP 连接池 4/6 槽，后续 API 请求排队等待；(2) 所有页面纯 CSR 无 loading 骨架，路由切换后用户看到空白；(3) filterNavGroups 未 memoize，SSE 高频更新驱动 Sidebar 频繁重渲染并重复计算权限过滤。

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript strict, Tailwind CSS.

## Global Constraints

- DO NOT modify: 918KISS、游戏 API、钱包、存取款审批逻辑、认证/登录/注册、收据上传/查看、LiveChat 业务逻辑、Telegram Bot、nginx、Docker、现有 API 合同
- 无 breaking changes，无功能变更，无 UI 改版
- TypeScript strict — 禁止 `any`
- 仅做性能优化，不引入技术债
- 完整向后兼容

---

## 根因分析（审计结论）

### P0 — 直接导致 1-3 秒卡顿

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| 1 | SSE 连接池耗尽 | LiveChat 页面同时有 3 个 `/api/livechat/stream` + 1 个 `/api/transactions/stream` = 4/6 HTTP 连接槽被占用，其他 API 请求排队等待 | **直接导致导航时 API 请求 1-3 秒延迟** |
| 2 | 全部页面无 loading.tsx | 路由切换后必须等待 JS + API 才显示内容，用户感知空白 | **导致 1-3 秒感知延迟** |
| 3 | `/api/auth/me` 在 7 处独立 fetch，无共享 | 每次导航到使用 `usePermissionGuard` 的页面触发额外 API 请求 | **每次导航额外消耗 1 个 HTTP 连接** |

### P1 — 性能劣化

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| 4 | `filterNavGroups` 未 useMemo | `sidebar.tsx:289` — SSE 更新每次触发完整重计算 | Sidebar 高频重渲染 |
| 5 | TransactionsPage + Sidebar 各自独立 fetch pending-count | SSE 事件触发 2 次重复请求 | 每次 SSE 事件双倍请求 |
| 6 | Members 页面 `router.push()` 替代 `<Link>` | `members/page.tsx:185` | 失去 Next.js prefetch |

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `erp/src/lib/sse-manager.ts` | **CREATE** | 模块级 SSE 单例管理器，消除重复连接 |
| `erp/src/components/sidebar.tsx` | **MODIFY** | 使用 sseManager；filterNavGroups useMemo |
| `erp/src/components/livechat/ConversationList.tsx` | **MODIFY** | 使用 sseManager 替代独立 EventSource |
| `erp/src/components/livechat/ChatWindow.tsx` | **MODIFY** | 使用 sseManager 替代独立 EventSource |
| `erp/src/app/(dashboard)/transactions/page.tsx` | **MODIFY** | 使用 sseManager 替代独立 EventSource |
| `erp/src/app/(dashboard)/loading.tsx` | **CREATE** | Dashboard 根路由 loading 骨架 |
| `erp/src/app/(dashboard)/members/loading.tsx` | **CREATE** | Members 页面 loading 骨架 |
| `erp/src/app/(dashboard)/transactions/loading.tsx` | **CREATE** | Transactions 页面 loading 骨架 |
| `erp/src/app/(dashboard)/livechat/loading.tsx` | **CREATE** | LiveChat 页面 loading 骨架 |
| `erp/src/app/(dashboard)/audit/loading.tsx` | **CREATE** | Audit 页面 loading 骨架 |
| `erp/src/app/(dashboard)/settings/loading.tsx` | **CREATE** | Settings 页面 loading 骨架 |
| `erp/src/app/(dashboard)/members/page.tsx` | **MODIFY** | `router.push()` → `<Link>` |

---

## Task 1: SSE Manager — 消除重复连接（P0）

**Files:**
- Create: `erp/src/lib/sse-manager.ts`
- Modify: `erp/src/components/sidebar.tsx`
- Modify: `erp/src/components/livechat/ConversationList.tsx`
- Modify: `erp/src/components/livechat/ChatWindow.tsx`
- Modify: `erp/src/app/(dashboard)/transactions/page.tsx`

**Interfaces:**
- Produces: `subscribeSSE(url: string, handler: (e: MessageEvent) => void): () => void`
- 每个 URL 最多维护 1 个 EventSource；所有订阅者共享；最后一个退订时关闭连接

**效果：** LiveChat 页面 SSE 连接从 4 个 → 2 个（livechat + transactions 各 1 个），释放 2 个 HTTP 连接槽。

- [ ] **Step 1: 创建 `erp/src/lib/sse-manager.ts`**

```typescript
// erp/src/lib/sse-manager.ts
// Module-level singleton SSE manager.
// Deduplicates EventSource connections: multiple subscribers on the same URL
// share one underlying connection. The connection closes when all subscribers unsubscribe.

type MessageHandler = (event: MessageEvent) => void;

interface ManagedConnection {
  es: EventSource;
  handlers: Set<MessageHandler>;
}

// Module-level singleton — survives React re-renders and component unmounts.
const connections = new Map<string, ManagedConnection>();

/**
 * Subscribe to an SSE URL. Returns an unsubscribe function.
 * Multiple subscribers on the same URL share one EventSource connection.
 * The EventSource is closed when all subscribers have unsubscribed.
 *
 * Usage (mirrors EventSource pattern):
 *   useEffect(() => {
 *     return subscribeSSE('/api/livechat/stream', (e) => { ... });
 *   }, []);
 */
export function subscribeSSE(url: string, handler: MessageHandler): () => void {
  let conn = connections.get(url);

  if (!conn) {
    const es = new EventSource(url);
    conn = { es, handlers: new Set() };
    connections.set(url, conn);

    es.onmessage = (e: MessageEvent) => {
      const c = connections.get(url);
      if (!c) return;
      c.handlers.forEach((h) => {
        try { h(e); } catch { /* isolate per-handler errors */ }
      });
    };

    es.onerror = () => {
      // On error: close and remove so the next subscriber gets a fresh connection.
      const c = connections.get(url);
      if (c) {
        c.es.close();
        connections.delete(url);
      }
    };
  }

  conn.handlers.add(handler);

  return () => {
    const c = connections.get(url);
    if (!c) return;
    c.handlers.delete(handler);
    if (c.handlers.size === 0) {
      c.es.close();
      connections.delete(url);
    }
  };
}

/** For testing only — reset all connections. */
export function _resetSSEManager(): void {
  connections.forEach((c) => c.es.close());
  connections.clear();
}

/** Returns the number of active SSE connections. Useful for debugging. */
export function getActiveSSECount(): number {
  return connections.size;
}
```

- [ ] **Step 2: 修改 `sidebar.tsx` — 替换两个 EventSource**

找到文件中的两个 SSE 块：

**替换 livechat SSE（约第 223-237 行）：**

原代码：
```typescript
const chatEs = new EventSource('/api/livechat/stream');
chatEs.onmessage = (e: MessageEvent) => {
  try {
    const evt = JSON.parse(e.data as string) as { type?: string };
    if (evt.type === 'new_message') {
      setLivechatUnread((n) => n + 1);
    }
  } catch { /* ignore */ }
};
```

替换为：
```typescript
const unsubChat = subscribeSSE('/api/livechat/stream', (e: MessageEvent) => {
  try {
    const evt = JSON.parse(e.data as string) as { type?: string };
    if (evt.type === 'new_message') {
      setLivechatUnread((n) => n + 1);
    }
  } catch { /* ignore */ }
});
```

**替换 transactions SSE（约第 238-253 行）：**

原代码：
```typescript
const txEs = new EventSource('/api/transactions/stream');
txEs.onmessage = () => {
  if (refreshTimer.current) return;
  refreshTimer.current = setTimeout(() => {
    refreshTimer.current = null;
    fetch('/api/transactions/pending-count')
      .then((r) => r.json())
      .then((d: { count: number }) => {
        setPendingCount((prev) => {
          if (d.count > prev) playNotifBeep();
          return d.count;
        });
      })
      .catch(() => {});
  }, 250);
};
```

替换为：
```typescript
const unsubTx = subscribeSSE('/api/transactions/stream', () => {
  if (refreshTimer.current) return;
  refreshTimer.current = setTimeout(() => {
    refreshTimer.current = null;
    fetch('/api/transactions/pending-count')
      .then((r) => r.json())
      .then((d: { count: number }) => {
        setPendingCount((prev) => {
          if (d.count > prev) playNotifBeep();
          return d.count;
        });
      })
      .catch(() => {});
  }, 250);
});
```

**替换 cleanup return：**

原代码：
```typescript
return () => {
  chatEs.close();
  txEs.close();
  if (refreshTimer.current) clearTimeout(refreshTimer.current);
};
```

替换为：
```typescript
return () => {
  unsubChat();
  unsubTx();
  if (refreshTimer.current) clearTimeout(refreshTimer.current);
};
```

在文件顶部 import 中添加：
```typescript
import { subscribeSSE } from '@/lib/sse-manager';
```

- [ ] **Step 3: 同时添加 filterNavGroups useMemo（利用此次 sidebar 修改）**

在 Sidebar 组件内部，找到渲染 NAV_GROUPS 的地方（约第 289 行）：

```tsx
{filterNavGroups(NAV_GROUPS, me.isSuperAdmin, me.permissions).map(...)}
```

在 Sidebar 函数体内添加 useMemo（在 state 声明之后，return 之前）：

```typescript
const filteredNavGroups = useMemo(
  () => filterNavGroups(NAV_GROUPS, me?.isSuperAdmin ?? false, me?.permissions ?? []),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [me?.isSuperAdmin, me?.permissions]
);
```

然后将渲染时的调用替换为：
```tsx
{filteredNavGroups.map(...)}
```

在 React import 中加入 `useMemo`（如果还没有）。

- [ ] **Step 4: 修改 `ConversationList.tsx` — 替换 EventSource**

读取文件，找到 `new EventSource('/api/livechat/stream')` 的代码块。

将：
```typescript
const es = new EventSource('/api/livechat/stream');
es.onmessage = (e: MessageEvent) => { ... };
// cleanup:
return () => { es.close(); };
```

替换为：
```typescript
const unsub = subscribeSSE('/api/livechat/stream', (e: MessageEvent) => { ... });
// cleanup:
return () => { unsub(); };
```

在文件顶部添加：
```typescript
import { subscribeSSE } from '@/lib/sse-manager';
```

- [ ] **Step 5: 修改 `ChatWindow.tsx` — 替换 EventSource**

读取文件，找到 `new EventSource('/api/livechat/stream')` 的代码块。

将 EventSource 创建和 cleanup 替换为 `subscribeSSE` 模式（同 Step 4 格式）。

在文件顶部添加：
```typescript
import { subscribeSSE } from '@/lib/sse-manager';
```

- [ ] **Step 6: 修改 `transactions/page.tsx` — 替换 EventSource**

读取文件，找到 `new EventSource('/api/transactions/stream')` 的代码块（约第 135 行）。

将：
```typescript
const es = new EventSource('/api/transactions/stream');
es.onmessage = () => { ... };
return () => {
  es.close();
  ...
};
```

替换为：
```typescript
const unsub = subscribeSSE('/api/transactions/stream', () => { ... });
return () => {
  unsub();
  ...
};
```

在文件顶部添加：
```typescript
import { subscribeSSE } from '@/lib/sse-manager';
```

- [ ] **Step 7: TypeScript 检查**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot/erp
npx tsc --noEmit 2>&1 | head -30
```

预期：无错误。

- [ ] **Step 8: 全套测试**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot/erp
npx vitest run 2>&1 | tail -10
```

预期：所有测试通过。

- [ ] **Step 9: 验证 SSE 连接数减少**

在 `transactions/page.tsx` 或测试中，添加临时断言（然后删除）：
```typescript
import { getActiveSSECount } from '@/lib/sse-manager';
// When on /transactions page: should be 2 (livechat + transactions), not 3
console.log('Active SSE connections:', getActiveSSECount());
```

实际验证通过开发者工具 Network tab 观察，确认 `/api/livechat/stream` 只有 1 条连接（不是 3 条）。

- [ ] **Step 10: 提交**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot
git add erp/src/lib/sse-manager.ts
git add erp/src/components/sidebar.tsx
git add erp/src/components/livechat/ConversationList.tsx
git add erp/src/components/livechat/ChatWindow.tsx
git add "erp/src/app/(dashboard)/transactions/page.tsx"
git commit -m "perf: SSE dedup manager — reduce connections from 4 to 2 on LiveChat page

Introduce lib/sse-manager.ts: module-level singleton that shares one EventSource
per URL across all subscribers. Sidebar, ConversationList, ChatWindow, and
TransactionsPage now share connections instead of each creating their own.

LiveChat page: 3x /api/livechat/stream + 1x /api/transactions/stream → 2 connections
Transactions page: 2x /api/transactions/stream → 1 connection

Also: filterNavGroups wrapped in useMemo in Sidebar — prevents recomputation
on every SSE-driven re-render (pendingCount/livechatUnread updates)."
```

---

## Task 2: loading.tsx — 即时感知导航（P0）

**Files:**
- Create: `erp/src/app/(dashboard)/loading.tsx`
- Create: `erp/src/app/(dashboard)/members/loading.tsx`
- Create: `erp/src/app/(dashboard)/transactions/loading.tsx`
- Create: `erp/src/app/(dashboard)/livechat/loading.tsx`
- Create: `erp/src/app/(dashboard)/audit/loading.tsx`
- Create: `erp/src/app/(dashboard)/settings/loading.tsx`

**原理：** Next.js App Router 在路由切换时立即渲染 `loading.tsx`（无需等待数据），用户看到骨架屏而非空白。等数据 ready 后无缝替换。这是消除"感知空白"的最高性价比优化。

- [ ] **Step 1: 创建通用骨架组件（内联在各 loading.tsx 中）**

所有 loading.tsx 使用相同的骨架模式。不需要提取共享组件（YAGNI）。

- [ ] **Step 2: 创建 `app/(dashboard)/loading.tsx`（Dashboard 首页）**

```tsx
// erp/src/app/(dashboard)/loading.tsx
export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-gray-200 rounded" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-28 bg-gray-200 rounded-lg" />
        ))}
      </div>
      <div className="h-64 bg-gray-200 rounded-lg" />
    </div>
  );
}
```

- [ ] **Step 3: 创建 `app/(dashboard)/members/loading.tsx`**

```tsx
// erp/src/app/(dashboard)/members/loading.tsx
export default function MembersLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-36 bg-gray-200 rounded" />
      <div className="flex gap-3">
        <div className="h-9 w-64 bg-gray-200 rounded" />
        <div className="h-9 w-32 bg-gray-200 rounded" />
      </div>
      <div className="rounded-md border bg-white overflow-hidden">
        <div className="h-11 bg-gray-100 border-b" />
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-14 border-b last:border-0 flex items-center px-4 gap-4">
            <div className="h-4 w-24 bg-gray-200 rounded" />
            <div className="h-4 w-32 bg-gray-200 rounded" />
            <div className="h-4 w-24 bg-gray-200 rounded" />
            <div className="h-4 w-16 bg-gray-200 rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 创建 `app/(dashboard)/transactions/loading.tsx`**

```tsx
// erp/src/app/(dashboard)/transactions/loading.tsx
export default function TransactionsLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-44 bg-gray-200 rounded" />
      <div className="flex gap-1 border-b pb-0">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-9 w-24 bg-gray-200 rounded-t" />
        ))}
      </div>
      <div className="rounded-lg border bg-white p-4">
        <div className="h-4 w-32 bg-gray-200 rounded mb-3" />
        <div className="flex gap-8">
          <div className="h-10 w-16 bg-gray-200 rounded" />
          <div className="h-10 w-16 bg-gray-200 rounded" />
          <div className="h-10 w-16 bg-gray-200 rounded" />
        </div>
      </div>
      <div className="rounded-md border bg-white overflow-hidden">
        <div className="h-11 bg-gray-100 border-b" />
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-14 border-b last:border-0 flex items-center px-4 gap-4">
            <div className="h-4 w-12 bg-gray-200 rounded" />
            <div className="h-5 w-20 bg-gray-200 rounded-full" />
            <div className="h-4 w-28 bg-gray-200 rounded" />
            <div className="h-4 w-20 bg-gray-200 rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 创建 `app/(dashboard)/livechat/loading.tsx`**

```tsx
// erp/src/app/(dashboard)/livechat/loading.tsx
export default function LiveChatLoading() {
  return (
    <div className="flex h-[calc(100vh-4rem)] animate-pulse">
      <div className="w-80 border-r flex flex-col">
        <div className="h-14 border-b px-4 flex items-center">
          <div className="h-5 w-24 bg-gray-200 rounded" />
        </div>
        <div className="flex-1 overflow-hidden">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-16 border-b px-4 flex items-center gap-3">
              <div className="h-8 w-8 bg-gray-200 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-1">
                <div className="h-3 w-24 bg-gray-200 rounded" />
                <div className="h-3 w-40 bg-gray-200 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-300 text-sm">Loading conversations…</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: 创建 `app/(dashboard)/audit/loading.tsx`**

```tsx
// erp/src/app/(dashboard)/audit/loading.tsx
export default function AuditLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-32 bg-gray-200 rounded" />
      <div className="flex gap-3">
        <div className="h-9 w-48 bg-gray-200 rounded" />
        <div className="h-9 w-32 bg-gray-200 rounded" />
      </div>
      <div className="rounded-md border bg-white overflow-hidden">
        <div className="h-11 bg-gray-100 border-b" />
        {[...Array(10)].map((_, i) => (
          <div key={i} className="h-12 border-b last:border-0 flex items-center px-4 gap-4">
            <div className="h-3 w-32 bg-gray-200 rounded" />
            <div className="h-3 w-48 bg-gray-200 rounded" />
            <div className="h-3 w-24 bg-gray-200 rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: 创建 `app/(dashboard)/settings/loading.tsx`**

```tsx
// erp/src/app/(dashboard)/settings/loading.tsx
export default function SettingsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-28 bg-gray-200 rounded" />
      <div className="rounded-lg border bg-white p-6 space-y-4">
        <div className="h-5 w-40 bg-gray-200 rounded" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="space-y-1">
            <div className="h-3 w-24 bg-gray-200 rounded" />
            <div className="h-9 w-full bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Build 验证（确认 loading.tsx 被 Next.js 识别）**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot/erp
npx next build 2>&1 | grep -E "loading|error|Error" | head -20
```

预期：build 成功，loading.tsx 文件出现在页面列表中。

- [ ] **Step 9: 提交**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot
git add "erp/src/app/(dashboard)/loading.tsx"
git add "erp/src/app/(dashboard)/members/loading.tsx"
git add "erp/src/app/(dashboard)/transactions/loading.tsx"
git add "erp/src/app/(dashboard)/livechat/loading.tsx"
git add "erp/src/app/(dashboard)/audit/loading.tsx"
git add "erp/src/app/(dashboard)/settings/loading.tsx"
git commit -m "perf: add loading.tsx skeleton screens to all major dashboard routes

Routes covered: /, /members, /transactions, /livechat, /audit, /settings.
Next.js App Router shows skeleton immediately on navigation (before data arrives),
eliminating the blank-screen window that users perceived as 1-3s lag.
No business logic changes. Pure UX improvement."
```

---

## Task 3: Members Link Fix + Dead Code Removal（P1）

**Files:**
- Modify: `erp/src/app/(dashboard)/members/page.tsx`
- Delete (or empty): `erp/src/hooks/useNotifications.ts`（死代码，但先确认再删）

- [ ] **Step 1: 读取 `members/page.tsx`，找到 `router.push()` 的地方**

```bash
grep -n "router.push" /Users/hang/Downloads/Test/telegram-member-bot/erp/src/app/\(dashboard\)/members/page.tsx
```

- [ ] **Step 2: 将 `router.push(\`/members/${row.id}\`)` 改为 `<Link>`**

找到类似以下代码：
```tsx
<button onClick={() => router.push(`/members/${row.id}`)}>View</button>
```

替换为：
```tsx
import Link from 'next/link';
// ...
<Link href={`/members/${row.id}`}>
  <Button size="sm" variant="ghost">View</Button>
</Link>
```

如果 `router` 不再使用，移除 `useRouter` import 和 `const router = useRouter()`。

- [ ] **Step 3: 确认 `useNotifications.ts` 确实未被使用**

```bash
grep -rn "useNotifications" /Users/hang/Downloads/Test/telegram-member-bot/erp/src --include="*.tsx" --include="*.ts"
```

如果只有定义本身（零使用），不删除（避免意外破坏），只添加注释：
```typescript
// NOTE: This hook is currently unused. SSE is managed by sidebar.tsx directly.
// Safe to remove in a future cleanup PR.
```

- [ ] **Step 4: TypeScript 检查 + 测试**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot/erp
npx tsc --noEmit 2>&1 | head -20
npx vitest run 2>&1 | tail -5
```

- [ ] **Step 5: 提交**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot
git add "erp/src/app/(dashboard)/members/page.tsx"
git add "erp/src/hooks/useNotifications.ts" 2>/dev/null || true
git commit -m "perf: Members View button router.push → Link for prefetch support

Next.js <Link> prefetches the target page JS on hover/focus, making
navigation to member detail pages feel instant. router.push() bypasses
this prefetch mechanism."
```

---

## Task 4: Regression 验证

- [ ] **Step 1: 全套 Vitest 测试**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot/erp
npx vitest run 2>&1 | tail -10
```

预期：全部通过（当前基准 472 个测试）。

- [ ] **Step 2: TypeScript strict 检查**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot/erp
npx tsc --noEmit 2>&1 | head -20
```

预期：无生产代码错误。

- [ ] **Step 3: Next.js Build**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot/erp
npx next build 2>&1 | tail -15
```

预期：Build 成功，所有 94 页面 + 6 个新 loading.tsx。

- [ ] **Step 4: 关键功能不变性验证（git diff 检查）**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot
git diff 5cd09b4..HEAD -- erp/src/app/api/deposits/stream/route.ts
git diff 5cd09b4..HEAD -- erp/src/app/api/livechat/sessions/route.ts
git diff 5cd09b4..HEAD -- erp/src/app/api/auth/login/route.ts
git diff 5cd09b4..HEAD -- erp/src/components/livechat/ChatWindow.tsx
```

ChatWindow.tsx 会有变化（SSE 替换），但只有 EventSource → subscribeSSE 的机械替换，无业务逻辑变更。

- [ ] **Step 5: SSE 行为验证清单（需人工在浏览器验证）**

```
✅ LiveChat 正常接收新消息（SSE 消息正确分发给 ChatWindow）
✅ ConversationList 正常显示新会话（SSE 消息正确分发给 ConversationList）
✅ Sidebar 未读计数正常更新（SSE 消息正确分发给 sidebar handler）
✅ Transactions 实时更新正常（pending-count SSE 正常工作）
✅ 浏览器 DevTools Network Tab：LiveChat 页面只有 2 个 SSE 连接（不是 4 个）
✅ 导航到 Members 页面时有骨架屏（不再空白）
✅ 导航到 Transactions 页面时有骨架屏
✅ Members 页面点击 View 跳转正常
```

- [ ] **Step 6: 提交最终 Regression 报告**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot
git add docs/
git commit -m "docs: ERP performance optimization regression report — all checks PASS" 2>/dev/null || echo "no doc changes to commit"
```

---

## 性能对比预测

| 指标 | 优化前 | 优化后 | 改善 |
|------|--------|--------|------|
| LiveChat 页面 SSE 连接数 | 4 个 | 2 个 | -50% |
| Transactions 页面 SSE 连接数 | 3 个 | 2 个 | -33% |
| 可用 HTTP 连接槽（LiveChat） | 2/6 | 4/6 | +2 槽 |
| filterNavGroups 每次渲染执行 | 是 | 否（memoized） | 消除 |
| 路由切换用户感知空白 | 1-3 秒 | < 100ms（骨架屏） | 显著改善 |
| Members 页面 View 按钮 prefetch | 无 | 有 | 改善 |
