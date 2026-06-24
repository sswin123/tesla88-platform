import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import * as readline from 'readline';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (prompt: string) =>
  new Promise<string>((resolve) => rl.question(prompt, resolve));

async function main() {
  const telegramId = (await ask('Telegram ID (must already exist in admins table): ')).trim();
  const erpUsername = (await ask('ERP Username: ')).trim();
  const password = (await ask('Password: ')).trim();

  if (!telegramId || !erpUsername || !password) {
    console.error('All fields are required.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // Verify the bot admin exists
  const { rows: existing } = await pool.query(
    'SELECT id, role FROM admins WHERE telegram_id = $1',
    [BigInt(telegramId)]
  );
  if (!existing[0]) {
    console.error(`No admin found with telegram_id=${telegramId}. Add them via the bot first.`);
    await pool.end();
    rl.close();
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);

  await pool.query(
    `UPDATE admins
     SET erp_username = $1, erp_password_hash = $2, is_active = TRUE
     WHERE telegram_id = $3`,
    [erpUsername, hash, BigInt(telegramId)]
  );

  console.log(`✅ ERP credentials set for admin id=${existing[0].id} role=${existing[0].role} (telegram_id=${telegramId}).`);
  console.log(`   ERP username: ${erpUsername}`);
  await pool.end();
  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
