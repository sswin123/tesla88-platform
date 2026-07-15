#!/usr/bin/env bash
# update-production.sh — 拉取最新代码并重新 Build 部署
#
# 适用场景：
#   Mac 开发完成 → git push origin main → VPS 执行此脚本
#
# 用法：
#   ./scripts/update-production.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/deploy.sh" "$@"
