# Tesla88 / SSWIN88 Production 部署指南

## 服务器信息

| 项目 | 说明 |
|------|------|
| VPS IP | 45.77.169.133 (Vultr Ubuntu 24.04) |
| 仓库路径 | `~/tesla88-platform` |
| 主要域名 | `apidemo.club` (Website) |
| ERP 域名 | `erp.apidemo.club` |
| GitHub | `https://github.com/sswin123/tesla88-platform.git` |

---

## 日常 Demo 流程

### 方式一：有代码更新（推荐）

```bash
ssh root@45.77.169.133
cd ~/tesla88-platform
./scripts/deploy.sh
```

等待约 3–5 分钟，看到 `Production Ready ✓` 即可给客户 Demo。

Demo 完毕关闭：

```bash
./scripts/stop-production.sh
```

---

### 方式二：VPS 重开机，没有代码更新

```bash
ssh root@45.77.169.133
cd ~/tesla88-platform
./scripts/start-production.sh
```

约 30 秒启动完成。

---

## 脚本说明

| 脚本 | 用途 | 耗时 |
|------|------|------|
| `./scripts/deploy.sh` | 拉取最新代码 + Build + 启动 + 健康检查 | 3–5 分钟 |
| `./scripts/update-production.sh` | 同上（deploy 的别名，功能相同） | 3–5 分钟 |
| `./scripts/start-production.sh` | 快速启动（不 Build，使用已有镜像） | 30 秒 |
| `./scripts/stop-production.sh` | 停止全部服务（保留数据库） | 10 秒 |

---

## 首次部署（全新服务器）

```bash
# 1. 克隆仓库
git clone https://github.com/sswin123/tesla88-platform.git
cd tesla88-platform

# 2. 填写环境变量
cp .env.example .env
nano .env

# 3. 一键部署（含 SSL 证书生成）
chmod +x scripts/*.sh
./scripts/deploy.sh --fresh
```

---

## 更新代码后部署

**Mac 开发端：**
```bash
git add .
git commit -m "feat: xxx"
git push origin main
```

**VPS 端：**
```bash
ssh root@45.77.169.133
cd ~/tesla88-platform
./scripts/deploy.sh
```

---

## 查看日志

```bash
# 查看所有服务日志（实时）
docker compose -f docker-compose.production.yml logs -f

# 查看单个服务日志
docker compose -f docker-compose.production.yml logs -f erp
docker compose -f docker-compose.production.yml logs -f website
docker compose -f docker-compose.production.yml logs -f telegram-bot
docker compose -f docker-compose.production.yml logs -f nginx
docker compose -f docker-compose.production.yml logs -f migrate

# 只看最近 100 行
docker compose -f docker-compose.production.yml logs --tail=100 erp
```

---

## 查看服务状态

```bash
# 查看所有容器状态
docker compose -f docker-compose.production.yml ps

# 查看资源使用
docker stats
```

---

## 手动重新 Build

```bash
# 重建所有镜像并重启
docker compose -f docker-compose.production.yml up -d --build

# 只重建单个服务（更快）
docker compose -f docker-compose.production.yml up -d --build erp
docker compose -f docker-compose.production.yml up -d --build website
docker compose -f docker-compose.production.yml up -d --build telegram-bot
```

---

## 检查服务健康

```bash
# 方法一：查看 Docker 健康状态
docker compose -f docker-compose.production.yml ps

# 方法二：直接请求 API
curl -sk https://apidemo.club | head -5         # Website
curl -sk https://erp.apidemo.club | head -5     # ERP
curl http://localhost:8090/ping                  # Telegram Bot

# 方法三：查看 nginx 错误日志
docker compose -f docker-compose.production.yml logs nginx | tail -20
```

---

## Rollback 回滚到上一版本

```bash
cd ~/tesla88-platform

# 查看最近提交历史
git log --oneline -10

# 回滚到上一个版本
git reset --hard HEAD~1

# 或回滚到指定 commit（从 git log 复制 commit hash）
git reset --hard abc1234

# 重新部署回滚版本
docker compose -f docker-compose.production.yml up -d --build
```

**⚠ 注意：** 回滚代码不会回滚数据库。如果新版本有 Migration，回滚后数据库可能有额外的表/字段，但通常不影响旧版本运行。

如需完整回滚（含数据库）：

```bash
# 查看数据库备份
ls -la backups/auto/

# 还原备份（危险！会覆盖现有数据）
# docker compose -f docker-compose.production.yml exec -T postgres \
#   psql -U $POSTGRES_USER $POSTGRES_DB < backups/auto/2026-07-15-xxxx.sql
```

---

## 强制重建（清空 Build 缓存）

```bash
# 完整重建（较慢，约 10–15 分钟）
docker compose -f docker-compose.production.yml build --no-cache --parallel
docker compose -f docker-compose.production.yml up -d
```

---

## 完全重置（清空所有数据）

⚠ **危险操作！** 所有用户数据、数据库内容将被删除。

```bash
# 停止并删除所有容器、网络、Volume
docker compose -f docker-compose.production.yml down -v

# 重新部署（会执行所有 Migration 和 Seed）
./scripts/deploy.sh --fresh
```

---

## SSL 证书更新（Let's Encrypt）

目前使用自签名证书（浏览器会显示不安全）。

更换为 Let's Encrypt 真实证书：

```bash
# 安装 certbot
apt install -y certbot

# 临时停止 nginx 占用 80 端口
docker compose -f docker-compose.production.yml stop nginx

# 申请证书
certbot certonly --standalone \
  -d apidemo.club \
  -d www.apidemo.club \
  -d erp.apidemo.club \
  --email your@email.com --agree-tos

# 复制证书到项目
cp /etc/letsencrypt/live/apidemo.club/fullchain.pem nginx/ssl/apidemo.club.crt
cp /etc/letsencrypt/live/apidemo.club/privkey.pem   nginx/ssl/apidemo.club.key

# 重启 nginx
docker compose -f docker-compose.production.yml start nginx
```

---

## 常见问题排查

### Website / ERP 无法访问

```bash
# 检查 nginx 是否正常
docker compose -f docker-compose.production.yml logs nginx | tail -20

# 检查 SSL 证书
docker compose -f docker-compose.production.yml exec nginx ls /etc/nginx/ssl/
```

### Migration 失败

```bash
# 查看 Migration 日志
docker compose -f docker-compose.production.yml logs migrate

# 手动重新执行 Migration
docker compose -f docker-compose.production.yml run --rm migrate
```

### Telegram Bot 无法收发消息

```bash
# 检查 Bot 日志
docker compose -f docker-compose.production.yml logs telegram-bot | tail -30

# 验证 BOT_TOKEN
grep BOT_TOKEN .env
```

### ERP 登录失败（忘记密码）

```bash
# 查看当前管理员
docker compose -f docker-compose.production.yml exec postgres \
  psql -U $POSTGRES_USER $POSTGRES_DB \
  -c "SELECT erp_username, role FROM admins;"

# 通过 Seed 重置（如已存在则不覆盖）
docker compose -f docker-compose.production.yml run --rm migrate
```

---

## 端口说明

| 端口 | 服务 | 说明 |
|------|------|------|
| 80 | Nginx | HTTP（自动跳转 HTTPS） |
| 443 | Nginx | HTTPS |
| 8090 | Telegram Bot | Bot Relay（对外暴露） |
| 5432 | PostgreSQL | 仅内部网络 |
| 6379 | Redis | 仅内部网络 |

---

*最后更新：2026-07-15*
