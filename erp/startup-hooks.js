'use strict';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ERP 全量诊断钩子  (node --require ./startup-hooks.js server.js)
//
// ① Node Process — PID, HOSTNAME, Memory, Signal, Exit
// ② Next.js — 全链路错误打印（uncaughtException / unhandledRejection / warning）
// ③ HTTP Server — 监听地址 / 活跃连接数追踪
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 统一日志（写 stderr，不被 Next.js stdout buffer 干扰）
function _log(tag, msg) {
  const ts = new Date().toISOString();
  process.stderr.write(`${ts} [ERP:${tag}] ${msg}\n`);
}

// ─── ① 进程基本信息 ──────────────────────────────────────────────────────────

if (!process.env.HOSTNAME || process.env.HOSTNAME === 'localhost') {
  process.env.HOSTNAME = '0.0.0.0';
}
process.env.PORT = process.env.PORT || '3000';

const START_TIME = Date.now();

_log('BOOT', '═══════════════════════════════════════════════════');
_log('BOOT', `pid=${process.pid}  node=${process.version}  NODE_ENV=${process.env.NODE_ENV}`);
_log('BOOT', `HOSTNAME=${process.env.HOSTNAME}  PORT=${process.env.PORT}`);
_log('BOOT', '═══════════════════════════════════════════════════');

function memReport(tag) {
  const m  = process.memoryUsage();
  const mb = v => Math.round(v / 1024 / 1024);
  const up = Math.round(process.uptime());
  _log(tag, `memory rss=${mb(m.rss)}MB heapUsed=${mb(m.heapUsed)}MB heapTotal=${mb(m.heapTotal)}MB external=${mb(m.external)}MB uptime=${up}s`);
}

memReport('BOOT');

// 每 60 秒打印内存快照（定位内存泄漏导致的 OOM kill）
const _memTimer = setInterval(() => { memReport('MEM'); }, 60_000);
_memTimer.unref();

// ─── ② HTTP Server 监听地址 & 连接追踪 ───────────────────────────────────────

const net = require('net');
let _activeConn = 0;

const _origListen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  this.once('listening', () => {
    const addr = this.address();
    if (addr && typeof addr === 'object' && addr.port) {
      _log('BOOT', `HTTP Server listening on ${addr.address}:${addr.port}`);
      memReport('BOOT');
    }
  });
  // 追踪 TCP 连接数（排查 keepalive 堆积 / 连接泄漏）
  this.on('connection', (sock) => {
    _activeConn++;
    sock.once('close', () => { _activeConn--; });
  });
  return _origListen.apply(this, args);
};

// 每 60 秒打印活跃 TCP 连接数
const _connTimer = setInterval(() => {
  _log('CONN', `activeConnections=${_activeConn}`);
}, 60_000);
_connTimer.unref();

// ─── ③ 进程退出 / Signal ─────────────────────────────────────────────────────

process.on('exit', (code) => {
  const dur = Math.round((Date.now() - START_TIME) / 1000);
  _log('EXIT', `pid=${process.pid} exitCode=${code} uptime=${dur}s`);
  memReport('EXIT');
});

// SIGTERM — Docker stop
process.on('SIGTERM', () => {
  _log('SIGNAL', `SIGTERM received — pid=${process.pid} uptime=${Math.round(process.uptime())}s`);
  memReport('SIGNAL');
  process.exit(0);
});

process.on('SIGINT', () => {
  _log('SIGNAL', `SIGINT received — pid=${process.pid} uptime=${Math.round(process.uptime())}s`);
  process.exit(0);
});

process.on('SIGHUP', () => {
  _log('SIGNAL', `SIGHUP received — pid=${process.pid} uptime=${Math.round(process.uptime())}s`);
});

// SIGABRT / SIGSEGV / SIGBUS — 进程崩溃（尽力记录）
['SIGABRT', 'SIGSEGV', 'SIGBUS'].forEach(sig => {
  try {
    process.on(sig, () => {
      _log('CRASH', `${sig} — pid=${process.pid} uptime=${Math.round(process.uptime())}s`);
      memReport('CRASH');
    });
  } catch { /* 某些平台不支持捕获，忽略 */ }
});

// ─── ④ 全局未捕获错误 ────────────────────────────────────────────────────────

process.on('uncaughtException', (err, origin) => {
  _log('FATAL', `━━━ uncaughtException ━━━`);
  _log('FATAL', `origin=${origin}  pid=${process.pid}  uptime=${Math.round(process.uptime())}s`);
  _log('FATAL', `name=${err.name}  message=${err.message}`);
  if (err.code)  _log('FATAL', `code=${err.code}`);
  if (err.cause) _log('FATAL', `cause=${String(err.cause)}`);
  _log('FATAL', err.stack || '(no stack)');
  memReport('FATAL');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  _log('FATAL', `━━━ unhandledRejection ━━━`);
  _log('FATAL', `pid=${process.pid}  uptime=${Math.round(process.uptime())}s`);
  if (reason instanceof Error) {
    _log('FATAL', `name=${reason.name}  message=${reason.message}`);
    if (reason.code)  _log('FATAL', `code=${reason.code}`);
    if (reason.cause) _log('FATAL', `cause=${String(reason.cause)}`);
    _log('FATAL', reason.stack || '(no stack)');
  } else {
    _log('FATAL', `reason=${String(reason)}`);
  }
  memReport('FATAL');
  process.exit(1);
});

// Node deprecation / memory pressure warnings
process.on('warning', (w) => {
  _log('WARN', `${w.name}: ${w.message}`);
  if (w.stack) _log('WARN', w.stack);
});
