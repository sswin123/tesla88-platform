export function register() {
  const REQUIRED: string[] = [
    'DB_PASSWORD',
    'MEMBER_JWT_SECRET',
  ];

  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    const list = missing.join(', ');
    // eslint-disable-next-line no-console
    console.error(`\n[FATAL] Missing required environment variables: ${list}`);
    console.error('[FATAL] Copy .env.example to website/.env and fill in all values.\n');
    process.exit(1);
  }
}
