# Production 验收测试清单

每次 `deploy.sh` 完成后，必须先运行自动检查，再执行本人工清单。
全部通过才能宣告 **Production Stable**。

```bash
# 步骤一：自动检查
./scripts/production-check.sh

# 步骤二：人工测试（本清单）
```

---

## 自动检查涵盖（production-check.sh）

| 项目 | 检查内容 |
|------|----------|
| Docker 容器 | 全部 running / healthy / RestartCount=0 |
| Migration | ExitCode=0，日志含完成标志 |
| API `/api/ping` | 返回 `{"ok":true}` |
| API `/api/health/system` | 数据库连通 |
| API `/api/public/brand` | 品牌数据存在 |
| Nginx → ERP | 内部 wget 连通 |
| Nginx → Website | 内部 wget 连通 |
| 日志扫描 | 无 uncaughtException / ECONNREFUSED |
| 公网 HTTP | apidemo.club + erp.apidemo.club 均 200 |

---

## 人工测试清单

### 测试前准备

```bash
# 打开两个标签页监控日志
docker compose -f docker-compose.production.yml logs -f erp
docker compose -f docker-compose.production.yml logs -f nginx
```

---

### 一、ERP 基础功能

#### 1.1 登录 / 登出

| # | 测试步骤 | 预期结果 | 通过 |
|---|----------|----------|------|
| 1 | 打开 `https://erp.apidemo.club` | 跳转到 `/login` 页面 | ☐ |
| 2 | 输入错误密码登录 | 显示错误提示，不跳转 | ☐ |
| 3 | 输入正确账号密码（superadmin / Admin@1234）登录 | 跳转到 Dashboard | ☐ |
| 4 | 点击右上角 Logout | 跳转回 `/login` | ☐ |
| 5 | 重新登录 | Dashboard 正常显示 | ☐ |

#### 1.2 Dashboard

| # | 测试步骤 | 预期结果 | 通过 |
|---|----------|----------|------|
| 6 | 查看 Dashboard 数字统计 | 有数字（不是空白或 N/A） | ☐ |
| 7 | 查看日志无报错 | ERP logs 无 500 / Exception | ☐ |

#### 1.3 Sidebar 导航

| # | 测试步骤 | 预期结果 | 通过 |
|---|----------|----------|------|
| 8 | 点击所有侧边栏菜单 | 每个页面均可进入，无 500 / 空白页 | ☐ |

---

### 二、Website Builder

**测试目标：数据库 → API → 前端 → 刷新 全链路**

#### 2.1 基础 CRUD

| # | 测试步骤 | 预期结果 | 通过 |
|---|----------|----------|------|
| 9 | 进入 ERP → Website Builder | 页面正常加载，显示现有 Section 列表 | ☐ |
| 10 | 点击「添加区块」→ 选择类型 → 确认 | Section 出现在列表中 | ☐ |
| 11 | 刷新页面 | 新增的 Section 仍然存在 | ☐ |
| 12 | 点击 Section 名称 → 编辑内容 → 保存 | 保存成功，内容更新 | ☐ |
| 13 | 刷新页面 | 编辑后的内容仍然保留 | ☐ |
| 14 | 点击删除 Section → 确认 | Section 从列表移除 | ☐ |
| 15 | 刷新页面 | 已删除的 Section 不再出现 | ☐ |

#### 2.2 排序 / 启用停用

| # | 测试步骤 | 预期结果 | 通过 |
|---|----------|----------|------|
| 16 | 拖动 Section 改变顺序 | 顺序更新成功 | ☐ |
| 17 | 刷新页面 | 排序保持 | ☐ |
| 18 | 点击启用/停用开关 | 状态切换成功 | ☐ |
| 19 | 打开 `https://apidemo.club` | Website 显示/隐藏对应 Section | ☐ |

---

### 三、Website 前台

| # | 测试步骤 | 预期结果 | 通过 |
|---|----------|----------|------|
| 20 | 打开 `https://apidemo.club` | 首页正常显示，无 502 / 白屏 | ☐ |
| 21 | 查看 Banner 区域 | 显示正确的 Banner 图片 | ☐ |
| 22 | 查看 Announcement | 公告正常显示 | ☐ |
| 23 | 查看 Promotion | 优惠活动正常显示 | ☐ |
| 24 | 游戏区域（无游戏时） | 显示「Coming Soon」，不是空白或报错 | ☐ |
| 25 | 手机尺寸测试（F12 → 切换设备） | 页面 Responsive 正常 | ☐ |
| 26 | 检查 Logo / 品牌名称 | 与 ERP Brand Settings 一致 | ☐ |

---

### 四、会员管理

| # | 测试步骤 | 预期结果 | 通过 |
|---|----------|----------|------|
| 27 | 进入 ERP → 会员列表 | 列表正常加载 | ☐ |
| 28 | 搜索会员 | 搜索结果正确 | ☐ |
| 29 | 分页切换 | 下一页正常 | ☐ |
| 30 | 点击会员详情 | 详情页正常加载 | ☐ |

