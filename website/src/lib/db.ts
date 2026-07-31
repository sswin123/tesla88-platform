import { Pool } from 'pg';

const pool = new Pool({
  host:     process.env.DB_HOST     ?? 'localhost',
  port:     parseInt(process.env.DB_PORT ?? '5432'),
  database: process.env.DB_NAME     ?? 'erp_db',
  user:     process.env.DB_USER     ?? 'postgres',
  password: process.env.DB_PASSWORD,
  max: 20,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  console.error('[pool] client error', err.message);
});

// Log when waiting queue is non-zero — early warning for pool exhaustion
pool.on('acquire', () => {
  if (pool.waitingCount > 0) {
    console.warn(`[pool] acquire — waiting=${pool.waitingCount} total=${pool.totalCount} idle=${pool.idleCount}`);
  }
});

export default pool;
