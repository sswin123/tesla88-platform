export function register() {
  const REQUIRED: string[] = [
    'DATABASE_URL',
    'JWT_SECRET',
    'BOT_RELAY_AUTH_TOKEN',
  ];

  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    const list = missing.join(', ');
    console.error(`\n[FATAL] Missing required environment variables: ${list}`);
    console.error('[FATAL] Copy .env.example to erp/.env and fill in all values.\n');
    process.exit(1);
  }

  // process 级错误处理仅在 Node.js 运行时注册（不在 Edge Runtime）
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // 防止重复注册
    if (!(global as Record<string, unknown>).__erpHooksRegistered) {
      (global as Record<string, unknown>).__erpHooksRegistered = true;

      process.on('uncaughtException', (err) => {
        console.error(`[fatal] uncaughtException — pid=${process.pid}`);
        console.error(`[fatal] ${err.message}`);
        console.error(err.stack || '(no stack)');
        process.exit(1);
      });

      process.on('unhandledRejection', (reason) => {
        const msg   = reason instanceof Error ? reason.message : String(reason);
        const stack = reason instanceof Error ? (reason as Error).stack : '(no stack)';
        console.error(`[fatal] unhandledRejection — pid=${process.pid}`);
        console.error(`[fatal] ${msg}`);
        console.error(stack);
        process.exit(1);
      });
    }
  }
}

// Next.js 15: 统一捕获所有 Route Handler / Page / Action 抛出的错误
export function onRequestError(
  err: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string },
) {
  const e     = err instanceof Error ? err : new Error(String(err));
  const path  = request.path  ?? '(unknown)';
  const method = request.method ?? 'GET';
  const route = context.routePath ?? path;
  const type  = context.routeType ?? context.routerKind ?? '';

  console.error(
    `[route-error] ${method} ${path} — ${route} (${type})\n` +
    `  ${e.message}\n` +
    (e.stack ?? ''),
  );
}
