#!/bin/sh
# nginx-certgen.sh — certgen 容器入口，首次部署时生成自签名 SSL 证书。
#
# 此脚本在 alpine 容器内执行（包含 apk 包管理器）。
# nginx 容器通过 depends_on: certgen: service_completed_successfully 等待证书就绪。
#
# 生产环境建议：
#   使用 Let's Encrypt 或 Cloudflare 证书替换 ./nginx/ssl/ 中的自签名证书，
#   然后执行 docker compose restart nginx 使其生效。
#   参见 DEPLOY.md 的 "SSL 证书" 章节。
set -e

SSL_DIR=/ssl
CERT="${SSL_DIR}/apidemo.club.crt"
KEY="${SSL_DIR}/apidemo.club.key"

if [ ! -f "${CERT}" ] || [ ! -f "${KEY}" ]; then
    echo "=== [certgen] 未找到 SSL 证书，生成自签名证书 ==="
    apk add --no-cache openssl >/dev/null 2>&1
    mkdir -p "${SSL_DIR}"
    openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
        -keyout "${KEY}" \
        -out "${CERT}" \
        -subj "/CN=apidemo.club/O=SSWIN88/C=MY" 2>/dev/null
    echo "=== [certgen] 自签名证书已生成（有效期 10 年） ==="
    echo "=== [certgen] 浏览器会显示安全警告，部署正式证书后可消除 ==="
else
    echo "=== [certgen] SSL 证书已存在，跳过生成 ==="
fi
