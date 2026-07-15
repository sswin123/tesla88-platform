# 生产部署指南

## 架构概览

| 服务 | 镜像 | 功能 |
|------|------|------|
| postgres | postgres:14-alpine | 主数据库 |
| redis | redis:7-alpine | 缓存 / 会话 |
| migrate | postgres:14-alpine | 一次性迁移任务（run-once）|
| erp | 本地构建 | ERP 管理后台（Next.js） |
| website | 本地构建 | 会员门户（Next.js） |
| telegram-bot | 本地构建 | Telegram 机器人 + Relay |
| nginx | nginx:alpine | 反向代理 + SSL 终止 |

域名配置（VPS: 45.77.169.133）：
- 会员门户：`https://apidemo.club`
- API / ERP API：`https://api.apidemo.club`
- ERP 管理后台：`https://erp.apidemo.club`

---

## 前置要求

### 1. 服务器

- Ubuntu 22.04 LTS（推荐）
- 2 vCPU / 4 GB RAM / 40 GB SSD 以上
- Docker 24+、Docker Compose v2

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

### 2. DNS 记录

在 DNS 服务商（Cloudflare 等）添加以下 A 记录，全部指向 VPS IP：

| 记录 | 值 |
|------|----|
| `apidemo.club` | 45.77.169.133 |
| `www.apidemo.club` | 45.77.169.133 |
| `api.apidemo.club` | 45.77.169.133 |
| `erp.apidemo.club` | 45.77.169.133 |

### 3. 防火墙

```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

---

## 首次部署

### Step 1 — 克隆代码

```bash
git clone https://github.com/sswin123/tesla88-platform.git /opt/tesla88
cd /opt/tesla88
```

### Step 2 — 配置环境变量

```bash
cp .env.example .env
nano .env
```

必填项：

```env
# PostgreSQL
POSTGRES_DB=member_bot
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<强密码>

# JWT（分别生成，不能相同）
JWT_SECRET=$(openssl rand -hex 32)
MEMBER_JWT_SECRET=$(openssl rand -hex 32)

# Telegram
BOT_TOKEN=<来自 @BotFather>
SUPER_ADMIN_ID=<你的 Telegram 数字 ID>
ADMIN_CHAT_ID=<财务群组 Chat ID>
SUPPORT_CHAT_ID=<客服群组 Chat ID>
CS_USERNAME=<客服账号用户名>

# Bot Relay 共享密钥
BOT_RELAY_AUTH_TOKEN=$(openssl rand -hex 24)

# 网站 URL
SITE_URL=https://apidemo.club
```

### Step 3 — 构建并启动所有服务

```bash
docker compose -f docker-compose.production.yml up -d --build
```

> **首次启动时间约 3–5 分钟**（构建 Next.js 镜像）

### Step 4 — 验证所有服务健康

```bash
docker compose -f docker-compose.production.yml ps
```

预期状态：

```
postgres       Up (healthy)
redis          Up (healthy)
migrate        Exited (0)          ← 一次性任务，正常退出
erp            Up (healthy)
website        Up (healthy)
telegram-bot   Up (healthy)
nginx          Up (healthy)
```

若某服务异常，查看日志：

```bash
docker compose -f docker-compose.production.yml logs <service-name> --tail=50
```

---

## SSL 证书

### 自签名证书（自动）

**首次部署时，若 `./nginx/ssl/` 目录不存在证书，nginx 会自动生成自签名证书。**

- 无需任何手动操作，部署后 nginx 即可正常运行
- 自签名证书有效期 10 年
- 浏览器会显示"不安全"警告（这是预期行为，不影响功能）

证书文件保存于宿主机：
```
./nginx/ssl/apidemo.club.crt
./nginx/ssl/apidemo.club.key
```

### Let's Encrypt 正式证书（推荐）

安装正式证书可消除浏览器安全警告，步骤如下：

**方法 A（推荐）：Certbot + nginx 插件**

```bash
# 安装 certbot
sudo apt install certbot python3-certbot-nginx -y

