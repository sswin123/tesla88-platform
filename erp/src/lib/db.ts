import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_SSL === 'true'
      ? { rejectUnauthorized: false }
      : false,
  max: 10,
  idleTimeoutMillis:     30_000,
  connectionTimeoutMillis: 5_000,
});

// Kill any query that runs longer than 15 s — prevents connection starvation
pool.on('connect', (client) => {
  client.query("SET statement_timeout = '15s'").catch(() => {});
});

export default pool;
