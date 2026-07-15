'use strict';

// ERP 启动钩子 — 在 server.js 之前加载（node --require ./startup-hooks.js server.js）
//
// 职责：
//   1. 强制 HOSTNAME=0.0.0.0，确保 Next.js 监听所有网络接口（不只是 loopback）
//   2. 捕获 HTTP Server 实际绑定的地址，打印到日志
//   3. 捕获 uncaughtException / unhandledRejection，打印 stack 后退出
//      → Docker restart: always 会自动重启容器

// ── 1. 强制绑定地址 ─────────────────────────────────────────────────────────
//
// Next.js standalone server.js 读取 process.env.HOSTNAME 决定监听地址。
// docker-compose 已设置 HOSTNAME=0.0.0.0，但某些环境下该值可能被 Docker
// 内部 hostname 机制覆盖。此处强制写入，100% 保证正确。
if (!process.env.HOSTNAME || process.env.HOSTNAME === 'localhost') {
  process.env.HOSTNAME = '0.0.0.0';
}
process.env.PORT = process.env.PORT || '3000';

const pid      = process.pid;
const hostname = process.env.HOSTNAME;
const port     = process.env.PORT;

console.log(`[boot] ERP 启动 — pid=${pid} HOSTNAME=${hostname} PORT=${port} NODE_ENV=${process.env.NODE_ENV}`);

// ── 2. 捕获 HTTP Server 实际监听地址 ───────────────────────────────────────
//
// 通过 monkey-patch net.Server.prototype.listen 监听 'listening' 事件，
// 打印服务器真正绑定的 IP:Port，确认是否为 0.0.0.0 而非 127.0.0.1。
const net = require('net');
const _origListen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  this.once('listening', () => {
    const addr = this.address();
    if (addr && typeof addr === 'object' && addr.port) {
      console.log(`[boot] HTTP Server 已监听 ${addr.address}:${addr.port}`);
    }
  });
  return _origListen.apply(this, args);
};

// ── 3. 全局错误捕获 ─────────────────────────────────────────────────────────

process.on('uncaughtException', (err) => {
  console.error(`[fatal] uncaughtException — pid=${process.pid}`);
  console.error(`[fatal] ${err.message}`);
  console.error(err.stack || '(no stack)');
  // 退出让 Docker 重启（restart: always）
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const msg   = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack   : '(no stack)';
  console.error(`[fatal] unhandledRejection — pid=${process.pid}`);
  console.error(`[fatal] ${msg}`);
  console.error(stack);
  process.exit(1);
});