# 临时停止 nginx 容器，释放 80/443 端口
docker compose -f docker-compose.production.yml stop nginx

# 获取证书
sudo certbot certonly --standalone \
  -d apidemo.club \
  -d www.apidemo.club \
  -d api.apidemo.club \
  -d erp.apidemo.club \
  --email admin@apidemo.club \
  --agree-tos --non-interactive

# 复制证书到 nginx ssl 目录
mkdir -p ./nginx/ssl
sudo cp /etc/letsencrypt/live/apidemo.club/fullchain.pem ./nginx/ssl/apidemo.club.crt
sudo cp /etc/letsencrypt/live/apidemo.club/privkey.pem   ./nginx/ssl/apidemo.club.key
sudo chown $USER:$USER ./nginx/ssl/*

# 重启 nginx
docker compose -f docker-compose.production.yml start nginx
```

**方法 B：Cloudflare Origin Certificate**

1. Cloudflare 控制台 → SSL/TLS → Origin Server → Create Certificate
2. 下载证书和私钥
3. 保存为 `./nginx/ssl/apidemo.club.crt` 和 `./nginx/ssl/apidemo.club.key`
4. 重启 nginx：`docker compose -f docker-compose.production.yml restart nginx`

### 证书自动续期（Let's Encrypt）

```bash
# 添加 crontab 自动续期（每月 1 号凌晨 3 点执行）
echo "0 3 1 * * certbot renew --quiet && \
  cp /etc/letsencrypt/live/apidemo.club/fullchain.pem /opt/tesla88/nginx/ssl/apidemo.club.crt && \
  cp /etc/letsencrypt/live/apidemo.club/privkey.pem /opt/tesla88/nginx/ssl/apidemo.club.key && \
  docker compose -f /opt/tesla88/docker-compose.production.yml restart nginx" \
  | sudo crontab -
```

---

## 更新部署

```bash
cd /opt/tesla88
git pull origin main
docker compose -f docker-compose.production.yml up -d --build
```

> 只有修改过的服务会重新构建和重启。迁移脚本会自动检测并只执行新的 SQL 文件。

---

## 日常运维

### 查看服务状态

```bash
docker compose -f docker-compose.production.yml ps
```

### 查看日志

```bash
# 所有服务
docker compose -f docker-compose.production.yml logs -f

# 单个服务
docker compose -f docker-compose.production.yml logs erp --tail=100
docker compose -f docker-compose.production.yml logs telegram-bot --tail=100
docker compose -f docker-compose.production.yml logs nginx --tail=50
```

### 健康检查

```bash
# ERP 综合健康（数据库 + Bot + Website）
curl https://api.apidemo.club/api/health/system

# ERP 存活检查（仅确认进程运行）
curl https://api.apidemo.club/api/ping

# Bot Relay
curl http://127.0.0.1:8090/health
```

### 数据库备份

```bash
# 手动备份
docker exec telegram-member-bot-postgres-1 \
  pg_dump -U postgres member_bot | \
  gzip > /opt/backups/backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

---

## 迁移说明

迁移由 `migrate` 服务自动处理，基于 `schema_migrations` 追踪表实现幂等性：

- **首次部署**：执行所有 SQL 文件（000–048），标记为已执行
- **后续部署**：只执行新增 SQL 文件，跳过已执行的
- **已迁移数据库**（旧版无追踪表）：自动检测并补录历史记录，不重复执行

任何 SQL 报错会立即终止迁移并返回非零退出码，ERP 和 Bot 不会启动。

---

## 回滚

```bash
# 回滚到上一个 git commit
git log --oneline -5        # 查看历史版本
git checkout <commit-hash>  # 切换版本
docker compose -f docker-compose.production.yml up -d --build

# 回滚到指定 git tag
git checkout v1.0.0
docker compose -f docker-compose.production.yml up -d --build
```

**数据库回滚**：在每次 `git pull` 前先备份数据库（见"数据库备份"章节）。