---

### 五、Deposit（存款审核）

| # | 测试步骤 | 预期结果 | 通过 |
|---|----------|----------|------|
| 31 | 进入 ERP → Deposit 列表 | 列表正常（即使没有数据也显示空状态） | ☐ |
| 32 | 查看日志 | 无 erp_unread 列错误 / 无 500 | ☐ |

---

### 六、Promotion 管理

| # | 测试步骤 | 预期结果 | 通过 |
|---|----------|----------|------|
| 33 | 进入 ERP → Promotion | 列表正常加载 | ☐ |
| 34 | 新增 Promotion | 保存成功 | ☐ |
| 35 | 刷新页面 | 新增 Promotion 仍存在 | ☐ |
| 36 | 打开 Website 首页 | Promotion 显示在前台 | ☐ |
| 37 | 删除 Promotion | 删除成功 | ☐ |

---

### 七、Brand Settings

| # | 测试步骤 | 预期结果 | 通过 |
|---|----------|----------|------|
| 38 | 进入 ERP → Brand Settings | 设置页正常加载 | ☐ |
| 39 | 修改 Brand Name → 保存 | 保存成功 | ☐ |
| 40 | 打开 Website 首页 | Website 显示新的 Brand Name | ☐ |
| 41 | 还原 Brand Name → 保存 | 还原成功 | ☐ |

---

### 八、API 全面检查

```bash
# 检查 ERP logs 中是否有未处理的错误
docker compose -f docker-compose.production.yml logs erp --tail 500 | \
  grep -iE "500|unhandled|exception|fatal|crash" | head -20

# 检查 Website logs
docker compose -f docker-compose.production.yml logs website --tail 500 | \
  grep -iE "500|unhandled|exception|fatal" | head -20
```

| # | 检查项 | 预期结果 | 通过 |
|---|--------|----------|------|
| 42 | ERP logs — 无 500 / Unhandled | 无异常 | ☐ |
| 43 | Website logs — 无 500 / Unhandled | 无异常 | ☐ |
| 44 | Nginx logs — 无 502 / 504 | 无错误 | ☐ |

---

### 九、Docker 最终状态

```bash
docker compose -f docker-compose.production.yml ps
```

| # | 检查项 | 预期结果 | 通过 |
|---|--------|----------|------|
| 45 | postgres — healthy | ✓ | ☐ |
| 46 | redis — running | ✓ | ☐ |
| 47 | erp — healthy | ✓ | ☐ |
| 48 | website — healthy | ✓ | ☐ |
| 49 | telegram-bot — running | ✓ | ☐ |
| 50 | nginx — healthy | ✓ | ☐ |
| 51 | migrate — exited (0) | ✓ | ☐ |

---

### 十、Nginx 最终确认

| # | 检查项 | 预期结果 | 通过 |
|---|--------|----------|------|
| 52 | `https://apidemo.club` | HTTP 200 | ☐ |
| 53 | `https://erp.apidemo.club/login` | HTTP 200 | ☐ |
| 54 | HTTP → HTTPS 重定向 | `http://apidemo.club` 跳转到 `https://` | ☐ |

---

## Production Acceptance Report 模板

测试完成后填写以下报告：

```
==================================================
Production Acceptance Report
日期：YYYY-MM-DD HH:MM
版本：git rev-parse --short HEAD
测试人：
==================================================

ERP 登录 / Dashboard        ☐ PASS  ☐ FAIL
Website Builder              ☐ PASS  ☐ FAIL
Website 前台                 ☐ PASS  ☐ FAIL
会员管理                      ☐ PASS  ☐ FAIL
Deposit 审核                 ☐ PASS  ☐ FAIL
Promotion 管理               ☐ PASS  ☐ FAIL
Brand Settings               ☐ PASS  ☐ FAIL
API 无异常                   ☐ PASS  ☐ FAIL
Docker 全部 Healthy          ☐ PASS  ☐ FAIL
Nginx 无 502 / 504           ☐ PASS  ☐ FAIL
Migration ExitCode=0         ☐ PASS  ☐ FAIL
日志无异常                    ☐ PASS  ☐ FAIL

==================================================
结论：☐ Production Stable ✓   ☐ 有问题需修复
备注：
==================================================
```

---

## 新功能上线标准

任何新功能（OTP、SMS、游戏平台 API 等）上线前必须：

1. **本地开发** — Mac 本地测试通过
2. **git push origin main**
3. **VPS 执行** `./scripts/deploy.sh` — 完整跑到 Production Ready
4. **自动检查** `./scripts/production-check.sh` — 全部 PASS
5. **人工测试** — 本清单全部 PASS
6. **填写 Acceptance Report**

缺少任何一步，不允许宣告 Production Stable。
